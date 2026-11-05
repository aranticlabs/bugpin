import { withEffectiveBranding } from '../utils/effective-branding.js';
import nodemailer from 'nodemailer';
import { settingsCacheService } from './settings-cache.service.js';
import { logger } from '../utils/logger.js';
import { templateService } from './template.service.js';
import {
  defaultEmailTemplates,
  appendFooterToHtml,
  applyBrandColor,
  DEFAULT_BRAND_COLOR,
} from '../constants/email-templates.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { getStatusLabel, getPriorityLabel, formatReportDate } from '../i18n/labels.js';
import type {
  Report,
  EmailTemplate,
  EmailTemplateType,
  LocaleCode,
  ReportStatus,
  ReportPriority,
  CustomEmailTemplates,
} from '@shared/types';

// Types

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  to: EmailRecipient[];
  subject: string;
  html: string;
  text?: string;
}

export interface ReportEmailData {
  report: Report;
  projectName: string;
  reportUrl: string;
}

export interface SMTPConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

export function resolveTemplate(
  type: EmailTemplateType,
  locale: LocaleCode,
  overrides?: CustomEmailTemplates
): EmailTemplate {
  const overriddenForType = overrides?.[type];
  const overriddenForLocale = overriddenForType?.[locale];
  if (overriddenForLocale) return overriddenForLocale;
  const def = defaultEmailTemplates[type];
  return def[locale] ?? overriddenForType?.en ?? def.en;
}

async function loadOverridesFromEE(): Promise<CustomEmailTemplates | undefined> {
  const overrides = await getEEHooks().getCustomEmailTemplates();
  return overrides ?? undefined;
}

// Service

