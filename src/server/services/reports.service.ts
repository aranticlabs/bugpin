import { realtimeService } from './realtime.service.js';
import {
  InvalidReportCursorError,
  reportsRepo,
  type CreateReportData,
} from '../database/repositories/reports.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import {
  saveFile,
  deleteReportFiles,
  createStoredFileHandle,
  type StoredFileHandle,
  validateFile,
  validateFileContent,
} from '../storage/files.js';
import { settingsCacheService } from './settings-cache.service.js';
import { Result } from '../utils/result.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { logger } from '../utils/logger.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { notificationsService } from './notifications.service.js';
import { githubSyncService } from './integrations/github-sync.service.js';
import { syncQueueService } from './integrations/sync-queue.service.js';
import { usersService } from './users.service.js';
import { reportHistoryService } from './report-history.service.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { reporterOwnershipService } from './reporter-ownership.service.js';
import { normalizeUrl } from '../utils/validators.js';
import { inspectRecording, remuxRecording } from './video-remux.service.js';
import type {
  Report,
  ReportFilter,
  ReportStatus,
  ReportPriority,
  ReportBoardMove,
  ReportMetadata,
  ReportSource,
  ManualReportChannel,
  PaginatedResponse,
  FileType,
  FileRecord,
  LocaleCode,
  Project,
} from '@shared/types';

// Types

export interface MediaFile {
  data: Buffer | Uint8Array;
  filename: string;
  mimeType: string;
  isRecording?: boolean;
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
  submissionId?: string;
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

async function validateSubmittedFiles(files: MediaFile[] | undefined): Promise<Result<void>> {
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
      return Result.fail(validation.error, validation.code);
    }
  }

  return Result.ok(undefined);
}

interface RecordingPolicy {
  allowMicrophone: boolean;
  maxDurationSeconds: number;
}

// Browsers stop recorders asynchronously and container timestamps round, so a recording stopped
// exactly at the limit can measure slightly longer.
const RECORDING_DURATION_TOLERANCE_SECONDS = 5;
const DEFAULT_MAX_RECORDING_DURATION_SECONDS = 180;

async function resolveRecordingPolicy(
  project: Pick<Project, 'settings'>
): Promise<RecordingPolicy> {
  const settings = await settingsCacheService.getAll();
  const projectScreenshot = project.settings?.screenshot;
  const globalScreenshot = settings.screenshot;
  return {
    allowMicrophone:
      projectScreenshot?.allowRecordingMicrophone ??
      globalScreenshot?.allowRecordingMicrophone ??
      false,
    maxDurationSeconds:
      projectScreenshot?.maxRecordingDurationSeconds ??
      globalScreenshot?.maxRecordingDurationSeconds ??
      DEFAULT_MAX_RECORDING_DURATION_SECONDS,
  };
}

/**
 * Recordings the server cannot parse are kept, matching the remux fallback: the same bytes are
 * accepted through the regular media field, so failing closed here would not add protection.
 */
async function checkRecordingPolicy(
  file: MediaFile,
  policy: RecordingPolicy
): Promise<Result<void>> {
  const inspection = await inspectRecording(file);
  if (!inspection.success) {
    logger.warn('Recording inspection failed, skipping policy checks', {
      filename: file.filename,
      reason: inspection.error,
      code: inspection.code,
    });
    return Result.ok(undefined);
  }

  if (inspection.value.hasAudio && !policy.allowMicrophone) {
    return Result.fail(
      'Recording contains audio but microphone recording is disabled',
      'RECORDING_AUDIO_NOT_ALLOWED'
    );
  }

  if (
    inspection.value.durationSeconds >
    policy.maxDurationSeconds + RECORDING_DURATION_TOLERANCE_SECONDS
  ) {
    return Result.fail(
      `Recording is ${Math.round(inspection.value.durationSeconds)} seconds; maximum is ${policy.maxDurationSeconds} seconds`,
      'RECORDING_TOO_LONG'
    );
  }

  return Result.ok(undefined);
}

