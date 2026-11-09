import type { ReportOwnerChangedEvent } from '@shared/types';
import { getEEHooks } from '../utils/ee-hooks.js';
import { transaction } from '../database/database.js';
import { reportMessagesRepo } from '../database/repositories/report-messages.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { reporterOwnershipService } from './reporter-ownership.service.js';
import { reporterCorrespondenceService } from './reporter-correspondence.service.js';
import { reporterSuppressionService } from './reporter-suppression.service.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { realtimeService } from './realtime.service.js';
import { notificationsService } from './notifications.service.js';
import { settingsCacheService } from './settings-cache.service.js';
import { uploadQuotaService } from './upload-quota.service.js';
import { videoQuotaService } from './video-quota.service.js';
import { saveFile, deleteFile, validateFile, ALLOWED_MEDIA_MIME_TYPES } from '../storage/files.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { MAX_MESSAGE_FILES, MESSAGE_BODY_OVERHEAD_BYTES } from '../utils/request-limits.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { normalizeMimeType } from '@shared/mime';
import type { AppSettings, FileRecord, ReportMessage, ReporterMessage } from '@shared/types';
import type {
  MessageAuthor,
  MessageWriteContext,
  StoredReportMessage,
  CreateFileData,
} from '../database/repositories/interfaces.js';
import type { MediaFile } from './reports.service.js';
import type { ReportOwner } from '@shared/reporter-types';
import { normalizeEmail } from '../utils/email-normalize.js';
import { isValidEmail } from '../utils/validators.js';

export type MessageUpload = MediaFile | File;

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

async function loadMessages(reportId: string, visibleOnly = false): Promise<ReportMessage[]> {
  const messages = await reportMessagesRepo.findByReportId(reportId, visibleOnly);
  const files = await filesRepo.findByReportMessages(reportId, visibleOnly);
  const byMessage = new Map<string, FileRecord[]>();
  for (const file of files) {
    if (!file.messageId) continue;
    const group = byMessage.get(file.messageId) ?? [];
    group.push(file);
    byMessage.set(file.messageId, group);
  }
  return messages.map((message) => ({ ...message, files: byMessage.get(message.id) ?? [] }));
}

function checkAccess(
  reportId: string,
  author: MessageAuthor,
  settings: AppSettings,
  writing = true,
  invitationEmail?: string
): Result<MessageWriteContext> {
  if (!reportMessagesRepo.hasAuthor(author))
    return Result.fail('Author is no longer available', 'UNAUTHORIZED');
  const context = reportMessagesRepo.writeContext(reportId);
  if (
    !context ||
    (author.kind === 'reporter' &&
      (!context.projectIsActive ||
        context.reporterId !== author.reporterId ||
        !context.settings.reporterPortal?.enabled))
  ) {
    return Result.fail('Report not found', 'NOT_FOUND');
  }
  const access = checkProjectLicense(context.projectId);
  if (!access.success) return access;
  if (writing) {
    const enabled =
      context.settings.notifyReporter !== false &&
      (context.settings.reporterNotifications?.messagingEnabled ??
        settings.reporterNotifications?.messagingEnabled ??
        true);
    if (!enabled)
      return Result.fail('Messaging is disabled for this project', 'MESSAGING_DISABLED');
    if (author.kind === 'reporter' && context.status === 'closed')
      return Result.fail('This report is closed', 'REPORT_CLOSED');
    if (
      author.kind === 'staff' &&
      !context.reporterId &&
      !context.claimableEmail &&
      !context.reporterEmail &&
      !invitationEmail
    )
      return Result.fail('Report does not have a reporter email address', 'NO_REPORTER_EMAIL');
  }
  return Result.ok(context);
}

function needsPortalAccess(context: MessageWriteContext): boolean {
  return Boolean(
    context.settings.reporterPortal?.enabled && !context.reporterId && !context.claimableEmail
  );
}

