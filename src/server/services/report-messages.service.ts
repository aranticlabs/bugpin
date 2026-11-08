import { reportMessagesRepo } from '../database/repositories/report-messages.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { notificationsService } from './notifications.service.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { ReportMessage, ReporterMessage } from '@shared/types';

function toLegacyMessage(message: ReportMessage): ReporterMessage {
  return {
    id: message.id,
    reportId: message.reportId,
    userId: message.userId,
    userName: message.authorName,
    message: message.body,
    sentAt: message.createdAt,
    createdAt: message.createdAt,
    authorKind: message.authorKind,
    reporterId: message.reporterId,
    authorName: message.authorName,
    files: message.files,
    hiddenAt: message.hiddenAt,
  };
}

export const reportMessagesService = {
  async send(
    reportId: string,
    userId: string,
    message: string,
    ccSender?: boolean
  ): Promise<Result<ReporterMessage>> {
    const report = await reportsRepo.findById(reportId);

    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    const access = checkProjectLicense(report.projectId);
    if (!access.success) return access;

    if (!report.reporterEmail) {
      return Result.fail('Report does not have a reporter email address', 'NO_REPORTER_EMAIL');
    }

    const savedMessage = await reportMessagesRepo.create(reportId, userId, message);

    // Fire-and-forget email notification
    notificationsService.notifyReporterMessage(report, message, userId, ccSender).catch((error) => {
      logger.error('Failed to send reporter message notification', error, {
        reportId,
      });
    });

    return Result.ok(toLegacyMessage(savedMessage));
  },

  async listByReport(reportId: string): Promise<Result<ReporterMessage[]>> {
    const report = await reportsRepo.findById(reportId);
    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    const messages = await reportMessagesRepo.findByReportId(reportId);
    return Result.ok(messages.map(toLegacyMessage));
  },
};
