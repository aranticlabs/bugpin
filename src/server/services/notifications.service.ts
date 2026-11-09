import {
  notificationPreferencesRepo,
  projectNotificationDefaultsRepo,
} from '../database/repositories/notification-preferences.repo.js';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { reporterCorrespondenceService } from './reporter-correspondence.service.js';
import type { ReporterEmailOptions } from './email.service.js';
import { emailService } from './email.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type {
  NotificationDefaultSettings,
  NotificationPreferences,
  ProjectNotificationDefaults,
  Project,
  Report,
  ReportStatus,
  ReportPriority,
  AppSettings,
  ProjectSettings,
  ReporterNotificationSettings,
} from '@shared/types';

// Types

export interface UpdateNotificationPreferencesInput {
  notifyOnNewReport?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnPriorityChange?: boolean;
  notifyOnAssignment?: boolean;
  notifyOnDeletion?: boolean;
  notifyOnReporterReply?: boolean;
  emailEnabled?: boolean;
}

export interface UpdateProjectNotificationDefaultsInput {
  defaultNotifyOnNewReport?: boolean;
  defaultNotifyOnStatusChange?: boolean;
  defaultNotifyOnPriorityChange?: boolean;
  defaultNotifyOnAssignment?: boolean;
  defaultNotifyOnDeletion?: boolean;
  defaultNotifyOnReporterReply?: boolean;
  defaultEmailEnabled?: boolean;
}

// Helpers

async function getGlobalNotificationDefaults(): Promise<NotificationDefaultSettings> {
  const settings = await settingsCacheService.getAll();
  return settings.notifications;
}

function getEffectiveReporterSettings(
  globalSettings: AppSettings,
  projectSettings?: ProjectSettings
): ReporterNotificationSettings {
  const globalReporter = globalSettings.reporterNotifications ?? {
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
    messagingEnabled: true,
  };

  // Legacy backward compat: if notifyReporter is explicitly false, disable all
  if (projectSettings?.notifyReporter === false) {
    return {
      emailEnabled: false,
      notifyOnNewReport: false,
      notifyOnStatusChange: false,
      notifyOnPriorityChange: false,
      notifyOnAssignment: false,
      messagingEnabled: false,
    };
  }

  // Project overrides take precedence over global
  const projectReporter = projectSettings?.reporterNotifications;
  return {
    emailEnabled: projectReporter?.emailEnabled ?? globalReporter.emailEnabled,
    notifyOnNewReport: projectReporter?.notifyOnNewReport ?? globalReporter.notifyOnNewReport,
    notifyOnStatusChange:
      projectReporter?.notifyOnStatusChange ?? globalReporter.notifyOnStatusChange,
    notifyOnPriorityChange:
      projectReporter?.notifyOnPriorityChange ?? globalReporter.notifyOnPriorityChange,
    notifyOnAssignment: projectReporter?.notifyOnAssignment ?? globalReporter.notifyOnAssignment,
    messagingEnabled: projectReporter?.messagingEnabled ?? globalReporter.messagingEnabled,
  };
}

interface ReporterContext {
  project: Project;
  settings: AppSettings;
  effective: ReporterNotificationSettings;
  recipient: string;
  correspondence: ReporterEmailOptions;
}

async function getReporterContext(
  report: Report,
  flag: keyof ReporterNotificationSettings,
  source?: 'confirmation' | 'invitation'
): Promise<ReporterContext | null> {
  const project = await projectsRepo.findById(report.projectId);
  if (!project) {
    logger.error('Project not found for reporter notification', { projectId: report.projectId });
    return null;
  }

  const settings = await settingsCacheService.getAll();
  const effective = getEffectiveReporterSettings(settings, project.settings);
  if (!effective.emailEnabled || !effective[flag]) {
    return null;
  }

  const correspondence = reporterCorrespondenceService.prepare(report, project, settings, source);
  if (!correspondence.success) {
    logger.warn('Could not prepare reporter email', { reportId: report.id });
    return null;
  }
  if (!correspondence.value) return null;
  return {
    project,
    settings,
    effective,
    recipient: correspondence.value.recipient,
    correspondence: correspondence.value.options,
  };
}