async function writeMessage(
  reportId: string,
  author: MessageAuthor,
  body: string,
  files: MessageUpload[],
  confirmPortalAccess = false,
  invitationEmail?: string
): Promise<Result<ReportMessage>> {
  const text = body.trim();
  if (text.length > 5000 || (!text && files.length === 0))
    return Result.fail(
      'A message or file is required, with at most 5000 characters',
      'VALIDATION_ERROR'
    );
  if (files.length > MAX_MESSAGE_FILES)
    return Result.fail('A message can have at most 5 files', 'INVALID_FILE');
  const staged: CreateFileData[] = [];
  let committed = false;
  const ownershipChanges: ReportOwnerChangedEvent[] = [];
  let ownershipFailure: Result<ReportMessage> | undefined;
  let releaseVideo: (() => void) | undefined;
  try {
    let settings = await settingsCacheService.getAll();
    const access = checkAccess(reportId, author, settings, true, invitationEmail);
    if (!access.success) return access;
    if (author.kind === 'staff' && needsPortalAccess(access.value) && !confirmPortalAccess)
      return Result.fail('Confirm that this message grants portal access', 'CONFIRMATION_REQUIRED');
    const screenshot = access.value.settings.screenshot;
    const maxImageMb = screenshot?.maxImageUploadSizeMb ?? settings.screenshot.maxImageUploadSizeMb;
    const maxVideoMb = screenshot?.maxVideoUploadSizeMb ?? settings.screenshot.maxVideoUploadSizeMb;
    const normalized = files.map((file) => ({
      source: file,
      filename: 'data' in file ? file.filename : file.name,
      mimeType: normalizeMimeType('data' in file ? file.mimeType : file.type),
      sizeBytes: 'data' in file ? file.data.byteLength : file.size,
    }));
    for (const file of normalized) {
      if (!(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(file.mimeType))
        return Result.fail('Unsupported file type', 'INVALID_FILE');
      const limit = file.mimeType.startsWith('video/') ? maxVideoMb : maxImageMb;
      if (file.sizeBytes > limit * 1024 * 1024)
        return Result.fail('File exceeds the project size limit', 'INVALID_FILE');
    }
    if (author.kind === 'reporter') {
      const quota = uploadQuotaService.check(
        author.reporterId,
        normalized.reduce((sum, file) => sum + file.sizeBytes, 0),
        settings.reporterPortalLimits.uploadMbPerReporterPerDay
      );
      if (!quota.success) return quota;
      const reservation = videoQuotaService.reserve(
        access.value.projectId,
        normalized.reduce(
          (sum, file) => sum + (file.mimeType.startsWith('video/') ? file.sizeBytes : 0),
          0
        ),
        (screenshot?.maxVideoUploadMbPerDay ?? settings.screenshot.maxVideoUploadMbPerDay) *
          1024 *
          1024
      );
      if (!reservation.success) return reservation;
      releaseVideo = reservation.value;
    }
    for (const file of normalized) {
      const type = file.mimeType.startsWith('video/') ? 'video' : 'screenshot';
      let data: Buffer | Uint8Array;
      try {
        data =
          'data' in file.source
            ? file.source.data
            : new Uint8Array(await file.source.arrayBuffer());
      } catch {
        return Result.fail('Failed to read attached file', 'INVALID_FILE');
      }
      const valid = validateFile({
        data,
        mimeType: file.mimeType,
        type,
        maxSizeMb: type === 'video' ? maxVideoMb : maxImageMb,
      });
      if (!valid.success) return Result.fail(valid.error, 'INVALID_FILE');
      const saved = await saveFile({
        reportId,
        type,
        filename: file.filename,
        mimeType: file.mimeType,
        data,
      });
      staged.push({
        ...saved,
        reportId,
        type,
        uploadedByReporterId: author.kind === 'reporter' ? author.reporterId : undefined,
      });
    }
    settings = await settingsCacheService.getAll();
    const result = transaction((): Result<ReportMessage> => {
      const current = checkAccess(reportId, author, settings, true, invitationEmail);
      if (!current.success) return current;
      if (author.kind === 'staff' && needsPortalAccess(current.value) && !confirmPortalAccess)
        return Result.fail(
          'Confirm that this message grants portal access',
          'CONFIRMATION_REQUIRED'
        );
      const currentScreenshot = current.value.settings.screenshot;
      for (const file of staged) {
        const limit = file.mimeType.startsWith('video/')
          ? (currentScreenshot?.maxVideoUploadSizeMb ?? settings.screenshot.maxVideoUploadSizeMb)
          : (currentScreenshot?.maxImageUploadSizeMb ?? settings.screenshot.maxImageUploadSizeMb);
        if (file.sizeBytes > limit * 1024 * 1024)
          return Result.fail('File exceeds the project size limit', 'INVALID_FILE');
      }
      if (author.kind === 'reporter') {
        const quota = uploadQuotaService.check(
          author.reporterId,
          staged.reduce((sum, file) => sum + file.sizeBytes, 0),
          settings.reporterPortalLimits.uploadMbPerReporterPerDay
        );
        if (!quota.success) return quota;
        releaseVideo?.();
        releaseVideo = undefined;
        const reservation = videoQuotaService.reserve(
          current.value.projectId,
          staged.reduce((sum, file) => sum + (file.type === 'video' ? file.sizeBytes : 0), 0),
          (currentScreenshot?.maxVideoUploadMbPerDay ??
            settings.screenshot.maxVideoUploadMbPerDay) *
            1024 *
            1024
        );
        if (!reservation.success) return reservation;
        releaseVideo = reservation.value;
      }
      const message = reportMessagesRepo.insert(reportId, author, text);
      if (!message) return Result.fail('Author is no longer available', 'UNAUTHORIZED');
      if (
        author.kind === 'staff' &&
        (invitationEmail !== undefined || needsPortalAccess(current.value))
      ) {
        const ownership = reporterOwnershipService.setInTransaction(
          reportId,
          { claimableEmail: invitationEmail ?? current.value.reporterEmail! },
          author.userId,
          ownershipChanges
        );
        if (!ownership.success) {
          ownershipFailure = ownership;
          throw new Error('Ownership change rejected');
        }
      }
      const savedFiles = staged.map((file) => filesRepo.insert({ ...file, messageId: message.id }));
      reportMessagesRepo.recordActivity(reportId, author, message.createdAt);
      return Result.ok({ ...message, files: savedFiles });
    });
    committed = result.success;
    if (result.success) {
      reporterOwnershipService.announce(ownershipChanges);
      const message = result.value;
      void Promise.resolve()
        .then(() =>
          getEEHooks().onReportMessageCreated({
            reportId,
            projectId: access.value.projectId,
            messageId: message.id,
            authorKind: message.authorKind,
            body: message.body,
            createdAt: message.createdAt,
            files: message.files.map(({ id, type, mimeType, sizeBytes }) => ({
              id,
              type,
              mimeType,
              sizeBytes,
            })),
          })
        )
        .catch(() => logger.warn('Message webhook dispatch failed', { reportId }));
    }
    return result;
  } catch (error) {
    if (ownershipFailure) return ownershipFailure;
    logger.error('Failed to save report message', error, { reportId });
    return Result.fail('Failed to save message', 'MESSAGE_WRITE_FAILED');
  } finally {
    releaseVideo?.();
    if (!committed) {
      for (const file of staged) {
        if (!(await deleteFile(file.path)))
          logger.error('Failed to discard staged message file', { path: file.path });
      }
    }
  }
}

async function sendStaffMessage(
  reportId: string,
  userId: string,
  message: string,
  ccSender: boolean | undefined,
  files: MessageUpload[],
  confirmPortalAccess: boolean,
  invitationEmail?: string
): Promise<Result<ReporterMessage>> {
  const saved = await writeMessage(
    reportId,
    { kind: 'staff', userId },
    message,
    files,
    confirmPortalAccess,
    invitationEmail
  );
  if (!saved.success) return saved;
  const context = reportMessagesRepo.writeContext(reportId);
  if (context)
    realtimeService.publish('message.created', { reportId, projectId: context.projectId });
  try {
    const report = await reportsRepo.findById(reportId);
    if (report)
      notificationsService
        .notifyReporterMessage(report, saved.value.body, userId, ccSender, saved.value.files)
        .catch((error) => {
          logger.error('Failed to send reporter message notification', error, { reportId });
        });
  } catch (error) {
    logger.error('Failed to send reporter message notification', error, { reportId });
  }
  return Result.ok(toLegacyMessage(saved.value));
}

export const reportMessagesService = {
  async uploadBodyLimit(reportId: string, reporterId?: string): Promise<Result<number>> {
    const context = reportMessagesRepo.writeContext(reportId);
    if (!context) return Result.fail('Report not found', 'NOT_FOUND');
    const settings = await settingsCacheService.getAll();
    const imageMb =
      context.settings.screenshot?.maxImageUploadSizeMb ?? settings.screenshot.maxImageUploadSizeMb;
    const videoMb =
      context.settings.screenshot?.maxVideoUploadSizeMb ?? settings.screenshot.maxVideoUploadSizeMb;
    let fileBytes = MAX_MESSAGE_FILES * Math.max(imageMb, videoMb) * 1024 * 1024;
    if (reporterId) {
      const remaining = uploadQuotaService.remaining(
        reporterId,
        settings.reporterPortalLimits.uploadMbPerReporterPerDay
      );
      if (!remaining.success) return remaining;
      fileBytes = Math.min(fileBytes, remaining.value);
    }
    return Result.ok(fileBytes + MESSAGE_BODY_OVERHEAD_BYTES);
  },

  async send(
    reportId: string,
    userId: string,
    message: string,
    ccSender?: boolean,
    files: MessageUpload[] = [],
    confirmPortalAccess = false
  ): Promise<Result<ReporterMessage>> {
    return sendStaffMessage(reportId, userId, message, ccSender, files, confirmPortalAccess);
  },

  async sendInvitation(
    reportId: string,
    userId: string,
    email: string,
    message: string
  ): Promise<Result<ReportOwner>> {
    const claimableEmail = normalizeEmail(email);
    if (claimableEmail.length > 254 || !isValidEmail(claimableEmail))
      return Result.fail('Invalid email address', 'INVALID_EMAIL');
    const saved = await sendStaffMessage(
      reportId,
      userId,
      message,
      false,
      [],
      true,
      claimableEmail
    );
    if (!saved.success) return saved;
    return reporterOwnershipService.describeOwner({ claimableEmail });
  },

  async sendReporter(
    reportId: string,
    reporterId: string,
    body: string,
    files: MessageUpload[] = []
  ): Promise<Result<ReportMessage>> {
    const saved = await writeMessage(reportId, { kind: 'reporter', reporterId }, body, files);
    if (!saved.success) return saved;
    const report = await reportsRepo.findById(reportId);
    if (report) {
      realtimeService.publish('message.created', { reportId, projectId: report.projectId });
      realtimeService.publish('reporter_activity.changed', {
        reportId,
        projectId: report.projectId,
      });
      void notificationsService
        .notifyReporterActivity(report, reporterId)
        .catch(() => logger.warn('Reporter activity notification failed', { reportId }));
    }
    return saved;
  },

  async portalContext(reportId: string) {
    const report = await reportsRepo.findById(reportId);
    if (!report) return Result.fail('Report not found', 'NOT_FOUND');
    const project = await projectsRepo.findById(report.projectId);
    const owner = report.reporterId ? reportersRepo.findById(report.reporterId) : null;
    const email = reporterCorrespondenceService.recipient(report);
    return Result.ok({
      visible: Boolean(
        project?.isActive && project.settings.reporterPortal?.enabled && report.reporterId
      ),
      ownerEmail: owner?.email ?? null,
      correspondentEmail: email,
      ownerLastLoginAt: owner?.lastLoginAt ?? null,
      emailSuppressed: email ? reporterSuppressionService.isSuppressed(email) : false,
      requiresPortalAccessConfirmation: Boolean(
        project?.settings.reporterPortal?.enabled && !report.reporterId && !report.claimableEmail
      ),
    });
  },

  async listByReport(reportId: string): Promise<Result<ReporterMessage[]>> {
    if (!(await reportsRepo.findById(reportId)))
      return Result.fail('Report not found', 'NOT_FOUND');
    return Result.ok((await loadMessages(reportId)).map(toLegacyMessage));
  },

  async listForReporter(reportId: string, reporterId: string): Promise<Result<ReportMessage[]>> {
    const access = checkAccess(
      reportId,
      { kind: 'reporter', reporterId },
      await settingsCacheService.getAll(),
      false
    );
    if (!access.success) return access;
    return Result.ok(await loadMessages(reportId, true));
  },

  async setHidden(
    reportId: string,
    messageId: string,
    userId: string,
    hidden: boolean
  ): Promise<Result<ReporterMessage>> {
    try {
      const result = transaction((): Result<StoredReportMessage> => {
        if (!reportMessagesRepo.hasAuthor({ kind: 'staff', userId }))
          return Result.fail('Author is no longer available', 'UNAUTHORIZED');
        const message = reportMessagesRepo.findById(reportId, messageId);
        if (!message) return Result.fail('Message not found', 'NOT_FOUND');
        const context = reportMessagesRepo.writeContext(reportId);
        if (!context) return Result.fail('Report not found', 'NOT_FOUND');
        const access = checkProjectLicense(context.projectId);
        if (!access.success) return access;
        if (Boolean(message.hiddenAt) === hidden) return Result.ok(message);
        const updated = reportMessagesRepo.setHidden(reportId, messageId, userId, hidden);
        if (!updated) return Result.fail('Message not found', 'NOT_FOUND');
        reportHistoryRepo.insert({
          reportId,
          userId,
          action: hidden ? 'message_hidden' : 'message_unhidden',
          newValue: messageId,
        });
        return Result.ok(updated);
      });
      if (!result.success) return result;
      const context = reportMessagesRepo.writeContext(reportId);
      if (context)
        realtimeService.publish('report.updated', { reportId, projectId: context.projectId });
      return Result.ok(
        toLegacyMessage({ ...result.value, files: await filesRepo.findByMessageId(messageId) })
      );
    } catch (error) {
      logger.error('Failed to moderate report message', error, { reportId, messageId });
      return Result.fail('Failed to change message visibility', 'MESSAGE_WRITE_FAILED');
    }
  },
};
