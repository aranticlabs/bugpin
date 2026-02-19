import {
  notificationPreferencesRepo,
  projectNotificationDefaultsRepo,
} from '../database/repositories/notification-preferences.repo.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { emailService } from './email.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { NotificationPreferences, ProjectNotificationDefaults, Report } from '@shared/types';

// Types

export interface UpdateNotificationPreferencesInput {
  notifyOnNewReport?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnPriorityChange?: boolean;
  notifyOnAssignment?: boolean;
  emailEnabled?: boolean;
}

export interface UpdateProjectNotificationDefaultsInput {
  defaultNotifyOnNewReport?: boolean;
  defaultNotifyOnStatusChange?: boolean;
  defaultNotifyOnPriorityChange?: boolean;
  defaultNotifyOnAssignment?: boolean;
  defaultEmailEnabled?: boolean;
}

// Service

export const notificationsService = {
  /**
   * Get user's notification preferences for a project
   */
  async getUserPreferences(
    userId: string,
    projectId: string,
  ): Promise<Result<NotificationPreferences>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    // Get or create preferences with defaults
    const preferences = await notificationPreferencesRepo.getOrCreate(userId, projectId);

    return Result.ok(preferences);
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
    input: UpdateNotificationPreferencesInput,
  ): Promise<Result<NotificationPreferences>> {
    // Verify project exists
    const project = await projectsRepo.findById(projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    const preferences = await notificationPreferencesRepo.upsert(userId, projectId, input);

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
    input: UpdateProjectNotificationDefaultsInput,
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
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/reports/${report.id}`;

      await emailService.sendNewReportNotification(recipients, {
        report,
        projectName: project.name,
        reportUrl,
      });

      logger.info('New report notification sent', {
        reportId: report.id,
        recipientCount: recipients.length,
      });
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
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/reports/${report.id}`;

      await emailService.sendStatusChangeNotification(recipients, {
        report,
        projectName: project.name,
        reportUrl,
        oldStatus,
        newStatus,
      });

      logger.info('Status change notification sent', {
        reportId: report.id,
        recipientCount: recipients.length,
      });
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
        report.projectId,
      );

      // If no explicit preferences exist, treat as enabled (matching DB defaults)
      const emailEnabled = preferences ? preferences.emailEnabled : true;
      const notifyOnAssignment = preferences ? preferences.notifyOnAssignment : true;

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
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/reports/${report.id}`;

      await emailService.sendAssignmentNotification([{ email: user.email, name: user.name }], {
        report,
        projectName: project.name,
        reportUrl,
        assignedToName: user.name,
      });

      logger.info('Assignment notification sent', {
        reportId: report.id,
        assignedTo: assignedToUserId,
      });
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
    newPriority: string,
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
      const reportUrl = `${settings.appUrl || 'http://localhost:3000'}/reports/${report.id}`;

      // For priority change, we can reuse status change template with modified content
      await emailService.sendEmail({
        to: recipients,
        subject: `[${project.name}] Report Priority Changed: ${report.title}`,
        html: `
          <p>Report priority changed from <strong>${oldPriority}</strong> to <strong>${newPriority}</strong></p>
          <p><a href="${reportUrl}">View Report</a></p>
        `,
      });

      logger.info('Priority change notification sent', {
        reportId: report.id,
        recipientCount: recipients.length,
      });
    } catch (error) {
      logger.error('Failed to send priority change notification', {
        reportId: report.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