// Service

export const notificationsService = {
  /**
   * Get user's notification preferences for a project
   */
  async getUserPreferences(
    userId: string,
    projectId: string
  ): Promise<Result<NotificationPreferences>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    // Get or create preferences with defaults
    const preferences = await notificationPreferencesRepo.getOrCreate(
      userId,
      projectId,
      await getGlobalNotificationDefaults()
    );

    return Result.ok(preferences);
  },

  /** The instance-wide defaults that apply to every project without stored preferences */
  async getGlobalDefaults(): Promise<Result<NotificationDefaultSettings>> {
    return Result.ok(await getGlobalNotificationDefaults());
  },

  /**
   * Get all notification preferences for a user
   */
  async getAllUserPreferences(userId: string): Promise<Result<NotificationPreferences[]>> {
    const preferences = await notificationPreferencesRepo.findByUser(userId);
    return Result.ok(preferences);
  },

  /**
   * Update user's notification preferences for a project
   */
  async updateUserPreferences(
    userId: string,
    projectId: string,
    input: UpdateNotificationPreferencesInput
  ): Promise<Result<NotificationPreferences>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    const preferences = await notificationPreferencesRepo.upsert(
      userId,
      projectId,
      input,
      await getGlobalNotificationDefaults()
    );

    logger.info('User notification preferences updated', {
      userId,
      projectId,
    });

    return Result.ok(preferences);
  },

  /**
   * Get project notification defaults (admin only)
   */
  async getProjectDefaults(projectId: string): Promise<Result<ProjectNotificationDefaults | null>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    // Get project-specific defaults (or null if using global defaults)
    const defaults = await projectNotificationDefaultsRepo.findByProject(projectId);

    return Result.ok(defaults);
  },

  /**
   * Update project notification defaults (admin only)
   */
  async updateProjectDefaults(
    projectId: string,
    input: UpdateProjectNotificationDefaultsInput
  ): Promise<Result<ProjectNotificationDefaults>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    const defaults = await projectNotificationDefaultsRepo.upsert(projectId, input);

    logger.info('Project notification defaults updated', { projectId });

    return Result.ok(defaults);
  },

  /**
   * Delete project notification defaults (admin only)
   */
  async deleteProjectDefaults(projectId: string): Promise<Result<void>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    await projectNotificationDefaultsRepo.delete(projectId);

    logger.info('Project notification defaults deleted', { projectId });

    return Result.ok(undefined);
  },

  async notifyReporterActivity(report: Report, reporterId = report.reporterId): Promise<void> {
    try {
      const preferences = await notificationPreferencesRepo.findByProjectWithEmailEnabled(
        report.projectId,
        await getGlobalNotificationDefaults()
      );
      const users = await Promise.all(
        preferences
          .filter(
            (preference) =>
              preference.notifyOnReporterReply &&
              (!report.assignedTo || preference.userId === report.assignedTo)
          )
          .map((preference) => usersRepo.findById(preference.userId))
      );
      const actor = reporterId ? reportersRepo.findById(reporterId) : null;
      const recipients = users
        .filter(
          (user) =>
            user?.isActive &&
            (report.assignedTo || user.role === 'admin' || user.role === 'editor') &&
            (!actor || normalizeEmail(user.email) !== actor.email)
        )
        .map((user) => ({ email: user!.email, name: user!.name }));
      if (recipients.length === 0) return;
      const project = await projectsRepo.findById(report.projectId);
      if (!project) return;
      const result = await emailService.sendReporterActivityEmail(recipients, report, project.name);
      if (!result.success)
        logger.warn('Reporter activity notification failed', { reportId: report.id });
    } catch {
      logger.warn('Reporter activity notification failed', { reportId: report.id });
    }
  },

  /**
   * Send notification for a new report
   */
  async notifyNewReport(report: Report): Promise<void> {
    try {
      logger.debug('Starting new report notification', {
        reportId: report.id,
        projectId: report.projectId,
      });

      // Get all users with email notifications enabled for this project
      const preferences = await notificationPreferencesRepo.findByProjectWithEmailEnabled(
        report.projectId,
        await getGlobalNotificationDefaults()
      );

      logger.debug('Found notification preferences for project', {
        projectId: report.projectId,
        preferencesCount: preferences.length,
        preferences: preferences.map((p) => ({
          userId: p.userId,
          emailEnabled: p.emailEnabled,
          notifyOnNewReport: p.notifyOnNewReport,
        })),
      });

      // Filter users who want new report notifications
      const usersToNotify = preferences.filter((p) => p.notifyOnNewReport);

      if (usersToNotify.length === 0) {
        logger.info('No users to notify for new report', {
          reportId: report.id,
          projectId: report.projectId,
          totalPreferences: preferences.length,
        });
        return;
      }

      // Get user details and project info
      const users = await Promise.all(usersToNotify.map((p) => usersRepo.findById(p.userId)));
      const project = await projectsRepo.findById(report.projectId);

      if (!project) {
        logger.error('Project not found for notification', { projectId: report.projectId });
        return;
      }

      const recipients = users
        .filter((u) => u !== null)
        .map((u) => ({
          email: u!.email,
          name: u!.name,
        }));

      if (recipients.length === 0) {
        logger.debug('No valid recipients after user lookup', { reportId: report.id });
        return;
      }

      const settings = await settingsCacheService.getAll();
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/admin/reports/${report.id}`;

      const result = await emailService.sendNewReportNotification(recipients, {
        report,
        projectName: project.name,
        reportUrl,
      });

      if (result.success) {
        logger.info('New report notification sent', {
          reportId: report.id,
          recipientCount: recipients.length,
        });
      } else {
        logger.warn('New report notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send new report notification', {
        reportId: report.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * Send notification for report status change
   */
  async notifyStatusChange(report: Report, oldStatus: string, newStatus: string): Promise<void> {
    try {
      logger.debug('Starting status change notification', {
        reportId: report.id,
        projectId: report.projectId,
        oldStatus,
        newStatus,
      });

      const preferences = await notificationPreferencesRepo.findByProjectWithEmailEnabled(
        report.projectId,
        await getGlobalNotificationDefaults()
      );

      logger.debug('Found notification preferences for status change', {
        projectId: report.projectId,
        preferencesCount: preferences.length,
        preferences: preferences.map((p) => ({
          userId: p.userId,
          emailEnabled: p.emailEnabled,
          notifyOnStatusChange: p.notifyOnStatusChange,
        })),
      });

      const usersToNotify = preferences.filter((p) => p.notifyOnStatusChange);

      if (usersToNotify.length === 0) {
        logger.info('No users to notify for status change', {
          reportId: report.id,
          projectId: report.projectId,
          totalPreferences: preferences.length,
        });
        return;
      }

      const users = await Promise.all(usersToNotify.map((p) => usersRepo.findById(p.userId)));
      const project = await projectsRepo.findById(report.projectId);

      if (!project) {
        logger.error('Project not found for status change notification', {
          projectId: report.projectId,
        });
        return;
      }

      const recipients = users
        .filter((u) => u !== null)
        .map((u) => ({
          email: u!.email,
          name: u!.name,
        }));

      if (recipients.length === 0) {
        logger.debug('No valid recipients after user lookup for status change', {
          reportId: report.id,
        });
        return;
      }

      const settings = await settingsCacheService.getAll();
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/admin/reports/${report.id}`;

      const result = await emailService.sendStatusChangeNotification(recipients, {
        report,
        projectName: project.name,
        reportUrl,
        oldStatus,
        newStatus,
      });

      if (result.success) {
        logger.info('Status change notification sent', {
          reportId: report.id,
          recipientCount: recipients.length,
        });
      } else {
        logger.warn('Status change notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send status change notification', {
        reportId: report.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * Send notification for report assignment
   */
  async notifyAssignment(report: Report, assignedToUserId: string): Promise<void> {
    try {
      logger.debug('Starting assignment notification', {
        reportId: report.id,
        projectId: report.projectId,
        assignedToUserId,
      });

      const preferences = await notificationPreferencesRepo.findByUserAndProject(
        assignedToUserId,
        report.projectId
      );

      // No user row: inherit project defaults, then global defaults
      let emailEnabled: boolean;
      let notifyOnAssignment: boolean;
      if (preferences) {
        emailEnabled = preferences.emailEnabled;
        notifyOnAssignment = preferences.notifyOnAssignment;
      } else {
        const projectDefaults = await projectNotificationDefaultsRepo.findByProject(
          report.projectId
        );
        const globalDefaults = await getGlobalNotificationDefaults();
        emailEnabled = projectDefaults?.defaultEmailEnabled ?? globalDefaults.emailEnabled;
        notifyOnAssignment =
          projectDefaults?.defaultNotifyOnAssignment ?? globalDefaults.notifyOnAssignment;
      }

      if (!emailEnabled || !notifyOnAssignment) {
        logger.info('Skipping assignment notification - preferences disabled', {
          reportId: report.id,
          assignedToUserId,
          hasPreferences: !!preferences,
          emailEnabled,
          notifyOnAssignment,
        });
        return;
      }

      const user = await usersRepo.findById(assignedToUserId);
      const project = await projectsRepo.findById(report.projectId);

      if (!user || !project) {
        return;
      }

      const settings = await settingsCacheService.getAll();
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/admin/reports/${report.id}`;

      const result = await emailService.sendAssignmentNotification(
        [{ email: user.email, name: user.name }],
        {
          report,
          projectName: project.name,
          reportUrl,
          assignedToName: user.name,
        }
      );

      if (result.success) {
        logger.info('Assignment notification sent', {
          reportId: report.id,
          assignedTo: assignedToUserId,
        });
      } else {
        logger.warn('Assignment notification failed', {
          reportId: report.id,
          assignedTo: assignedToUserId,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send assignment notification', {
        reportId: report.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * Send notification for priority change
   */
  async notifyPriorityChange(
    report: Report,
    oldPriority: string,
    newPriority: string
  ): Promise<void> {
    try {
      logger.debug('Starting priority change notification', {
        reportId: report.id,
        projectId: report.projectId,
        oldPriority,
        newPriority,
      });

      const preferences = await notificationPreferencesRepo.findByProjectWithEmailEnabled(
        report.projectId,
        await getGlobalNotificationDefaults()
      );

      logger.debug('Found notification preferences for priority change', {
        projectId: report.projectId,
        preferencesCount: preferences.length,
      });

      const usersToNotify = preferences.filter((p) => p.notifyOnPriorityChange);

      if (usersToNotify.length === 0) {
        logger.info('No users to notify for priority change', {
          reportId: report.id,
          projectId: report.projectId,
          totalPreferences: preferences.length,
        });
        return;
      }

      const users = await Promise.all(usersToNotify.map((p) => usersRepo.findById(p.userId)));
      const project = await projectsRepo.findById(report.projectId);

      if (!project) {
        logger.error('Project not found for priority change notification', {
          projectId: report.projectId,
        });
        return;
      }

      const recipients = users
        .filter((u) => u !== null)
        .map((u) => ({
          email: u!.email,
          name: u!.name,
        }));

      if (recipients.length === 0) {
        logger.debug('No valid recipients after user lookup for priority change', {
          reportId: report.id,
        });
        return;
      }

      const settings = await settingsCacheService.getAll();
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/admin/reports/${report.id}`;

      const result = await emailService.sendPriorityChangeNotification(recipients, {
        report,
        projectName: project.name,
        reportUrl,
        oldPriority,
        newPriority,
      });

      if (result.success) {
        logger.info('Priority change notification sent', {
          reportId: report.id,
          recipientCount: recipients.length,
        });
      } else {
        logger.warn('Priority change notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send priority change notification', {
        reportId: report.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * Send confirmation email to reporter when a report is submitted
   */
  async notifyReporterSubmission(report: Report): Promise<void> {
    try {
      const ctx = await getReporterContext(report, 'notifyOnNewReport', 'confirmation');
      if (!ctx) return;

      const result = await emailService.sendReporterConfirmationEmail(ctx.recipient, {
        report,
        projectName: ctx.project.name,
        appName: ctx.settings.appName || 'BugPin',
        appUrl: ctx.settings.appUrl || '',
        correspondence: ctx.correspondence,
      });

      if (result.success) {
        logger.info('Reporter submission confirmation sent', {
          reportId: report.id,
          reporterEmail: ctx.recipient,
        });
      } else {
        logger.warn('Reporter submission confirmation failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send reporter submission confirmation', {
        reportId: report.id,
        error: 'Reporter email delivery failed',
      });
    }
  },

  /**
   * Send status change email to reporter
   */
  async notifyReporterStatusChange(
    report: Report,
    oldStatus: ReportStatus,
    newStatus: ReportStatus
  ): Promise<void> {
    try {
      const ctx = await getReporterContext(report, 'notifyOnStatusChange');
      if (!ctx) return;

      const result = await emailService.sendReporterStatusChangeEmail(ctx.recipient, {
        report,
        projectName: ctx.project.name,
        appName: ctx.settings.appName || 'BugPin',
        appUrl: ctx.settings.appUrl || '',
        correspondence: ctx.correspondence,
        oldStatus,
        newStatus,
      });

      if (result.success) {
        logger.info('Reporter status change notification sent', {
          reportId: report.id,
          reporterEmail: ctx.recipient,
        });
      } else {
        logger.warn('Reporter status change notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send reporter status change notification', {
        reportId: report.id,
        error: 'Reporter email delivery failed',
      });
    }
  },

  /**
   * Send assignment change email to reporter
   */
  async notifyReporterAssignment(
    report: Report,
    oldAssignedToUserId: string | undefined,
    newAssignedToUserId: string
  ): Promise<void> {
    try {
      const ctx = await getReporterContext(report, 'notifyOnAssignment');
      if (!ctx) return;

      const [newAssignee, previousAssignee] = await Promise.all([
        usersRepo.findById(newAssignedToUserId),
        oldAssignedToUserId ? usersRepo.findById(oldAssignedToUserId) : Promise.resolve(null),
      ]);

      if (!newAssignee) {
        logger.error('New assignee user not found for reporter assignment notification', {
          userId: newAssignedToUserId,
          reportId: report.id,
        });
        return;
      }

      const result = await emailService.sendReporterAssignmentEmail(ctx.recipient, {
        report,
        projectName: ctx.project.name,
        appName: ctx.settings.appName || 'BugPin',
        appUrl: ctx.settings.appUrl || '',
        correspondence: ctx.correspondence,
        assigneeName: newAssignee.name,
        previousAssigneeName: previousAssignee?.name,
      });

      if (result.success) {
        logger.info('Reporter assignment notification sent', {
          reportId: report.id,
          reporterEmail: ctx.recipient,
          assignedTo: newAssignedToUserId,
        });
      } else {
        logger.warn('Reporter assignment notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send reporter assignment notification', {
        reportId: report.id,
        error: 'Reporter email delivery failed',
      });
    }
  },

  /**
   * Send a direct message email to the reporter
   */
  async notifyReporterMessage(
    report: Report,
    message: string,
    senderUserId: string,
    ccSender?: boolean,
    files: { filename: string }[] = []
  ): Promise<void> {
    try {
      const [project, settings, sender] = await Promise.all([
        projectsRepo.findById(report.projectId),
        settingsCacheService.getAll(),
        usersRepo.findById(senderUserId),
      ]);
      if (!project || !sender) return;
      const emailData = {
        report,
        projectName: project.name,
        appName: settings.appName || 'BugPin',
        appUrl: settings.appUrl || '',
        senderName: sender.name,
        message,
        files,
      };
      if (ccSender && sender.email) {
        try {
          const copy = await emailService.sendReporterMessageCcEmail(sender.email, {
            ...emailData,
            correspondence: reporterCorrespondenceService.staffCopyOptions(
              report,
              project,
              settings
            ),
          });
          if (!copy.success)
            logger.warn('Reporter message CC to sender failed', { reportId: report.id });
        } catch {
          logger.warn('Reporter message CC to sender failed', { reportId: report.id });
        }
      }
      const ctx = await getReporterContext(report, 'messagingEnabled', 'invitation');
      if (!ctx) return;
      const result = await emailService.sendReporterMessageEmail(ctx.recipient, {
        ...emailData,
        correspondence: ctx.correspondence,
      });
      if (!result.success)
        logger.warn('Reporter message notification failed', { reportId: report.id });
    } catch {
      logger.error('Failed to send reporter message notification', { reportId: report.id });
    }
  },

  /**
   * Send notification for report deletion
   */
  async notifyReportDeleted(report: Report): Promise<void> {
    try {
      logger.debug('Starting report deleted notification', {
        reportId: report.id,
        projectId: report.projectId,
      });

      const preferences = await notificationPreferencesRepo.findByProjectWithEmailEnabled(
        report.projectId,
        await getGlobalNotificationDefaults()
      );

      const usersToNotify = preferences.filter((p) => p.notifyOnDeletion);

      if (usersToNotify.length === 0) {
        logger.info('No users to notify for report deletion', {
          reportId: report.id,
          projectId: report.projectId,
          totalPreferences: preferences.length,
        });
        return;
      }

      const users = await Promise.all(usersToNotify.map((p) => usersRepo.findById(p.userId)));
      const project = await projectsRepo.findById(report.projectId);

      if (!project) {
        logger.error('Project not found for report deleted notification', {
          projectId: report.projectId,
        });
        return;
      }

      const recipients = users
        .filter((u) => u !== null)
        .map((u) => ({
          email: u!.email,
          name: u!.name,
        }));

      if (recipients.length === 0) {
        logger.debug('No valid recipients after user lookup for report deletion', {
          reportId: report.id,
        });
        return;
      }

      const settings = await settingsCacheService.getAll();
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/admin/reports/${report.id}`;

      const result = await emailService.sendReportDeletedNotification(recipients, {
        report,
        projectName: project.name,
        reportUrl,
      });

      if (result.success) {
        logger.info('Report deleted notification sent', {
          reportId: report.id,
          recipientCount: recipients.length,
        });
      } else {
        logger.warn('Report deleted notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send report deleted notification', {
        reportId: report.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * Send priority change email to reporter
   */
  async notifyReporterPriorityChange(
    report: Report,
    oldPriority: ReportPriority,
    newPriority: ReportPriority
  ): Promise<void> {
    try {
      const ctx = await getReporterContext(report, 'notifyOnPriorityChange');
      if (!ctx) return;

      const result = await emailService.sendReporterPriorityChangeEmail(ctx.recipient, {
        report,
        projectName: ctx.project.name,
        appName: ctx.settings.appName || 'BugPin',
        appUrl: ctx.settings.appUrl || '',
        correspondence: ctx.correspondence,
        oldPriority,
        newPriority,
      });

      if (result.success) {
        logger.info('Reporter priority change notification sent', {
          reportId: report.id,
          reporterEmail: ctx.recipient,
        });
      } else {
        logger.warn('Reporter priority change notification failed', {
          reportId: report.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error('Failed to send reporter priority change notification', {
        reportId: report.id,
        error: 'Reporter email delivery failed',
      });
    }
  },

  /**
   * Update notification preferences for all projects at once
   */
  async updateAllUserPreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput
  ): Promise<Result<NotificationPreferences[]>> {
    const projects = await projectsRepo.findAll();
    const results: NotificationPreferences[] = [];

    const globalDefaults = await getGlobalNotificationDefaults();
    for (const project of projects) {
      const prefs = await notificationPreferencesRepo.upsert(
        userId,
        project.id,
        input,
        globalDefaults
      );
      results.push(prefs);
    }

    logger.info('User notification preferences updated for all projects', {
      userId,
      projectCount: results.length,
    });

    return Result.ok(results);
  },
};