async function saveSubmittedFiles(
  reportId: string,
  files: MediaFile[] | undefined,
  strict: boolean,
  recordingPolicy: RecordingPolicy | undefined
): Promise<Result<void>> {
  if (!files?.length) {
    return Result.ok(undefined);
  }

  for (const file of files) {
    const fileType = determineFileType(file.mimeType);

    if (!strict) {
      const validation = validateFileContent({
        data: file.data,
        mimeType: file.mimeType,
        type: fileType,
      });
      if (!validation.success) {
        logger.warn('Submitted file rejected', {
          filename: file.filename,
          mimeType: file.mimeType,
          reason: validation.error,
          code: validation.code,
        });
        continue;
      }
    }

    if (file.isRecording && recordingPolicy) {
      const policyCheck = await checkRecordingPolicy(file, recordingPolicy);
      if (!policyCheck.success) {
        if (strict) {
          return policyCheck;
        }
        logger.warn('Submitted file rejected', {
          filename: file.filename,
          mimeType: file.mimeType,
          reason: policyCheck.error,
          code: policyCheck.code,
        });
        continue;
      }
    }

    try {
      let data = file.data;
      if (file.isRecording) {
        const remuxResult = await remuxRecording(file);
        if (remuxResult.success) {
          data = remuxResult.value;
        } else {
          logger.warn('Recording remux failed, storing original', {
            filename: file.filename,
            reason: remuxResult.error,
            code: remuxResult.code,
          });
        }
      }

      const savedFile = await saveFile({
        reportId,
        type: fileType,
        filename: file.filename,
        mimeType: file.mimeType,
        data,
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
    submissionId?: string;
  },
  options: {
    source: ReportSource;
    requestedAssignee?: string | null;
    sendReporterSubmission: boolean;
    strictFileValidation: boolean;
    createdByUserId?: string | null;
  }
): Promise<Result<Report>> {
  const access = checkProjectLicense(project.id);
  if (!access.success) return access;

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

  if (options.strictFileValidation) {
    const fileValidation = await validateSubmittedFiles(input.files);
    if (!fileValidation.success) {
      return fileValidation;
    }
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
    claimableEmail:
      options.source === 'widget' &&
      project.settings.reporterPortal?.enabled &&
      input.reporterEmail?.trim()
        ? normalizeEmail(input.reporterEmail)
        : undefined,
    submissionId: input.submissionId,
  };

  const report = await reportsRepo.create(reportData);

  const recordingPolicy = input.files?.some((file) => file.isRecording)
    ? await resolveRecordingPolicy(project)
    : undefined;
  const saveFilesResult = await saveSubmittedFiles(
    report.id,
    input.files,
    options.strictFileValidation,
    recordingPolicy
  );
  if (!saveFilesResult.success) {
    if (options.strictFileValidation) {
      await deleteReportFiles(report.id);
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

  await reportHistoryService.record(report.id, options.createdByUserId ?? null, 'created');

  if (assignedTo) {
    await reportHistoryService.record(
      report.id,
      options.createdByUserId ?? null,
      'assignee_changed',
      null,
      assignedTo
    );
  }

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

  realtimeService.publish('report.updated', { reportId: report.id, projectId: report.projectId });
  return Result.ok(report);
}

// Service

type ReportChanges = Record<string, { old: unknown; new: unknown }>;

/** Webhooks, notifications, and GitHub sync for committed report changes; none of them block */
function announceReportChanges(report: Report, changes: ReportChanges): void {
  realtimeService.publish('report.updated', { reportId: report.id, projectId: report.projectId });
  // Trigger webhooks via EE hooks if there are changes (async, don't block)
  if (Object.keys(changes).length > 0) {
    getEEHooks()
      .onReportUpdated(report, changes)
      .catch((error) => {
        logger.error('Failed to trigger webhooks for report update', error, {
          reportId: report.id,
        });
      });
  }

  // Send email notifications for changes (async, don't block)
  if (changes.status) {
    notificationsService
      .notifyStatusChange(report, changes.status.old as string, changes.status.new as string)
      .catch((error) => {
        logger.error('Failed to send status change notification', error, { reportId: report.id });
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
          reportId: report.id,
        });
      });
  }

  if (changes.priority) {
    notificationsService
      .notifyPriorityChange(report, changes.priority.old as string, changes.priority.new as string)
      .catch((error) => {
        logger.error('Failed to send priority change notification', error, { reportId: report.id });
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
          reportId: report.id,
        });
      });
  }

  if (changes.assignedTo && changes.assignedTo.new) {
    notificationsService
      .notifyAssignment(report, changes.assignedTo.new as string)
      .catch((error) => {
        logger.error('Failed to send assignment notification', error, { reportId: report.id });
      });

    notificationsService
      .notifyReporterAssignment(
        report,
        (changes.assignedTo.old as string | undefined) ?? undefined,
        changes.assignedTo.new as string
      )
      .catch((error) => {
        logger.error('Failed to send reporter assignment notification', error, {
          reportId: report.id,
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
            logger.error('Failed to queue report update for sync', error, { reportId: report.id });
          });
        }
      })
      .catch((error) => {
        logger.error('Failed to check for auto-sync integration', error, {
          projectId: report.projectId,
        });
      });
  }
}

