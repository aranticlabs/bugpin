import { reportsRepo, type CreateReportData } from '../database/repositories/reports.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { saveFile, deleteReportFiles, readFile } from '../storage/files.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { notificationsService } from './notifications.service.js';
import { githubSyncService } from './integrations/github-sync.service.js';
import { syncQueueService } from './integrations/sync-queue.service.js';
import type {
  Report,
  ReportFilter,
  ReportStatus,
  ReportPriority,
  ReportMetadata,
  PaginatedResponse,
  FileType,
  FileRecord,
  ForwardedReference,
} from '@shared/types';

// Types

export interface MediaFile {
  data: Buffer | Uint8Array;
  filename: string;
  mimeType: string;
}

export interface CreateReportInput {
  apiKey: string;
  title: string;
  description?: string;
  priority?: ReportPriority;
  media?: MediaFile[];
  annotations?: object;
  metadata: ReportMetadata;
  reporterEmail?: string;
  reporterName?: string;
}

export interface UpdateReportInput {
  title?: string;
  description?: string;
  status?: ReportStatus;
  priority?: ReportPriority;
  assignedTo?: string | null;
  resolvedBy?: string;
  forwardedTo?: ForwardedReference[];
}

// Service

export const reportsService = {
  /**
   * Create a new bug report (from widget submission)
   */
  async create(input: CreateReportInput): Promise<Result<Report>> {
    // Validate API key and get project
    const project = await projectsRepo.findByApiKey(input.apiKey);

    if (!project) {
      logger.warn('Invalid API key', { apiKey: input.apiKey });
      return Result.fail('Invalid API key', 'INVALID_API_KEY');
    }

    // Validate title
    if (!input.title || input.title.trim().length < 4) {
      return Result.fail('Title must be at least 4 characters', 'INVALID_TITLE');
    }

    if (input.title.length > 200) {
      return Result.fail('Title must be at most 200 characters', 'INVALID_TITLE');
    }

    // Create report
    const reportData: CreateReportData = {
      projectId: project.id,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: input.priority ?? 'medium',
      annotations: input.annotations,
      metadata: input.metadata,
      reporterEmail: input.reporterEmail?.trim(),
      reporterName: input.reporterName?.trim(),
    };

    const report = await reportsRepo.create(reportData);

    // Save media files if provided
    if (input.media && input.media.length > 0) {
      for (const mediaFile of input.media) {
        try {
          // Determine file type from mime type
          const fileType: FileType = mediaFile.mimeType.startsWith('video/')
            ? 'video'
            : 'screenshot';

          const savedFile = await saveFile({
            reportId: report.id,
            type: fileType,
            filename: mediaFile.filename,
            mimeType: mediaFile.mimeType,
            data: mediaFile.data,
          });

          await filesRepo.create({
            reportId: report.id,
            type: fileType,
            filename: savedFile.filename,
            path: savedFile.path,
            mimeType: savedFile.mimeType,
            sizeBytes: savedFile.sizeBytes,
            width: savedFile.width,
            height: savedFile.height,
          });

          logger.info('Media file saved for report', {
            reportId: report.id,
            fileId: savedFile.id,
            type: fileType,
          });
        } catch (error) {
          logger.error('Failed to save media file', error, {
            reportId: report.id,
            filename: mediaFile.filename,
          });
          // Don't fail the report creation if media save fails
        }
      }
    }

    logger.info('Report created', {
      reportId: report.id,
      projectId: project.id,
      title: report.title,
    });

    // Trigger webhooks via EE hooks (async, don't block)
    getEEHooks()
      .onReportCreated(report)
      .catch((error) => {
        logger.error('Failed to trigger webhooks for report creation', error, {
          reportId: report.id,
        });
      });

    // Send email notifications (async, don't block)
    notificationsService.notifyNewReport(report).catch((error) => {
      logger.error('Failed to send email notification for new report', error, {
        reportId: report.id,
      });
    });

    // Check for auto-sync integration and queue sync (async, don't block)
    githubSyncService
      .getAutoSyncIntegration(project.id)
      .then((integration) => {
        if (integration) {
          syncQueueService.enqueue(report.id, integration.id).catch((error) => {
            logger.error('Failed to queue report for auto-sync', error, { reportId: report.id });
          });
        }
      })
      .catch((error) => {
        logger.error('Failed to check for auto-sync integration', error, { projectId: project.id });
      });

    return Result.ok(report);
  },

  /**
   * Get a report by ID
   */
  async getById(id: string): Promise<Result<Report>> {
    const report = await reportsRepo.findById(id);

    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    return Result.ok(report);
  },

  /**
   * Get a report by ID with files
   */
  async getByIdWithFiles(
    id: string,
  ): Promise<
    Result<{ report: Report; files: Awaited<ReturnType<typeof filesRepo.findByReportId>> }>
  > {
    const report = await reportsRepo.findById(id);

    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    const files = await filesRepo.findByReportId(id);

    return Result.ok({ report, files });
  },

  /**
   * List reports with filtering and pagination
   */
  async list(filter: ReportFilter): Promise<Result<PaginatedResponse<Report>>> {
    const result = await reportsRepo.find(filter);

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    return Result.ok({
      data: result.data,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
  },

  /**
   * Update a report
   */
  async update(id: string, input: UpdateReportInput, userId?: string): Promise<Result<Report>> {
    const existing = await reportsRepo.findById(id);

    if (!existing) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    // Validate title if provided
    if (input.title !== undefined) {
      if (input.title.trim().length < 4) {
        return Result.fail('Title must be at least 4 characters', 'INVALID_TITLE');
      }
      if (input.title.length > 200) {
        return Result.fail('Title must be at most 200 characters', 'INVALID_TITLE');
      }
    }

    // Build update object
    const updates: Partial<Report> = {};

    if (input.title !== undefined) {
      updates.title = input.title.trim();
    }

    if (input.description !== undefined) {
      updates.description = input.description.trim();
    }

    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === 'resolved' && userId) {
        updates.resolvedBy = userId;
      }
    }

    if (input.priority !== undefined) {
      updates.priority = input.priority;
    }

    if (input.assignedTo !== undefined) {
      updates.assignedTo = input.assignedTo ?? undefined;
    }

    if (input.forwardedTo !== undefined) {
      updates.forwardedTo = input.forwardedTo;
    }

    const report = await reportsRepo.update(id, updates);

    if (!report) {
      return Result.fail('Failed to update report', 'UPDATE_FAILED');
    }

    logger.info('Report updated', { reportId: id, updates: Object.keys(updates) });

    // Build changes object for webhooks
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (input.status !== undefined && input.status !== existing.status) {
      changes.status = { old: existing.status, new: input.status };
    }
    if (input.priority !== undefined && input.priority !== existing.priority) {
      changes.priority = { old: existing.priority, new: input.priority };
    }
    if (input.assignedTo !== undefined && input.assignedTo !== existing.assignedTo) {
      changes.assignedTo = { old: existing.assignedTo, new: input.assignedTo };
    }

    // Trigger webhooks via EE hooks if there are changes (async, don't block)
    if (Object.keys(changes).length > 0) {
      getEEHooks()
        .onReportUpdated(report, changes)
        .catch((error) => {
          logger.error('Failed to trigger webhooks for report update', error, { reportId: id });
        });
    }

    // Send email notifications for changes (async, don't block)
    if (changes.status) {
      notificationsService
        .notifyStatusChange(report, changes.status.old as string, changes.status.new as string)
        .catch((error) => {
          logger.error('Failed to send status change notification', error, { reportId: id });
        });
    }

    if (changes.priority) {
      notificationsService
        .notifyPriorityChange(
          report,
          changes.priority.old as string,
          changes.priority.new as string,
        )
        .catch((error) => {
          logger.error('Failed to send priority change notification', error, { reportId: id });
        });
    }

    if (changes.assignedTo && changes.assignedTo.new) {
      notificationsService
        .notifyAssignment(report, changes.assignedTo.new as string)
        .catch((error) => {
          logger.error('Failed to send assignment notification', error, { reportId: id });
        });
    }

    // If report has GitHub issue and there are changes, queue update sync (async, don't block)
    if (report.githubIssueNumber && Object.keys(changes).length > 0) {
      githubSyncService
        .getAutoSyncIntegration(report.projectId)
        .then((integration) => {
          if (integration) {
            syncQueueService.enqueue(report.id, integration.id).catch((error) => {
              logger.error('Failed to queue report update for sync', error, { reportId: id });
            });
          }
        })
        .catch((error) => {
          logger.error('Failed to check for auto-sync integration', error, {
            projectId: report.projectId,
          });
        });
    }

    return Result.ok(report);
  },

  /**
   * Delete a report
   */
  async delete(id: string): Promise<Result<void>> {
    const existing = await reportsRepo.findById(id);

    if (!existing) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    // Trigger webhooks via EE hooks before deletion (async, don't block)
    getEEHooks()
      .onReportDeleted(existing)
      .catch((error) => {
        logger.error('Failed to trigger webhooks for report deletion', error, { reportId: id });
      });

    // Delete files from filesystem
    deleteReportFiles(id);

    // Delete file records (cascade will handle this, but be explicit)
    await filesRepo.deleteByReportId(id);

    // Delete report
    await reportsRepo.delete(id);

    logger.info('Report deleted', { reportId: id });
    return Result.ok(undefined);
  },

  /**
   * Bulk update reports
   */
  async bulkUpdate(
    ids: string[],
    updates: Pick<UpdateReportInput, 'status' | 'priority' | 'assignedTo'>,
  ): Promise<Result<number>> {
    if (ids.length === 0) {
      return Result.fail('No report IDs provided', 'INVALID_INPUT');
    }

    if (ids.length > 100) {
      return Result.fail('Cannot update more than 100 reports at once', 'TOO_MANY_IDS');
    }

    const reportUpdates: Partial<Report> = {};

    if (updates.status !== undefined) {
      reportUpdates.status = updates.status;
    }

    if (updates.priority !== undefined) {
      reportUpdates.priority = updates.priority;
    }

    if (updates.assignedTo !== undefined) {
      reportUpdates.assignedTo = updates.assignedTo ?? undefined;
    }

    const count = await reportsRepo.bulkUpdate(ids, reportUpdates);

    logger.info('Bulk update completed', { count, updates: Object.keys(reportUpdates) });
    return Result.ok(count);
  },

  /**
   * Get report statistics
   */
  async getStats(
    projectId?: string,
  ): Promise<Result<Awaited<ReturnType<typeof reportsRepo.getStats>>>> {
    const stats = await reportsRepo.getStats(projectId);
    return Result.ok(stats);
  },

  /**
   * Add file to report
   */
  async addFile(
    reportId: string,
    file: { data: Buffer | Uint8Array; filename: string; mimeType: string; type: FileType },
  ): Promise<Result<void>> {
    const report = await reportsRepo.findById(reportId);

    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    try {
      const savedFile = await saveFile({
        reportId,
        type: file.type,
        filename: file.filename,
        mimeType: file.mimeType,
        data: file.data,
      });

      await filesRepo.create({
        reportId,
        type: file.type,
        filename: savedFile.filename,
        path: savedFile.path,
        mimeType: savedFile.mimeType,
        sizeBytes: savedFile.sizeBytes,
        width: savedFile.width,
        height: savedFile.height,
      });

      logger.info('File added to report', { reportId, fileId: savedFile.id, type: file.type });
      return Result.ok(undefined);
    } catch (error) {
      logger.error('Failed to add file to report', error, { reportId });
      return Result.fail('Failed to save file', 'FILE_SAVE_FAILED');
    }
  },

  /**
   * Get all files for a report
   */
  async getReportFiles(reportId: string): Promise<Result<FileRecord[]>> {
    const files = await filesRepo.findByReportId(reportId);
    return Result.ok(files);
  },

  /**
   * Serve a file (returns file metadata and binary data)
   */
  async serveFile(
    fileId: string,
  ): Promise<Result<{ file: FileRecord; data: Buffer | Uint8Array }>> {
    const file = await filesRepo.findById(fileId);

    if (!file) {
      return Result.fail('File not found', 'NOT_FOUND');
    }

    const data = readFile(file.path);

    if (!data) {
      return Result.fail('File not found on disk', 'NOT_FOUND');
    }

    return Result.ok({ file, data });
  },
};