export const emailService = {
  async appendFooter(html: string, type: EmailTemplateType): Promise<string> {
    const whiteLabel = await getEEHooks().getWhiteLabelService()?.getConfig();
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    let branded = appendFooterToHtml(html, type, whiteLabel);
    if (settings.branding?.logoLightUrl && settings.appUrl) {
      try {
        const url = new URL(settings.branding.logoLightUrl, settings.appUrl);
        if (['http:', 'https:'].includes(url.protocol)) {
          const logo = templateService.compileTemplate(
            '<img src="{{logo.url}}" alt="{{app.name}}" style="max-width:240px;max-height:80px" />',
            { logo: { url: url.href }, app: { name: settings.appName } }
          );
          branded = branded.replace('<div class="header">', `<div class="header">${logo}`);
        }
      } catch {
        /* An absolute application URL is required for email assets. */
      }
    }
    return branded;
  },

  createTransporter(config: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }) {
    return nodemailer.createTransport({
      ...config,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  },

  /**
   * Send an email using configured SMTP settings
   */
  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
    try {
      // Load SMTP settings
      const settings = withEffectiveBranding(await settingsCacheService.getAll());

      logger.debug('sendEmail called', {
        recipientCount: options.to.length,
        recipients: options.to.map((r) => r.email),
        subject: options.subject,
        smtpEnabled: settings.smtpEnabled,
        smtpHost: settings.smtpConfig.host || '(not set)',
        smtpFrom: settings.smtpConfig.from || '(not set)',
      });

      if (!settings.smtpEnabled) {
        logger.info('SMTP disabled, skipping email send');
        return { success: false, error: 'SMTP is disabled' };
      }

      if (!settings.smtpConfig.host || !settings.smtpConfig.from) {
        logger.warn('SMTP not configured properly');
        return {
          success: false,
          error: 'SMTP not configured properly. Please configure host and from address.',
        };
      }

      const transporter = this.createTransporter({
        host: sanitizeSmtpHost(settings.smtpConfig.host),
        port: settings.smtpConfig.port || 587,
        secure: settings.smtpConfig.port === 465,
        auth: settings.smtpConfig.user
          ? {
              user: settings.smtpConfig.user,
              pass: settings.smtpConfig.password || '',
            }
          : undefined,
      });

      // Send individual emails per recipient in batches to avoid overwhelming the SMTP server
      const fromAddress = `"${settings.appName || 'BugPin'}" <${settings.smtpConfig.from}>`;
      const batchSize = 10;
      let failures = 0;

      for (let i = 0; i < options.to.length; i += batchSize) {
        const batch = options.to.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((recipient) =>
            transporter.sendMail({
              from: fromAddress,
              to: recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email,
              subject: options.subject,
              html: options.html,
              text: options.text,
            })
          )
        );

        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'rejected') {
            failures++;
            logger.warn('Failed to send email to recipient', {
              email: batch[j].email,
              error: (results[j] as PromiseRejectedResult).reason,
            });
          }
        }
      }

      if (failures || !options.to.length) {
        return {
          success: false,
          error: `${failures} of ${options.to.length} recipients failed; ${options.to.length - failures} sent`,
        };
      }

      logger.info('Email sent successfully', {
        to: options.to.map((r) => r.email),
        subject: options.subject,
      });

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as Record<string, unknown>).message)
            : String(error);
      logger.error('Failed to send email', undefined, { error: message });
      return { success: false, error: message };
    }
  },

  /**
   * Resolve a template for the requested locale, applying EE custom overrides if present.
   */
  async getTemplate(
    templateType: EmailTemplateType,
    locale: LocaleCode = 'en'
  ): Promise<EmailTemplate> {
    const overrides = await loadOverridesFromEE();
    return resolveTemplate(templateType, locale, overrides);
  },

  /**
   * Send notification email for new report
   */
  async sendNewReportNotification(
    recipients: EmailRecipient[],
    data: ReportEmailData
  ): Promise<{ success: boolean; error?: string }> {
    const teamLocale: LocaleCode = 'en';
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, reportUrl } = data;

    const template = await this.getTemplate('newReport', teamLocale);
    const templateData = {
      app: {
        name: settings.appName || 'BugPin',
        url: settings.appUrl || '',
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, teamLocale),
        priority: report.priority,
        priorityFormatted: getPriorityLabel(report.priority as ReportPriority, teamLocale),
        url: reportUrl,
        pageUrl: report.metadata?.url || '',
        createdAt: formatReportDate(report.createdAt, teamLocale),
      },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'newReport');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  },

  /**
   * Send notification email for report status change
   */
  async sendStatusChangeNotification(
    recipients: EmailRecipient[],
    data: ReportEmailData & { oldStatus: string; newStatus: string }
  ): Promise<{ success: boolean; error?: string }> {
    const teamLocale: LocaleCode = 'en';
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, reportUrl, oldStatus, newStatus } = data;

    const template = await this.getTemplate('statusChange', teamLocale);
    const templateData = {
      app: {
        name: settings.appName || 'BugPin',
        url: settings.appUrl || '',
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        url: reportUrl,
      },
      oldStatus,
      oldStatusFormatted: getStatusLabel(oldStatus as ReportStatus, teamLocale),
      newStatus,
      newStatusFormatted: getStatusLabel(newStatus as ReportStatus, teamLocale),
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'statusChange');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  },

  /**
   * Send notification email for report priority change
   */
  async sendPriorityChangeNotification(
    recipients: EmailRecipient[],
    data: ReportEmailData & { oldPriority: string; newPriority: string }
  ): Promise<{ success: boolean; error?: string }> {
    const teamLocale: LocaleCode = 'en';
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, reportUrl, oldPriority, newPriority } = data;

    const template = await this.getTemplate('priorityChange', teamLocale);
    const templateData = {
      app: {
        name: settings.appName || 'BugPin',
        url: settings.appUrl || '',
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        url: reportUrl,
      },
      oldPriority,
      oldPriorityFormatted: getPriorityLabel(oldPriority as ReportPriority, teamLocale),
      newPriority,
      newPriorityFormatted: getPriorityLabel(newPriority as ReportPriority, teamLocale),
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'priorityChange');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  },

  /**
   * Send notification email for report deletion
   */
  async sendReportDeletedNotification(
    recipients: EmailRecipient[],
    data: ReportEmailData
  ): Promise<{ success: boolean; error?: string }> {
    const teamLocale: LocaleCode = 'en';
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName } = data;

    const template = await this.getTemplate('reportDeleted', teamLocale);
    const templateData = {
      app: {
        name: settings.appName || 'BugPin',
        url: settings.appUrl || '',
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, teamLocale),
        priority: report.priority,
        priorityFormatted: getPriorityLabel(report.priority as ReportPriority, teamLocale),
      },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reportDeleted');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  },

  /**
   * Send notification email for report assignment
   */
  async sendAssignmentNotification(
    recipients: EmailRecipient[],
    data: ReportEmailData & { assignedToName: string; assignedToEmail?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const teamLocale: LocaleCode = 'en';
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, reportUrl, assignedToName, assignedToEmail } = data;

    const template = await this.getTemplate('assignment', teamLocale);
    const templateData = {
      app: {
        name: settings.appName || 'BugPin',
        url: settings.appUrl || '',
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        url: reportUrl,
      },
      assignee: {
        name: assignedToName,
        email: assignedToEmail || '',
      },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'assignment');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  },

  /**
   * Send confirmation email to reporter after submitting a report
   */
  async sendReporterConfirmationEmail(
    recipient: string,
    data: {
      report: Report;
      projectName: string;
      appName: string;
      appUrl: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, appName, appUrl } = data;
    const locale = report.reporterLocale ?? 'en';

    const template = await this.getTemplate('reporterConfirmation', locale);
    const templateData = {
      app: {
        name: appName,
        url: appUrl,
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, locale),
        priority: report.priority,
        priorityFormatted: getPriorityLabel(report.priority as ReportPriority, locale),
        createdAt: formatReportDate(report.createdAt, locale),
      },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reporterConfirmation');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: [{ email: recipient }],
      subject,
      html,
    });
  },

  /**
   * Send status change email to reporter
   */
  async sendReporterStatusChangeEmail(
    recipient: string,
    data: {
      report: Report;
      projectName: string;
      appName: string;
      appUrl: string;
      oldStatus: string;
      newStatus: string;
      reporterMessage?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, appName, appUrl, oldStatus, newStatus, reporterMessage } = data;
    const locale = report.reporterLocale ?? 'en';

    const template = await this.getTemplate('reporterStatusChange', locale);
    const templateData = {
      app: {
        name: appName,
        url: appUrl,
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, locale),
      },
      oldStatus,
      oldStatusFormatted: getStatusLabel(oldStatus as ReportStatus, locale),
      newStatus,
      newStatusFormatted: getStatusLabel(newStatus as ReportStatus, locale),
      reporterMessage: reporterMessage || '',
      reporterMessageDisplay: reporterMessage ? 'block' : 'none',
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reporterStatusChange');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: [{ email: recipient }],
      subject,
      html,
    });
  },

  /**
   * Send priority change email to reporter
   */
  async sendReporterPriorityChangeEmail(
    recipient: string,
    data: {
      report: Report;
      projectName: string;
      appName: string;
      appUrl: string;
      oldPriority: string;
      newPriority: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, appName, appUrl, oldPriority, newPriority } = data;
    const locale = report.reporterLocale ?? 'en';

    const template = await this.getTemplate('reporterPriorityChange', locale);
    const templateData = {
      app: {
        name: appName,
        url: appUrl,
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        priority: report.priority,
        priorityFormatted: getPriorityLabel(report.priority as ReportPriority, locale),
      },
      oldPriority,
      oldPriorityFormatted: getPriorityLabel(oldPriority as ReportPriority, locale),
      newPriority,
      newPriorityFormatted: getPriorityLabel(newPriority as ReportPriority, locale),
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reporterPriorityChange');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: [{ email: recipient }],
      subject,
      html,
    });
  },

  /**
   * Send assignment change email to reporter
   */
  async sendReporterAssignmentEmail(
    recipient: string,
    data: {
      report: Report;
      projectName: string;
      appName: string;
      appUrl: string;
      assigneeName: string;
      previousAssigneeName?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, appName, appUrl, assigneeName, previousAssigneeName } = data;
    const locale = report.reporterLocale ?? 'en';

    const template = await this.getTemplate('reporterAssignment', locale);
    const reportUrl = appUrl ? `${appUrl}/admin/reports/${report.id}` : '';
    const templateData = {
      app: {
        name: appName,
        url: appUrl,
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, locale),
        url: reportUrl,
      },
      assignee: {
        name: assigneeName,
      },
      previousAssigneeName: previousAssigneeName ?? '',
      previousAssigneeDisplay: previousAssigneeName ? 'block' : 'none',
      noPreviousAssigneeDisplay: previousAssigneeName ? 'none' : 'block',
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reporterAssignment');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: [{ email: recipient }],
      subject,
      html,
    });
  },

  /**
   * Send a direct message email to the reporter
   */
  async sendReporterMessageEmail(
    recipient: string,
    data: {
      report: Report;
      projectName: string;
      appName: string;
      appUrl: string;
      senderName: string;
      message: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, appName, appUrl, senderName, message } = data;
    const locale = report.reporterLocale ?? 'en';

    const template = await this.getTemplate('reporterMessage', locale);
    const templateData = {
      app: {
        name: appName,
        url: appUrl,
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, locale),
      },
      sender: {
        name: senderName,
      },
      message,
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reporterMessage');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: [{ email: recipient }],
      subject,
      html,
    });
  },

  /**
   * Send a CC copy of a reporter message to the sender
   */
  async sendReporterMessageCcEmail(
    recipient: string,
    data: {
      report: Report;
      projectName: string;
      appName: string;
      appUrl: string;
      senderName: string;
      message: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const { report, projectName, appName, appUrl, senderName, message } = data;
    const locale = report.reporterLocale ?? 'en';

    const template = await this.getTemplate('reporterMessage', locale);
    const templateData = {
      app: {
        name: appName,
        url: appUrl,
      },
      project: {
        name: projectName,
      },
      report: {
        title: report.title,
        description: report.description || '',
        status: report.status,
        statusFormatted: getStatusLabel(report.status as ReportStatus, locale),
      },
      sender: {
        name: senderName,
      },
      message,
    };

    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'reporterMessage');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    const subject = `[CC] Message sent to reporter - ${report.title}`;

    return this.sendEmail({
      to: [{ email: recipient }],
      subject,
      html,
    });
  },

  /**
   * Send invitation email to a new user
   */
  async sendInvitationEmail(
    recipient: EmailRecipient,
    data: { inviteUrl: string; inviterName: string; expiresInDays: number }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const appName = settings.appName || 'BugPin';

    const template = await this.getTemplate('invitation', 'en');
    const templateData = {
      app: {
        name: appName,
      },
      inviter: {
        name: data.inviterName,
      },
      invite: {
        url: data.inviteUrl,
        expiresInDays: data.expiresInDays,
      },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'invitation');
    const withFooterCompiled = templateService.compileTemplate(withFooter, templateData);
    const html = applyBrandColor(
      withFooterCompiled,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({
      to: [recipient],
      subject,
      html,
    });
  },

  async sendPasswordResetEmail(
    recipient: EmailRecipient,
    data: { resetUrl: string; expiresInHours: number }
  ): Promise<{ success: boolean; error?: string }> {
    const settings = withEffectiveBranding(await settingsCacheService.getAll());
    const appName = settings.appName || 'BugPin';

    const template = await this.getTemplate('passwordReset', 'en');
    const templateData = {
      app: { name: appName },
      user: { name: recipient.name ?? recipient.email },
      reset: { url: data.resetUrl, expiresInHours: data.expiresInHours },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = await this.appendFooter(compiledHtml, 'passwordReset');
    const html = applyBrandColor(
      templateService.compileTemplate(withFooter, templateData),
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
    );

    return this.sendEmail({ to: [recipient], subject, html });
  },

  /**
   * Send a test email to verify SMTP configuration
   */
  async sendTestEmail(
    config: SMTPConfig,
    recipientEmail: string,
    appName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!config.host || !config.from) {
        return { success: false, error: 'SMTP host and from address are required' };
      }

      const transporter = this.createTransporter({
        host: sanitizeSmtpHost(config.host),
        port: config.port || 587,
        secure: config.port === 465,
        auth: config.user
          ? {
              user: config.user,
              pass: config.password || '',
            }
          : undefined,
      });

      // Verify connection
      await transporter.verify();

      // Get template and compile
      const settings = withEffectiveBranding(await settingsCacheService.getAll());
      const resolvedAppName = appName || settings.appName || 'BugPin';
      const template = await this.getTemplate('testEmail', 'en');
      const templateData = {
        app: {
          name: resolvedAppName,
        },
      };

      const subject = templateService.compileTemplate(template.subject, templateData);
      const compiledHtml = templateService.compileTemplate(template.html, templateData);
      const withFooter = await this.appendFooter(compiledHtml, 'testEmail');
      const html = applyBrandColor(
        withFooter,
        settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
      );

      // Send test email
      await transporter.sendMail({
        from: `"${resolvedAppName}" <${config.from}>`,
        to: recipientEmail,
        subject,
        html,
        text: `This is a test email from ${resolvedAppName} to verify your SMTP configuration is working correctly.`,
      });

      logger.info('Test email sent successfully', { to: recipientEmail });
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as Record<string, unknown>).message)
            : String(error);
      logger.error('Failed to send test email', undefined, { error: message });
      return { success: false, error: message };
    }
  },
};

// Helper Functions

function sanitizeSmtpHost(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
