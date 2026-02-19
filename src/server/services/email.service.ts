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
import type { Report, EmailTemplateType } from '@shared/types';

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

// Service

export const emailService = {
  /**
   * Send an email using configured SMTP settings
   */
  async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
    try {
      // Load SMTP settings
      const settings = await settingsCacheService.getAll();

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

      const transporter = nodemailer.createTransport({
        host: settings.smtpConfig.host,
        port: settings.smtpConfig.port || 587,
        secure: settings.smtpConfig.port === 465,
        auth: settings.smtpConfig.user
          ? {
              user: settings.smtpConfig.user,
              pass: settings.smtpConfig.password || '',
            }
          : undefined,
      });

      await transporter.sendMail({
        from: `"${settings.appName}" <${settings.smtpConfig.from}>`,
        to: options.to.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', '),
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info('Email sent successfully', {
        to: options.to.map((r) => r.email),
        subject: options.subject,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send email', { error: message });
      return { success: false, error: message };
    }
  },

  /**
   * Get template for a specific type, using custom (via EE hooks) or default
   */
  async getTemplate(templateType: EmailTemplateType): Promise<{ subject: string; html: string }> {
    // Try to get custom template from EE (if licensed)
    const customTemplate = await getEEHooks().getCustomEmailTemplate(templateType);

    if (customTemplate) {
      return customTemplate;
    }

    return defaultEmailTemplates[templateType];
  },

  /**
   * Send notification email for new report
   */
  async sendNewReportNotification(
    recipients: EmailRecipient[],
    data: ReportEmailData,
  ): Promise<{ success: boolean; error?: string }> {
    const settings = await settingsCacheService.getAll();
    const { report, projectName, reportUrl } = data;

    const template = await this.getTemplate('newReport');
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
        statusFormatted: formatStatus(report.status),
        priority: report.priority,
        priorityFormatted: formatPriority(report.priority),
        url: reportUrl,
        pageUrl: report.metadata?.url || '',
        createdAt: new Date(report.createdAt).toLocaleString(),
      },
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = appendFooterToHtml(compiledHtml, 'newReport');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR,
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
    data: ReportEmailData & { oldStatus: string; newStatus: string },
  ): Promise<{ success: boolean; error?: string }> {
    const settings = await settingsCacheService.getAll();
    const { report, projectName, reportUrl, oldStatus, newStatus } = data;

    const template = await this.getTemplate('statusChange');
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
      oldStatusFormatted: formatStatus(oldStatus),
      newStatus,
      newStatusFormatted: formatStatus(newStatus),
    };

    const subject = templateService.compileTemplate(template.subject, templateData);
    const compiledHtml = templateService.compileTemplate(template.html, templateData);
    const withFooter = appendFooterToHtml(compiledHtml, 'statusChange');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR,
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
    data: ReportEmailData & { assignedToName: string; assignedToEmail?: string },
  ): Promise<{ success: boolean; error?: string }> {
    const settings = await settingsCacheService.getAll();
    const { report, projectName, reportUrl, assignedToName, assignedToEmail } = data;

    const template = await this.getTemplate('assignment');
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
    const withFooter = appendFooterToHtml(compiledHtml, 'assignment');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR,
    );

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  },

  /**
   * Send invitation email to a new user
   */
  async sendInvitationEmail(
    recipient: EmailRecipient,
    data: { inviteUrl: string; inviterName: string; expiresInDays: number },
  ): Promise<{ success: boolean; error?: string }> {
    const settings = await settingsCacheService.getAll();
    const appName = settings.appName || 'BugPin';

    const template = await this.getTemplate('invitation');
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
    const withFooter = appendFooterToHtml(compiledHtml, 'invitation');
    const html = applyBrandColor(
      withFooter,
      settings.branding?.primaryColor || DEFAULT_BRAND_COLOR,
    );

    return this.sendEmail({
      to: [recipient],
      subject,
      html,
    });
  },

  /**
   * Send a test email to verify SMTP configuration
   */
  async sendTestEmail(
    config: SMTPConfig,
    recipientEmail: string,
    appName: string = 'BugPin',
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!config.host || !config.from) {
        return { success: false, error: 'SMTP host and from address are required' };
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
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
      const settings = await settingsCacheService.getAll();
      const template = await this.getTemplate('testEmail');
      const templateData = {
        app: {
          name: appName,
        },
      };

      const subject = templateService.compileTemplate(template.subject, templateData);
      const compiledHtml = templateService.compileTemplate(template.html, templateData);
      const withFooter = appendFooterToHtml(compiledHtml, 'testEmail');
      const html = applyBrandColor(
        withFooter,
        settings.branding?.primaryColor || DEFAULT_BRAND_COLOR,
      );

      // Send test email
      await transporter.sendMail({
        from: `"${appName}" <${config.from}>`,
        to: recipientEmail,
        subject,
        html,
        text: `This is a test email from ${appName} to verify your SMTP configuration is working correctly.`,
      });

      logger.info('Test email sent successfully', { to: recipientEmail });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send test email', { error: message });
      return { success: false, error: message };
    }
  },
};

// Helper Functions

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return labels[status] || status;
}

function formatPriority(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