const MIN_BOARD_GAP = 1e-6;

/** A position between two neighbors, or null when they are too close to fit another one */
export function positionBetween(previous?: number, next?: number): number | null {
  if (previous === undefined) return next === undefined ? 0 : next - 1;
  if (next === undefined) return previous + 1;
  if (next - previous < MIN_BOARD_GAP) return null;
  return (previous + next) / 2;
}

/** The positions a dropped report goes between, from the neighbors that are still in the column */
function boardBounds(
  id: string,
  target: ReportBoardMove
): { above: number | undefined; below: number | undefined } {
  const placements = reportsRepo.boardPlacements(
    [target.previousId, target.nextId].filter((neighborId): neighborId is string =>
      Boolean(neighborId)
    )
  );
  const inColumn = (neighborId: string | null | undefined) => {
    const placement = neighborId ? placements.get(neighborId) : undefined;
    return placement?.status === target.status ? placement : undefined;
  };
  const previous = inColumn(target.previousId);
  const next = inColumn(target.nextId);

  // The card above anchors the drop and the card below it is looked up again, so a client with
  // an outdated view of the column still places the report directly under that card.
  if (previous) {
    return {
      above: previous.position,
      below: reportsRepo.adjacentBoardPosition(target.status, id, { after: previous.position }),
    };
  }
  if (next) {
    return {
      above: reportsRepo.adjacentBoardPosition(target.status, id, { before: next.position }),
      below: next.position,
    };
  }
  // Neighbors that left the column since the client loaded it: a drop below a card goes to the
  // end of the column, anything else to the top.
  if (target.previousId) {
    return {
      above: reportsRepo.adjacentBoardPosition(target.status, id, 'last'),
      below: undefined,
    };
  }
  return { above: undefined, below: reportsRepo.adjacentBoardPosition(target.status, id, 'first') };
}

function statusUpdates(status: ReportStatus, userId: string | undefined): Partial<Report> {
  return status === 'resolved' && userId ? { status, resolvedBy: userId } : { status };
}

class BoardPlacementError extends Error {}

const MAX_BOARD_MOVE = 100;

/** Writes a report's position between its neighbors, renumbering the column when they touch */
function placeOnBoard(id: string, target: ReportBoardMove): void {
  let { above, below } = boardBounds(id, target);
  let position = positionBetween(above, below);
  if (position === null) {
    reportsRepo.renumberBoardColumn(target.status);
    ({ above, below } = boardBounds(id, target));
    position = positionBetween(above, below);
  }
  if (position === null) {
    throw new BoardPlacementError('No room between the neighbors after renumbering');
  }
  reportsRepo.setBoardPosition(id, position);
}

