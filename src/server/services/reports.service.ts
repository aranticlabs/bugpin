import { reportsRepo, type CreateReportData } from '../database/repositories/reports.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { saveFile, deleteReportFiles, readFile, validateFile } from '../storage/files.js';
import { settingsCacheService } from './settings-cache.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { notificationsService } from './notifications.service.js';
import { githubSyncService } from './integrations/github-sync.service.js';
import { syncQueueService } from './integrations/sync-queue.service.js';
import { integrationsService } from './integrations.service.js';
import { usersService } from './users.service.js';
import { normalizeUrl } from '../utils/validators.js';
import type {
  Report,
  ReportFilter,
  ReportStatus,
  ReportPriority,
  ReportMetadata,
  ReportSource,
  ManualReportChannel,
  PaginatedResponse,
  FileType,
  FileRecord,
  ForwardedReference,
  LocaleCode,
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
  files?: MediaFile[];
  annotations?: object;
  metadata: ReportMetadata;
  reporterEmail?: string;
  reporterName?: string;
  reporterLocale?: LocaleCode;
}

export interface CreateManualReportInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: ReportPriority;
  assignedTo?: string | null;
  reporterEmail?: string;
  reporterName?: string;
  url?: string;
  channel?: ManualReportChannel;
  files?: MediaFile[];
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

async function validateAssignee(assignedTo: string | null | undefined): Promise<Result<void>> {
  if (assignedTo === undefined || assignedTo === null) {
    return Result.ok(undefined);
  }

  const assigneeResult = await usersService.getAssignableById(assignedTo);
  if (!assigneeResult.success) {
    return Result.fail(assigneeResult.error, 'INVALID_ASSIGNEE');
  }

  return Result.ok(undefined);
}

async function resolveDefaultAssignee(projectId: string, userId: string | null | undefined) {
  if (!userId) {
    return undefined;
  }

  const assigneeResult = await usersService.getAssignableById(userId);
  if (!assigneeResult.success) {
    logger.warn('Skipping invalid project default assignee during report creation', {
      projectId,
      userId,
      code: assigneeResult.code,
    });
    return undefined;
  }

  return userId;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalUrl(value: string | undefined): string | undefined {
  const normalized = value ? normalizeUrl(value) : '';
  return normalized || undefined;
}

function determineFileType(mimeType: string): FileType {
  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('image/')) {
    return 'screenshot';
  }

  return 'attachment';
}

async function validateSubmittedFiles(
  files: MediaFile[] | undefined,
  strict: boolean
): Promise<Result<void>> {
  if (!files?.length) {
    return Result.ok(undefined);
  }

  const settings = await settingsCacheService.getAll();
  const maxImageSizeMb = settings.screenshot.maxImageUploadSizeMb ?? 10;
  const maxVideoSizeMb = settings.screenshot.maxVideoUploadSizeMb ?? 50;

  for (const file of files) {
    const fileType = determineFileType(file.mimeType);
    const validation = validateFile({
      data: file.data,
      mimeType: file.mimeType,
      type: fileType,
      maxSizeMb: fileType === 'video' ? maxVideoSizeMb : maxImageSizeMb,
    });

    if (!validation.success) {
      if (strict) {
        return Result.fail(validation.error, validation.code);
      }

      logger.warn('Submitted file rejected', {
        filename: file.filename,
        mimeType: file.mimeType,
        reason: validation.error,
        code: validation.code,
      });
    }
  }

  return Result.ok(undefined);
}

async function saveSubmittedFiles(
  reportId: string,
  files: MediaFile[] | undefined,
  strict: boolean
): Promise<Result<void>> {
  if (!files?.length) {
    return Result.ok(undefined);
  }

  for (const file of files) {
    const fileType = determineFileType(file.mimeType);

    const validation = await validateSubmittedFiles([file], strict);
    if (!validation.success) {
      return validation;
    }

    try {
      const savedFile = await saveFile({
        reportId,
        type: fileType,
        filename: file.filename,
        mimeType: file.mimeType,
        data: file.data,
      });

      await filesRepo.create({
        reportId,
        type: fileType,
        filename: savedFile.filename,
        path: savedFile.path,
        mimeType: savedFile.mimeType,
        sizeBytes: savedFile.sizeBytes,
        width: savedFile.width,
        height: savedFile.height,
      });

      logger.info('Submitted file saved for report', {
        reportId,
        fileId: savedFile.id,
        type: fileType,
      });
    } catch (error) {
      logger.error('Failed to save submitted file', error, {
        reportId,
        filename: file.filename,
      });

      if (strict) {
        return Result.fail('Failed to save uploaded file', 'FILE_SAVE_FAILED');
      }
    }
  }

  return Result.ok(undefined);
}

