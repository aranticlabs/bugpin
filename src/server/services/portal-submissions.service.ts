import { portalReportsRepo } from '../database/repositories/portal-reports.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import type { CreateFileData } from '../database/repositories/interfaces.js';
import { portalReportsService } from './portal-reports.service.js';
import { settingsCacheService } from './settings-cache.service.js';
import { uploadQuotaService } from './upload-quota.service.js';
import { videoQuotaService } from './video-quota.service.js';
import { notificationsService } from './notifications.service.js';
import { realtimeService } from './realtime.service.js';
import { githubSyncService } from './integrations/github-sync.service.js';
import { syncQueueService } from './integrations/sync-queue.service.js';
import type { MessageUpload } from './report-messages.service.js';
import { saveFile, deleteFile, validateFile, ALLOWED_MEDIA_MIME_TYPES } from '../storage/files.js';
import { portalSubmissionSchema } from '../utils/portal-schemas.js';
import { MAX_MESSAGE_FILES, MESSAGE_BODY_OVERHEAD_BYTES } from '../utils/request-limits.js';
import { generateReportId } from '../utils/id.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { normalizeMimeType } from '@shared/mime';
import type { PortalReportDetail } from '@shared/portal-types';

export const portalSubmissionsService = {
  async uploadBodyLimit(reporterId: string): Promise<Result<number>> {
    const projects = await portalReportsService.projects(reporterId);
    if (!projects.success) return projects;
    const sizeMb = Math.max(
      0,
      ...projects.value
        .filter((p) => p.allowNewFeedback)
        .map((p) => Math.max(p.maxImageMb, p.maxVideoMb))
    );
    return Result.ok(MAX_MESSAGE_FILES * sizeMb * 1024 * 1024 + MESSAGE_BODY_OVERHEAD_BYTES);
  },

  async create(
    reporterId: string,
    input: unknown,
    files: MessageUpload[] = []
  ): Promise<Result<PortalReportDetail>> {
    const parsed = portalSubmissionSchema.safeParse(input);
    if (!parsed.success) return Result.fail('Invalid feedback request', 'VALIDATION_ERROR');
    if (files.length > MAX_MESSAGE_FILES)
      return Result.fail('Attach at most 5 image or video files', 'INVALID_FILE');
    const { projectId, title, description } = parsed.data;
    const id = generateReportId();
    const staged: CreateFileData[] = [];
    let committed = false;
    let releaseVideo: (() => void) | undefined;
    try {
      let settings = await settingsCacheService.getAll();
      const author = reportersRepo.findById(reporterId);
      if (!author || author.suspendedAt)
        return Result.fail('Authentication required', 'UNAUTHORIZED');
      const context = portalReportsRepo.submissionContext(projectId, reporterId);
      if (!context) return Result.fail('Project not found', 'NOT_FOUND');
      const license = checkProjectLicense(projectId);
      if (!license.success) return license;
      const uploads = files.map((file) => ({
        source: file,
        filename: 'data' in file ? file.filename : file.name,
        mimeType: normalizeMimeType('data' in file ? file.mimeType : file.type),
        sizeBytes: 'data' in file ? file.data.byteLength : file.size,
      }));
      for (const file of uploads) {
        const limit = file.mimeType.startsWith('video/')
          ? (context.settings.screenshot?.maxVideoUploadSizeMb ??
            settings.screenshot.maxVideoUploadSizeMb)
          : (context.settings.screenshot?.maxImageUploadSizeMb ??
            settings.screenshot.maxImageUploadSizeMb);
        if (
          !(ALLOWED_MEDIA_MIME_TYPES as readonly string[]).includes(file.mimeType) ||
          file.sizeBytes > limit * 1024 * 1024
        )
          return Result.fail('Invalid attached file', 'INVALID_FILE');
      }
      const quota = uploadQuotaService.check(
        reporterId,
        uploads.reduce((n, file) => n + file.sizeBytes, 0),
        settings.reporterPortalLimits.uploadMbPerReporterPerDay
      );
      if (!quota.success) return quota;
      const reservation = videoQuotaService.reserve(
        projectId,
        uploads.reduce(
          (n, file) => n + (file.mimeType.startsWith('video/') ? file.sizeBytes : 0),
          0
        ),
        (context.settings.screenshot?.maxVideoUploadMbPerDay ??
          settings.screenshot.maxVideoUploadMbPerDay) *
          1024 *
          1024
      );
      if (!reservation.success) return reservation;
      releaseVideo = reservation.value;
      for (const file of uploads) {
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
        const limit =
          type === 'video'
            ? (context.settings.screenshot?.maxVideoUploadSizeMb ??
              settings.screenshot.maxVideoUploadSizeMb)
            : (context.settings.screenshot?.maxImageUploadSizeMb ??
              settings.screenshot.maxImageUploadSizeMb);
        const valid = validateFile({ data, mimeType: file.mimeType, type, maxSizeMb: limit });
        if (!valid.success) return Result.fail(valid.error, 'INVALID_FILE');
        const saved = await saveFile({
          reportId: id,
          type,
          filename: file.filename,
          mimeType: file.mimeType,
          data,
        });
        staged.push({ ...saved, reportId: id, type, uploadedByReporterId: reporterId });
      }
      settings = await settingsCacheService.getAll();
      const result = portalReportsRepo.transaction((): Result<void> => {
        const currentAuthor = reportersRepo.findById(reporterId);
        if (!currentAuthor || currentAuthor.suspendedAt)
          return Result.fail('Authentication required', 'UNAUTHORIZED');
        const current = portalReportsRepo.submissionContext(projectId, reporterId);
        if (!current) return Result.fail('Project not found', 'NOT_FOUND');
        const allowed = checkProjectLicense(projectId);
        if (!allowed.success) return allowed;
        for (const file of staged) {
          const limit =
            file.type === 'video'
              ? (current.settings.screenshot?.maxVideoUploadSizeMb ??
                settings.screenshot.maxVideoUploadSizeMb)
              : (current.settings.screenshot?.maxImageUploadSizeMb ??
                settings.screenshot.maxImageUploadSizeMb);
          if (file.sizeBytes > limit * 1024 * 1024)
            return Result.fail('File exceeds the project size limit', 'INVALID_FILE');
        }
        const currentQuota = uploadQuotaService.check(
          reporterId,
          staged.reduce((n, file) => n + file.sizeBytes, 0),
          settings.reporterPortalLimits.uploadMbPerReporterPerDay
        );
        if (!currentQuota.success) return currentQuota;
        releaseVideo?.();
        releaseVideo = undefined;
        const currentReservation = videoQuotaService.reserve(
          projectId,
          staged.reduce((n, file) => n + (file.type === 'video' ? file.sizeBytes : 0), 0),
          (current.settings.screenshot?.maxVideoUploadMbPerDay ??
            settings.screenshot.maxVideoUploadMbPerDay) *
            1024 *
            1024
        );
        if (!currentReservation.success) return currentReservation;
        releaseVideo = currentReservation.value;
        portalReportsRepo.insertSubmission({
          id,
          projectId,
          reporterId,
          title,
          description,
          email: current.email,
          displayName: current.displayName,
          locale: current.locale,
          assignedTo: current.assignedTo,
          now: new Date().toISOString(),
        });
        for (const file of staged) filesRepo.insert(file);
        reportHistoryRepo.insert({ reportId: id, action: 'created' });
        return Result.ok(undefined);
      });
      if (!result.success) return result;
      committed = true;
      const report = await reportsRepo.findById(id);
      if (!report) return Result.fail('Report not found', 'NOT_FOUND');
      void Promise.resolve()
        .then(() => {
          realtimeService.publish('report.updated', { reportId: id, projectId });
          realtimeService.publish('reporter_activity.changed', { reportId: id, projectId });
          return notificationsService.notifyReporterActivity(report, reporterId);
        })
        .catch(() => logger.warn('Reporter activity notification failed', { reportId: id }));
      void Promise.resolve()
        .then(() => getEEHooks().onReportCreated(report))
        .catch(() => logger.warn('Report webhook dispatch failed', { reportId: id }));
      void githubSyncService
        .getAutoSyncIntegration(projectId)
        .then((integration) =>
          integration ? syncQueueService.enqueue(id, integration.id) : undefined
        )
        .catch(() => logger.warn('Failed to queue report sync', { reportId: id }));
      return await portalReportsService.detail(id, reporterId);
    } catch (error) {
      logger.error('Failed to save portal feedback', error, { reportId: id });
      return Result.fail('Failed to save feedback', 'SUBMISSION_WRITE_FAILED');
    } finally {
      releaseVideo?.();
      if (!committed)
        for (const file of staged) {
          if (!(await deleteFile(file.path)))
            logger.error('Failed to discard staged feedback file', { path: file.path });
        }
    }
  },
};