export const reportsService = {
  reporterActivityCount(): Result<number> {
    return Result.ok(reportsRepo.countReporterActivity());
  },

  async acknowledgeReporterActivity(id: string): Promise<Result<void>> {
    const report = await reportsRepo.findById(id);
    if (!report) return Result.fail('Report not found', 'NOT_FOUND');
    const access = checkProjectLicense(report.projectId);
    if (!access.success) return access;
    reportsRepo.acknowledgeReporterActivity(id);
    realtimeService.publish('reporter_activity.changed', {
      reportId: id,
      projectId: report.projectId,
    });
    return Result.ok(undefined);
  },

  /** The report an earlier widget submission with this id created, if any */
  findIdByWidgetSubmission(projectId: string, submissionId: string): string | null {
    return reportsRepo.findIdBySubmission(projectId, submissionId);
  },

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
        submissionId: input.submissionId,
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
        createdByUserId: userId,
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

    const files = await filesRepo.findOriginalByReportId(id);

    return Result.ok({
      report: {
        ...report,
        licenseLocked: !checkProjectLicense(report.projectId).success,
        owner: Result.unwrap(reporterOwnershipService.describeOwner(report)),
      },
      files,
    });
  },

  /**
   * List reports with filtering and pagination
   */
  async list(filter: ReportFilter): Promise<Result<PaginatedResponse<Report>>> {
    let result: Awaited<ReturnType<typeof reportsRepo.find>>;
    try {
      result = await reportsRepo.find(filter);
    } catch (error) {
      if (error instanceof InvalidReportCursorError) {
        return Result.fail('The cursor does not match this list', 'INVALID_CURSOR');
      }
      throw error;
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    return Result.ok({
      data: result.data.map((report) => ({
        ...report,
        licenseLocked: !checkProjectLicense(report.projectId).success,
      })),
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      nextCursor: result.nextCursor,
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

    const access = checkProjectLicense(existing.projectId);
    if (!access.success) return access;

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
      Object.assign(updates, statusUpdates(input.status, userId));
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

    const report = await reportsRepo.update(id, updates, Boolean(userId));

    if (!report) {
      return Result.fail('Failed to update report', 'UPDATE_FAILED');
    }

    logger.info('Report updated', { reportId: id, updates: Object.keys(updates) });

    // Build changes object for webhooks
    const changes: ReportChanges = {};
    if (input.status !== undefined && input.status !== existing.status) {
      changes.status = { old: existing.status, new: input.status };
    }
    if (input.priority !== undefined && input.priority !== existing.priority) {
      changes.priority = { old: existing.priority, new: input.priority };
    }
    const previousAssignee = existing.assignedTo ?? null;
    const nextAssignee =
      input.assignedTo !== undefined ? (input.assignedTo ?? null) : previousAssignee;
    if (input.assignedTo !== undefined && nextAssignee !== previousAssignee) {
      changes.assignedTo = { old: previousAssignee, new: nextAssignee };
    }

    if (changes.status) {
      await reportHistoryService.record(
        id,
        userId ?? null,
        'status_changed',
        changes.status.old as string,
        changes.status.new as string
      );
    }

    if (changes.priority) {
      await reportHistoryService.record(
        id,
        userId ?? null,
        'priority_changed',
        changes.priority.old as string,
        changes.priority.new as string
      );
    }

    if (changes.assignedTo) {
      await reportHistoryService.record(
        id,
        userId ?? null,
        'assignee_changed',
        (changes.assignedTo.old as string | null) ?? null,
        (changes.assignedTo.new as string | null) ?? null
      );
    }

    announceReportChanges(report, changes);
    return Result.ok(report);
  },

  /**
   * Places a report in a board column between two neighbors, changing its status when the
   * column differs. A missing neighbor means the report goes to that end of the column, and a
   * neighbor that has left the column is ignored. With `adoptSort`, the scoped reports' hand-made
   * order first becomes that sort, so a drop on a sorted board keeps every other card where the
   * user saw it. All writes commit together; notifications follow the commit.
   */
  async moveOnBoard(id: string, target: ReportBoardMove, userId?: string): Promise<Result<Report>> {
    const moved = await this.moveManyOnBoard([id], target, userId);
    return moved.success ? Result.ok(moved.value[0]) : moved;
  },

  /**
   * Places several reports, in the given order, as one block at a board position. The first goes
   * between the neighbors and each next one directly under the one before it. Either every report
   * moves or none does.
   */
  async moveManyOnBoard(
    ids: string[],
    target: ReportBoardMove,
    userId?: string
  ): Promise<Result<Report[]>> {
    if (ids.length === 0) {
      return Result.fail('No report IDs provided', 'INVALID_INPUT');
    }
    if (ids.length > MAX_BOARD_MOVE) {
      return Result.fail(`Cannot move more than ${MAX_BOARD_MOVE} reports at once`, 'TOO_MANY_IDS');
    }
    if (new Set(ids).size !== ids.length) {
      return Result.fail('Each report can be moved only once', 'INVALID_INPUT');
    }
    if (
      (target.previousId && ids.includes(target.previousId)) ||
      (target.nextId && ids.includes(target.nextId))
    ) {
      return Result.fail('A moved report cannot be a neighbor', 'INVALID_BOARD_POSITION');
    }

    const existing: Report[] = [];
    for (const id of ids) {
      const report = await reportsRepo.findById(id);
      if (!report) return Result.fail('Report not found', 'NOT_FOUND');
      const access = checkProjectLicense(report.projectId);
      if (!access.success) return access;
      existing.push(report);
    }

    const adoptSort = target.adoptSort?.sortBy === 'position' ? undefined : target.adoptSort;

    try {
      reportsRepo.transaction(() => {
        if (adoptSort) {
          reportsRepo.adoptBoardOrder(adoptSort.sortBy, adoptSort.sortOrder, adoptSort.scope ?? {});
        }
        existing.forEach((report, index) => {
          if (report.status !== target.status) {
            reportsRepo.applyUpdate(
              report.id,
              statusUpdates(target.status, userId),
              Boolean(userId)
            );
            reportHistoryRepo.insert({
              reportId: report.id,
              userId: userId ?? null,
              action: 'status_changed',
              oldValue: report.status,
              newValue: target.status,
            });
          }
          const slot: ReportBoardMove =
            index === 0 ? target : { ...target, previousId: existing[index - 1].id };
          placeOnBoard(report.id, slot);
        });
      });
    } catch (error) {
      if (error instanceof BoardPlacementError) {
        logger.error('Failed to place reports on the board', error, { reportIds: ids });
        return Result.fail('Failed to move report', 'UPDATE_FAILED');
      }
      throw error;
    }

    const moved: Report[] = [];
    for (const before of existing) {
      const report = await reportsRepo.findById(before.id);
      if (!report) return Result.fail('Failed to move report', 'UPDATE_FAILED');
      moved.push(report);
      if (before.status !== target.status) {
        logger.info('Report updated', { reportId: report.id, updates: ['status'] });
        announceReportChanges(report, { status: { old: before.status, new: target.status } });
      }
    }
    return Result.ok(moved);
  },

  /**
   * Delete a report
   */
  async delete(id: string): Promise<Result<void>> {
    const existing = await reportsRepo.findById(id);

    if (!existing) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    const access = checkProjectLicense(existing.projectId);
    if (!access.success) return access;

    try {
      await deleteReportFiles(id);
    } catch (error) {
      logger.error('Failed to delete report files', error, { reportId: id });
      return Result.fail(
        'Stored files could not be deleted; retry deletion',
        'STORAGE_DELETE_FAILED'
      );
    }

    // Delete file records (cascade will handle this, but be explicit)
    await filesRepo.deleteByReportId(id);

    // Delete report
    await reportsRepo.delete(id);

    // Trigger webhooks via EE hooks after deletion (async, don't block)
    getEEHooks()
      .onReportDeleted(existing)
      .catch((error) => {
        logger.error('Failed to trigger webhooks for report deletion', error, { reportId: id });
      });

    // Send deletion notification after deleting (async, don't block)
    notificationsService.notifyReportDeleted(existing).catch((error) => {
      logger.error('Failed to send report deleted notification', error, { reportId: id });
    });

    logger.info('Report deleted', { reportId: id });
    realtimeService.publish('report.updated', { reportId: id, projectId: existing.projectId });
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

    for (const id of ids) {
      const report = await reportsRepo.findById(id);
      if (!report) return Result.fail('Report not found', 'NOT_FOUND');
      const access = checkProjectLicense(report.projectId);
      if (!access.success) return access;
    }

    if (updates.assignedTo !== undefined) {
      const assigneeValidation = await validateAssignee(updates.assignedTo);
      if (!assigneeValidation.success) {
        return assigneeValidation;
      }
    }

    let count = 0;

    for (const id of ids) {
      const result = await this.update(id, updates, userId);
      if (result.success) {
        count += 1;
      }
    }

    logger.info('Bulk update completed', { count, updates: Object.keys(updates) });
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

    const access = checkProjectLicense(report.projectId);
    if (!access.success) return access;

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
   * Get original files for a report
   */
  async getReportFiles(reportId: string): Promise<Result<FileRecord[]>> {
    const files = await filesRepo.findOriginalByReportId(reportId);
    return Result.ok(files);
  },

  async serveFile(
    reportId: string,
    fileId: string
  ): Promise<Result<{ file: FileRecord; handle: StoredFileHandle }>> {
    const file = await filesRepo.findById(fileId);

    if (!file || file.reportId !== reportId) {
      return Result.fail('File not found', 'NOT_FOUND');
    }

    return Result.ok({ file, handle: createStoredFileHandle(file.path) });
  },
};