async function createForProject(
  project: Awaited<ReturnType<typeof projectsRepo.findById>> extends infer T
    ? NonNullable<T>
    : never,
  input: {
    title: string;
    description?: string;
    priority?: ReportPriority;
    annotations?: object;
    metadata: ReportMetadata;
    reporterEmail?: string;
    reporterName?: string;
    reporterLocale?: LocaleCode;
    files?: MediaFile[];
  },
  options: {
    source: ReportSource;
    requestedAssignee?: string | null;
    sendReporterSubmission: boolean;
    strictFileValidation: boolean;
  }
): Promise<Result<Report>> {
  if (!input.title || input.title.trim().length < 4) {
    return Result.fail('Title must be at least 4 characters', 'INVALID_TITLE');
  }

  if (input.title.length > 200) {
    return Result.fail('Title must be at most 200 characters', 'INVALID_TITLE');
  }

  let assignedTo: string | undefined;
  if (options.requestedAssignee === undefined) {
    assignedTo = await resolveDefaultAssignee(project.id, project.settings?.defaultAssigneeUserId);
  } else if (options.requestedAssignee !== null) {
    const assigneeValidation = await validateAssignee(options.requestedAssignee);
    if (!assigneeValidation.success) {
      return assigneeValidation;
    }

    assignedTo = options.requestedAssignee;
  }

  const fileValidation = await validateSubmittedFiles(input.files, options.strictFileValidation);
  if (!fileValidation.success) {
    return fileValidation;
  }

  const reportData: CreateReportData = {
    projectId: project.id,
    source: options.source,
    title: input.title.trim(),
    description: normalizeOptionalText(input.description),
    priority: input.priority ?? 'medium',
    assignedTo,
    annotations: input.annotations,
    metadata: input.metadata,
    reporterEmail: normalizeOptionalText(input.reporterEmail),
    reporterName: normalizeOptionalText(input.reporterName),
    reporterLocale: input.reporterLocale ?? 'en',
  };

  const report = await reportsRepo.create(reportData);

  const saveFilesResult = await saveSubmittedFiles(
    report.id,
    input.files,
    options.strictFileValidation
  );
  if (!saveFilesResult.success) {
    if (options.strictFileValidation) {
      deleteReportFiles(report.id);
      await filesRepo.deleteByReportId(report.id);
      await reportsRepo.delete(report.id);
    }
    return saveFilesResult;
  }

  logger.info('Report created', {
    reportId: report.id,
    projectId: project.id,
    title: report.title,
    source: report.source,
  });

  getEEHooks()
    .onReportCreated(report)
    .catch((error) => {
      logger.error('Failed to trigger webhooks for report creation', error, {
        reportId: report.id,
      });
    });

  notificationsService.notifyNewReport(report).catch((error) => {
    logger.error('Failed to send email notification for new report', error, {
      reportId: report.id,
    });
  });

  if (options.sendReporterSubmission) {
    notificationsService.notifyReporterSubmission(report).catch((error) => {
      logger.error('Failed to send reporter submission confirmation', error, {
        reportId: report.id,
      });
    });
  }

  if (assignedTo) {
    notificationsService.notifyAssignment(report, assignedTo).catch((error) => {
      logger.error('Failed to send assignment notification', error, { reportId: report.id });
    });

    notificationsService.notifyReporterAssignment(report, undefined, assignedTo).catch((error) => {
      logger.error('Failed to send reporter assignment notification', error, {
        reportId: report.id,
      });
    });
  }

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

  // Auto-forward to integrations that opt in (e.g. Jira), async, don't block
  integrationsService.autoForwardNewReport(report.id, project.id).catch((error) => {
    logger.error('Failed to auto-forward report', error, { reportId: report.id });
  });

  return Result.ok(report);
}

// Service

export const reportsService = {
  /**
   * Create a new bug report (from widget submission)
   */
  async create(input: CreateReportInput): Promise<Result<Report>> {
    const project = await projectsRepo.findByApiKey(input.apiKey);
    if (!project) {
      logger.warn('Invalid API key', { apiKey: input.apiKey });
      return Result.fail('Invalid API key', 'INVALID_API_KEY');
    }

    return createForProject(
      project,
      {
        title: input.title,
        description: input.description,
        priority: input.priority,
        annotations: input.annotations,
        metadata: input.metadata,
        reporterEmail: input.reporterEmail,
        reporterName: input.reporterName,
        reporterLocale: input.reporterLocale,
        files: input.files,
      },
      {
        source: 'widget',
        sendReporterSubmission: true,
        strictFileValidation: false,
      }
    );
  },

  async createManual(input: CreateManualReportInput, userId: string): Promise<Result<Report>> {
    const project = await projectsRepo.findById(input.projectId);

    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    if (!project.isActive) {
      return Result.fail('Project is inactive', 'PROJECT_INACTIVE');
    }

    const metadata: ReportMetadata = {
      timestamp: new Date().toISOString(),
      url: normalizeOptionalUrl(input.url),
      manualContext: {
        channel: input.channel,
        submittedByUserId: userId,
      },
    };

    return createForProject(
      project,
      {
        title: input.title,
        description: input.description,
        priority: input.priority,
        metadata,
        reporterEmail: input.reporterEmail,
        reporterName: input.reporterName,
        files: input.files,
      },
      {
        source: 'manual',
        requestedAssignee: input.assignedTo,
        sendReporterSubmission: false,
        strictFileValidation: true,
      }
    );
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
    id: string
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
      const assigneeValidation = await validateAssignee(input.assignedTo);
      if (!assigneeValidation.success) {
        return assigneeValidation;
      }

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

      // Notify reporter of status change (async, don't block)
      notificationsService
        .notifyReporterStatusChange(
          report,
          changes.status.old as ReportStatus,
          changes.status.new as ReportStatus
        )
        .catch((error) => {
          logger.error('Failed to send reporter status change notification', error, {
            reportId: id,
          });
        });
    }

    if (changes.priority) {
      notificationsService
        .notifyPriorityChange(
          report,
          changes.priority.old as string,
          changes.priority.new as string
        )
        .catch((error) => {
          logger.error('Failed to send priority change notification', error, { reportId: id });
        });

      // Notify reporter of priority change (async, don't block)
      notificationsService
        .notifyReporterPriorityChange(
          report,
          changes.priority.old as ReportPriority,
          changes.priority.new as ReportPriority
        )
        .catch((error) => {
          logger.error('Failed to send reporter priority change notification', error, {
            reportId: id,
          });
        });
    }

    if (changes.assignedTo && changes.assignedTo.new) {
      notificationsService
        .notifyAssignment(report, changes.assignedTo.new as string)
        .catch((error) => {
          logger.error('Failed to send assignment notification', error, { reportId: id });
        });

      notificationsService
        .notifyReporterAssignment(
          report,
          (changes.assignedTo.old as string | undefined) ?? undefined,
          changes.assignedTo.new as string
        )
        .catch((error) => {
          logger.error('Failed to send reporter assignment notification', error, {
            reportId: id,
          });
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

    // Send deletion notification before deleting (async, don't block)
    notificationsService.notifyReportDeleted(existing).catch((error) => {
      logger.error('Failed to send report deleted notification', error, { reportId: id });
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
    userId?: string
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
      const assigneeValidation = await validateAssignee(updates.assignedTo);
      if (!assigneeValidation.success) {
        return assigneeValidation;
      }

      reportUpdates.assignedTo = updates.assignedTo ?? undefined;
    }

    if (updates.assignedTo !== undefined) {
      let count = 0;

      for (const id of ids) {
        const result = await this.update(id, updates, userId);
        if (result.success) {
          count += 1;
        }
      }

      logger.info('Bulk update completed', { count, updates: Object.keys(reportUpdates) });
      return Result.ok(count);
    }

    const count = await reportsRepo.bulkUpdate(ids, reportUpdates);

    logger.info('Bulk update completed', { count, updates: Object.keys(reportUpdates) });
    return Result.ok(count);
  },

  /**
   * Get report statistics
   */
  async getStats(
    projectId?: string
  ): Promise<Result<Awaited<ReturnType<typeof reportsRepo.getStats>>>> {
    const stats = await reportsRepo.getStats(projectId);
    return Result.ok(stats);
  },

  /**
   * Add file to report
   */
  async addFile(
    reportId: string,
    file: { data: Buffer | Uint8Array; filename: string; mimeType: string; type: FileType }
  ): Promise<Result<void>> {
    const report = await reportsRepo.findById(reportId);

    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    // Validate file before saving
    const settings = await settingsCacheService.getAll();
    const maxSizeMb =
      file.type === 'video'
        ? (settings.screenshot.maxVideoUploadSizeMb ?? 50)
        : (settings.screenshot.maxImageUploadSizeMb ?? 10);
    const validation = validateFile({
      data: file.data,
      mimeType: file.mimeType,
      type: file.type,
      maxSizeMb,
    });

    if (!validation.success) {
      return Result.fail(validation.error, validation.code);
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
    fileId: string
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
