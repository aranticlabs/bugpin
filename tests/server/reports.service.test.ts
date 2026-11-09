import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { reportsService } from '../../src/server/services/reports.service';
import * as videoRemuxService from '../../src/server/services/video-remux.service';
import { reporterOwnershipRepo } from '../../src/server/database/repositories/reporter-ownership.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { registerEEHooks, resetEEHooks } from '../../src/server/utils/ee-hooks';
import { notificationsService } from '../../src/server/services/notifications.service';
import { githubSyncService } from '../../src/server/services/integrations/github-sync.service';
import { syncQueueService } from '../../src/server/services/integrations/sync-queue.service';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { usersService } from '../../src/server/services/users.service';
import { reportHistoryService } from '../../src/server/services/report-history.service';
import { Result } from '../../src/server/utils/result';
import { config } from '../../src/server/config';
import { logger } from '../../src/server/utils/logger';
import type { Report, ReportMetadata, Project, AppSettings } from '../../src/shared/types';
import { createDefaultHooks } from '../../src/server/types/ee-plugin';
import type { CreateFileData } from '../../src/server/database/repositories/interfaces';

// Valid file buffers with correct magic bytes for validation
const validPngBuffer = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6360000000020001E221BC330000000049454E44AE426082',
  'hex'
);
const validMp4Buffer = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70, // ftyp at offset 4
  0x69,
  0x73,
  0x6f,
  0x6d,
  0x00,
  0x00,
  0x00,
  0x00,
]);

const baseMetadata: ReportMetadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop', os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};

const baseProject: Project = {
  id: 'prj_1',
  name: 'Project One',
  apiKey: 'proj_key',
  settings: {},
  reportsCount: 0,
  isActive: true,
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  source: 'widget',
  reporterLocale: 'en',
  title: 'Bug report',
  description: 'Details',
  status: 'open',
  priority: 'medium',
  metadata: baseMetadata,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalOwnershipRepo = { ...reporterOwnershipRepo };
const originalReportsRepo = { ...reportsRepo };
const originalProjectsRepo = { ...projectsRepo };
const originalFilesRepo = { ...filesRepo };
const originalNotificationsService = { ...notificationsService };
const originalGithubSyncService = { ...githubSyncService };
const originalSyncQueueService = { ...syncQueueService };
const originalUsersService = { ...usersService };
const originalReportHistoryService = { ...reportHistoryService };
const originalSettingsCacheGetAll = settingsCacheService.getAll.bind(settingsCacheService);
const originalLoggerWarn = logger.warn;
const originalConfig = { ...config };
let tempDir = '';

let reportById: Report | null = baseReport;
let projectByApiKey: Project | null = baseProject;
let updatedReport: Report | null = baseReport;
let createdReportInput: unknown;
let updatePayload: unknown;
let webhooksCreatedCalls = 0;
let webhooksUpdatedArgs: Array<{ reportId: string; changes: Record<string, unknown> }> = [];
let webhooksDeletedCalls = 0;
let notifyNewReportCalls = 0;
let notifyReporterSubmissionCalls = 0;
let notifyStatusCalls = 0;
let notifyPriorityCalls = 0;
let notifyAssignmentCalls = 0;
let notifyReporterAssignmentCalls = 0;
let syncQueueCalls: Array<{ reportId: string; integrationId: string }> = [];
let fileCreateTypes: string[] = [];
let fileCreateRecords: CreateFileData[] = [];
let warningCalls: Array<{ message: string; context?: Record<string, unknown> }> = [];

beforeEach(() => {
  reporterOwnershipRepo.findByReportId = () => null;
  reportById = baseReport;
  projectByApiKey = baseProject;
  updatedReport = baseReport;
  createdReportInput = undefined;
  updatePayload = undefined;
  webhooksCreatedCalls = 0;
  webhooksUpdatedArgs = [];
  webhooksDeletedCalls = 0;
  notifyNewReportCalls = 0;
  notifyReporterSubmissionCalls = 0;
  notifyStatusCalls = 0;
  notifyPriorityCalls = 0;
  notifyAssignmentCalls = 0;
  notifyReporterAssignmentCalls = 0;
  syncQueueCalls = [];
  fileCreateTypes = [];
  fileCreateRecords = [];
  warningCalls = [];
  logger.warn = (message, context) => {
    warningCalls.push({ message, context });
  };

  projectsRepo.findByApiKey = async () => projectByApiKey;
  reportsRepo.create = async (input) => {
    createdReportInput = input;
    return { ...baseReport, ...input, id: 'rpt_new' };
  };
  reportsRepo.findById = async () => reportById;
  reportsRepo.find = async () => ({ data: [baseReport], total: 1, nextCursor: null });
  reportsRepo.update = async (_id, updates) => {
    updatePayload = updates;
    return updatedReport ? { ...updatedReport, ...updates } : null;
  };
  reportsRepo.delete = async () => true;
  reportsRepo.bulkUpdate = async () => 3;
  reportsRepo.getStats = async () =>
    ({ total: 1, byStatus: { open: 1 }, byPriority: { medium: 1 } }) as never;

  filesRepo.findByReportId = async () => [];
  filesRepo.findOriginalByReportId = async () => [];
  filesRepo.create = async (input) => {
    fileCreateTypes.push(input.type);
    fileCreateRecords.push(input);
    return {
      id: 'file_1',
      ...input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never;
  };
  filesRepo.deleteByReportId = async () => 0;

  // Mock EE hooks for webhook tracking
  registerEEHooks({
    ...createDefaultHooks(),
    onReportCreated: async () => {
      webhooksCreatedCalls += 1;
    },
    onReportUpdated: async (report, changes) => {
      webhooksUpdatedArgs.push({ reportId: report.id, changes });
    },
    onReportDeleted: async () => {
      webhooksDeletedCalls += 1;
    },
  });

  notificationsService.notifyNewReport = async () => {
    notifyNewReportCalls += 1;
  };
  notificationsService.notifyReporterSubmission = async () => {
    notifyReporterSubmissionCalls += 1;
  };
  notificationsService.notifyStatusChange = async () => {
    notifyStatusCalls += 1;
  };
  notificationsService.notifyPriorityChange = async () => {
    notifyPriorityCalls += 1;
  };
  notificationsService.notifyAssignment = async () => {
    notifyAssignmentCalls += 1;
  };
  notificationsService.notifyReporterAssignment = async () => {
    notifyReporterAssignmentCalls += 1;
  };
  usersService.getAssignableById = async (id) =>
    Result.ok({
      id,
      email: `${id}@example.com`,
      name: `User ${id}`,
      role: 'viewer',
      isActive: true,
      invitationAcceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

  githubSyncService.getAutoSyncIntegration = async () => null;
  syncQueueService.enqueue = async (reportId, integrationId) => {
    syncQueueCalls.push({ reportId, integrationId });
    return Result.ok(undefined);
  };

  reportHistoryService.record = async () => undefined;

  settingsCacheService.getAll = async () =>
    ({
      screenshot: {
        maxScreenshotSize: 10,
        useScreenCaptureAPI: false,
        allowRecordingMicrophone: true,
        maxRecordingDurationSeconds: 180,
      },
    }) as AppSettings;
});

afterEach(() => {
  Object.assign(reporterOwnershipRepo, originalOwnershipRepo);
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(notificationsService, originalNotificationsService);
  Object.assign(githubSyncService, originalGithubSyncService);
  Object.assign(syncQueueService, originalSyncQueueService);
  Object.assign(usersService, originalUsersService);
  Object.assign(reportHistoryService, originalReportHistoryService);
  settingsCacheService.getAll = originalSettingsCacheGetAll;
  logger.warn = originalLoggerWarn;
  resetEEHooks();
});

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-reports-service-'));
  Object.assign(config, {
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'bugpin.db'),
    uploadsDir: path.join(tempDir, 'uploads'),
    screenshotsDir: path.join(tempDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(tempDir, 'uploads', 'attachments'),
    brandingDir: path.join(tempDir, 'uploads', 'branding'),
    avatarsDir: path.join(tempDir, 'uploads', 'avatars'),
  });
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  Object.assign(config, originalConfig);
});

describe('reportsService.create', () => {
  it('rejects invalid API key', async () => {
    projectByApiKey = null;
    const result = await reportsService.create({
      apiKey: 'bad',
      title: 'Title',
      metadata: baseMetadata,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid title', async () => {
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'a',
      metadata: baseMetadata,
    });
    expect(result.success).toBe(false);
  });

  it('rejects overly long title', async () => {
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'a'.repeat(201),
      metadata: baseMetadata,
    });
    expect(result.success).toBe(false);
  });

  it('creates report and triggers async hooks', async () => {
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: '  New Bug  ',
      description: '  desc ',
      metadata: baseMetadata,
    });
    expect(result.success).toBe(true);
    expect(createdReportInput).toMatchObject({
      projectId: 'prj_1',
      title: 'New Bug',
      description: 'desc',
      priority: 'medium',
    });
    await Promise.resolve();
    expect(webhooksCreatedCalls).toBe(1);
    expect(notifyNewReportCalls).toBe(1);
    expect(notifyReporterSubmissionCalls).toBe(1);
  });

  it('applies project default assignee when creating a report', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { defaultAssigneeUserId: 'usr_2' },
    };

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Assigned Bug',
      metadata: baseMetadata,
      reporterEmail: 'reporter@example.com',
    });

    expect(result.success).toBe(true);
    expect(createdReportInput).toMatchObject({
      assignedTo: 'usr_2',
    });

    await Promise.resolve();
    expect(notifyAssignmentCalls).toBe(1);
    expect(notifyReporterAssignmentCalls).toBe(1);
  });

  it('skips invalid project default assignees during report creation', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { defaultAssigneeUserId: 'usr_2' },
    };
    usersService.getAssignableById = async () =>
      Result.fail('Assigned user must be active', 'USER_INACTIVE');

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Assigned Bug',
      metadata: baseMetadata,
    });

    expect(result.success).toBe(true);
    expect(createdReportInput).toMatchObject({
      assignedTo: undefined,
    });
    await Promise.resolve();
    expect(notifyAssignmentCalls).toBe(0);
    expect(notifyReporterAssignmentCalls).toBe(0);
  });

  it('creates report with media and continues on file errors', async () => {
    filesRepo.create = async () => {
      throw new Error('DB error');
    };
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Media Bug',
      metadata: baseMetadata,
      files: [
        {
          filename: 'screen.png',
          mimeType: 'image/png',
          data: validPngBuffer,
        },
        {
          filename: 'clip.mp4',
          mimeType: 'video/mp4',
          data: validMp4Buffer,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('records media file types when saving', async () => {
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Media Types',
      metadata: baseMetadata,
      files: [
        {
          filename: 'screen.png',
          mimeType: 'image/png',
          data: validPngBuffer,
        },
        {
          filename: 'clip.mp4',
          mimeType: 'video/mp4',
          data: validMp4Buffer,
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['screenshot', 'video']);
  });

  it('keeps the report but skips widget files with invalid content', async () => {
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Mixed Media',
      metadata: baseMetadata,
      files: [
        {
          filename: 'fake.png',
          mimeType: 'image/png',
          data: validMp4Buffer,
        },
        {
          filename: 'clip.mp4',
          mimeType: 'video/mp4',
          data: validMp4Buffer,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['video']);
  });

  it('stores the original recording and logs a warning when remuxing fails', async () => {
    const corruptRecording = validMp4Buffer.subarray(0, 8);
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Short recording',
      metadata: baseMetadata,
      files: [
        {
          filename: 'recording.mp4',
          mimeType: 'video/mp4',
          data: corruptRecording,
          isRecording: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(fileCreateRecords).toHaveLength(1);
    expect(fileCreateRecords[0]?.sizeBytes).toBe(corruptRecording.length);
    expect(await Bun.file(fileCreateRecords[0]!.path).bytes()).toEqual(corruptRecording);
    expect(warningCalls).toContainEqual({
      message: 'Recording remux failed, storing original',
      context: expect.objectContaining({ code: 'REMUX_FAILED' }),
    });
  });

  it('stores a remuxed recording with MP4 metadata first', async () => {
    const recording = await Bun.file(
      path.join(import.meta.dir, '../fixtures/video-remux/chrome-with-audio.mp4')
    ).bytes();

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Browser recording',
      metadata: baseMetadata,
      files: [
        {
          filename: 'recording.mp4',
          mimeType: 'video/mp4',
          data: recording,
          isRecording: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(fileCreateRecords).toHaveLength(1);
    const saved = Buffer.from(await Bun.file(fileCreateRecords[0]!.path).arrayBuffer());
    expect(saved.indexOf('moov')).toBeGreaterThan(0);
    expect(saved.indexOf('moov')).toBeLessThan(saved.indexOf('mdat'));
  });

  it('stores a remuxed WebM recording', async () => {
    const recording = await Bun.file(
      path.join(import.meta.dir, '../fixtures/video-remux/firefox-with-audio.webm')
    ).bytes();

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Firefox recording',
      metadata: baseMetadata,
      files: [
        {
          filename: 'recording.webm',
          mimeType: 'video/webm',
          data: recording,
          isRecording: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    const saved = await Bun.file(fileCreateRecords[0]!.path).bytes();
    expect(Array.from(saved.subarray(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(saved).not.toEqual(recording);
  });

  it('stores an uploaded video byte-identically when it is not a recording', async () => {
    const video = await Bun.file(
      path.join(import.meta.dir, '../fixtures/video-remux/chrome-with-audio.mp4')
    ).bytes();

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Uploaded video',
      metadata: baseMetadata,
      files: [{ filename: 'upload.mp4', mimeType: 'video/mp4', data: video }],
    });

    expect(result.success).toBe(true);
    expect(await Bun.file(fileCreateRecords[0]!.path).bytes()).toEqual(video);
  });

  it('falls back one failed recording without affecting another recording', async () => {
    const recording = await Bun.file(
      path.join(import.meta.dir, '../fixtures/video-remux/chrome-with-audio.mp4')
    ).bytes();

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Multiple recordings',
      metadata: baseMetadata,
      files: [
        {
          filename: 'failed.mp4',
          mimeType: 'video/mp4',
          data: validMp4Buffer,
          isRecording: true,
        },
        {
          filename: 'complete.mp4',
          mimeType: 'video/mp4',
          data: recording,
          isRecording: true,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(fileCreateRecords).toHaveLength(2);
    expect(await Bun.file(fileCreateRecords[0]!.path).bytes()).toEqual(validMp4Buffer);
    const saved = Buffer.from(await Bun.file(fileCreateRecords[1]!.path).arrayBuffer());
    expect(saved.indexOf('moov')).toBeLessThan(saved.indexOf('mdat'));
    expect(saved).not.toEqual(recording);
  });

  async function submitRecording(filename: string, mimeType: string) {
    const recording = await Bun.file(
      path.join(import.meta.dir, '../fixtures/video-remux', filename)
    ).bytes();
    return reportsService.create({
      apiKey: 'proj_key',
      title: 'Policy recording',
      metadata: baseMetadata,
      files: [
        { filename: 'screenshot.png', mimeType: 'image/png', data: validPngBuffer },
        { filename, mimeType, data: recording, isRecording: true },
      ],
    });
  }

  it('rejects a recording with audio when the global setting disallows the microphone', async () => {
    settingsCacheService.getAll = async () =>
      ({
        screenshot: { allowRecordingMicrophone: false, maxRecordingDurationSeconds: 180 },
      }) as AppSettings;

    const result = await submitRecording('chrome-vp9-opus.webm', 'video/webm');

    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['screenshot']);
    expect(warningCalls).toContainEqual({
      message: 'Submitted file rejected',
      context: expect.objectContaining({
        filename: 'chrome-vp9-opus.webm',
        code: 'RECORDING_AUDIO_NOT_ALLOWED',
      }),
    });
  });

  it('keeps a silent recording when the microphone is disallowed', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { screenshot: { allowRecordingMicrophone: false } },
    };

    const result = await submitRecording('chrome-vp9.webm', 'video/webm');

    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['screenshot', 'video']);
  });

  it('lets a project override allow microphone audio over the global setting', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { screenshot: { allowRecordingMicrophone: true } },
    };
    settingsCacheService.getAll = async () =>
      ({ screenshot: { allowRecordingMicrophone: false } }) as AppSettings;

    const result = await submitRecording('chrome-with-audio.mp4', 'video/mp4');

    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['screenshot', 'video']);
  });

  it('rejects a recording longer than the maximum duration plus tolerance', async () => {
    const recordingInspection = spyOn(videoRemuxService, 'inspectRecording').mockResolvedValue(
      Result.ok({ hasAudio: false, durationSeconds: 15.5 })
    );
    projectByApiKey = {
      ...baseProject,
      settings: { screenshot: { maxRecordingDurationSeconds: 10 } },
    };

    try {
      const result = await submitRecording('chrome-vp9.webm', 'video/webm');

      expect(result.success).toBe(true);
      expect(fileCreateTypes).toEqual(['screenshot']);
      expect(warningCalls).toContainEqual({
        message: 'Submitted file rejected',
        context: expect.objectContaining({ code: 'RECORDING_TOO_LONG' }),
      });
    } finally {
      recordingInspection.mockRestore();
    }
  });

  it('keeps a recording within the duration tolerance', async () => {
    const recordingInspection = spyOn(videoRemuxService, 'inspectRecording').mockResolvedValue(
      Result.ok({ hasAudio: false, durationSeconds: 14.5 })
    );
    projectByApiKey = {
      ...baseProject,
      settings: { screenshot: { maxRecordingDurationSeconds: 10 } },
    };

    try {
      const result = await submitRecording('chrome-vp9.webm', 'video/webm');

      expect(result.success).toBe(true);
      expect(fileCreateTypes).toEqual(['screenshot', 'video']);
    } finally {
      recordingInspection.mockRestore();
    }
  });

  it('does not inspect uploaded videos outside the recording field', async () => {
    settingsCacheService.getAll = async () =>
      ({ screenshot: { allowRecordingMicrophone: false } }) as AppSettings;
    const video = await Bun.file(
      path.join(import.meta.dir, '../fixtures/video-remux/chrome-with-audio.mp4')
    ).bytes();

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Uploaded video with audio',
      metadata: baseMetadata,
      files: [{ filename: 'upload.mp4', mimeType: 'video/mp4', data: video }],
    });

    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['video']);
  });

  it('keeps videos allowed by a project override above the global limit', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { screenshot: { maxVideoUploadSizeMb: 100 } },
    };
    settingsCacheService.getAll = async () =>
      ({ screenshot: { maxVideoUploadSizeMb: 50 } }) as AppSettings;
    const video = Buffer.alloc(51 * 1024 * 1024);
    validMp4Buffer.copy(video);

    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Large project video',
      metadata: baseMetadata,
      files: [{ filename: 'clip.mp4', mimeType: 'video/mp4', data: video }],
    });

    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['video']);
  });

  it('creates manual reports without reporter submission confirmation', async () => {
    projectsRepo.findById = async () => baseProject;

    const result = await reportsService.createManual(
      {
        projectId: 'prj_1',
        title: 'Manual report',
        reporterEmail: 'reporter@example.com',
        channel: 'email',
      },
      'usr_1'
    );

    expect(result.success).toBe(true);
    expect(createdReportInput).toMatchObject({
      projectId: 'prj_1',
      source: 'manual',
      metadata: {
        manualContext: {
          channel: 'email',
          submittedByUserId: 'usr_1',
        },
      },
    });
    await Promise.resolve();
    expect(notifyNewReportCalls).toBe(1);
    expect(notifyReporterSubmissionCalls).toBe(0);
  });

  it('rejects invalid manual assignees', async () => {
    projectsRepo.findById = async () => baseProject;
    usersService.getAssignableById = async () => Result.fail('Not assignable', 'USER_INACTIVE');

    const result = await reportsService.createManual(
      {
        projectId: 'prj_1',
        title: 'Manual report',
        assignedTo: 'usr_2',
      },
      'usr_1'
    );

    expect(result.success).toBe(false);
  });
});

describe('reportsService.getById/getByIdWithFiles', () => {
  it('returns NOT_FOUND when missing', async () => {
    reportById = null;
    const result = await reportsService.getById('missing');
    expect(result.success).toBe(false);
  });

  it('returns report with files', async () => {
    const result = await reportsService.getByIdWithFiles('rpt_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.report.id).toBe('rpt_1');
    }
  });
});

describe('reportsService.list', () => {
  it('returns paginated results', async () => {
    const result = await reportsService.list({ page: 1, limit: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalPages).toBe(1);
    }
  });
});

describe('reportsService.update', () => {
  it('rejects when report not found', async () => {
    reportById = null;
    const result = await reportsService.update('missing', { title: 'New' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid title', async () => {
    const result = await reportsService.update('rpt_1', { title: 'a' });
    expect(result.success).toBe(false);
  });

  it('returns UPDATE_FAILED when repo update fails', async () => {
    updatedReport = null;
    const result = await reportsService.update('rpt_1', { title: 'New Title' });
    expect(result.success).toBe(false);
  });

  it('updates report and triggers notifications', async () => {
    const reportWithGitHub: Report = {
      ...baseReport,
      githubIssueNumber: 123,
    };
    reportById = reportWithGitHub;
    updatedReport = reportWithGitHub;

    githubSyncService.getAutoSyncIntegration = async () => ({ id: 'int_1' }) as never;

    const result = await reportsService.update(
      'rpt_1',
      { status: 'resolved', priority: 'high', assignedTo: 'usr_2' },
      'usr_1'
    );
    expect(result.success).toBe(true);
    expect(updatePayload).toMatchObject({ resolvedBy: 'usr_1' });
    await Promise.resolve();
    expect(webhooksUpdatedArgs.length).toBe(1);
    expect(notifyStatusCalls).toBe(1);
    expect(notifyPriorityCalls).toBe(1);
    expect(notifyAssignmentCalls).toBe(1);
    expect(notifyReporterAssignmentCalls).toBe(1);
    await Promise.resolve();
    expect(syncQueueCalls.length).toBe(1);
  });

  it('updates without triggering notifications when no tracked changes', async () => {
    const result = await reportsService.update('rpt_1', { description: 'Updated' });
    expect(result.success).toBe(true);
    await Promise.resolve();
    expect(webhooksUpdatedArgs.length).toBe(0);
    expect(notifyStatusCalls).toBe(0);
    expect(notifyPriorityCalls).toBe(0);
    expect(notifyAssignmentCalls).toBe(0);
    expect(notifyReporterAssignmentCalls).toBe(0);
  });

  it('clears assignedTo when null is provided', async () => {
    const result = await reportsService.update('rpt_1', { assignedTo: null });
    expect(result.success).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(updatePayload as object, 'assignedTo')).toBe(true);
    expect((updatePayload as { assignedTo?: string }).assignedTo).toBeUndefined();
  });

  it('rejects invalid assignees', async () => {
    usersService.getAssignableById = async () =>
      Result.fail('Assigned user must be active', 'USER_INACTIVE');
    const result = await reportsService.update('rpt_1', { assignedTo: 'usr_inactive' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_ASSIGNEE');
    }
  });
});

describe('reportsService.delete', () => {
  it('rejects when report not found', async () => {
    reportById = null;
    const result = await reportsService.delete('missing');
    expect(result.success).toBe(false);
  });

  it('deletes report and triggers webhook', async () => {
    const result = await reportsService.delete('rpt_1');
    expect(result.success).toBe(true);
    await Promise.resolve();
    expect(webhooksDeletedCalls).toBe(1);
  });
});

describe('reportsService.bulkUpdate/getStats', () => {
  it('rejects empty id list', async () => {
    const result = await reportsService.bulkUpdate([], {});
    expect(result.success).toBe(false);
  });

  it('rejects too many ids', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `rpt_${i}`);
    const result = await reportsService.bulkUpdate(ids, {});
    expect(result.success).toBe(false);
  });

  it('updates reports in bulk', async () => {
    const result = await reportsService.bulkUpdate(['rpt_1', 'rpt_2'], { status: 'closed' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid assignees during bulk update', async () => {
    usersService.getAssignableById = async () =>
      Result.fail('Invitation pending', 'INVITATION_PENDING');
    const result = await reportsService.bulkUpdate(['rpt_1', 'rpt_2'], { assignedTo: 'usr_2' });
    expect(result.success).toBe(false);
  });

  it('returns stats', async () => {
    const result = await reportsService.getStats();
    expect(result.success).toBe(true);
  });
});

describe('reportsService.addFile', () => {
  it('rejects when report not found', async () => {
    reportById = null;
    const result = await reportsService.addFile('missing', {
      data: new Uint8Array(),
      filename: 'file.png',
      mimeType: 'image/png',
      type: 'screenshot',
    });
    expect(result.success).toBe(false);
  });

  it('adds file to report', async () => {
    const result = await reportsService.addFile('rpt_1', {
      data: validPngBuffer,
      filename: 'file.png',
      mimeType: 'image/png',
      type: 'screenshot',
    });
    expect(result.success).toBe(true);
  });

  it('returns failure when saving file throws', async () => {
    filesRepo.create = async () => {
      throw new Error('DB error');
    };
    const result = await reportsService.addFile('rpt_1', {
      data: validPngBuffer,
      filename: 'file.png',
      mimeType: 'image/png',
      type: 'screenshot',
    });
    expect(result.success).toBe(false);
  });

  it('rejects file with invalid MIME type', async () => {
    const result = await reportsService.addFile('rpt_1', {
      data: Buffer.from('hello'),
      filename: 'file.exe',
      mimeType: 'application/x-executable',
      type: 'screenshot',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_MIME_TYPE');
    }
  });

  it('rejects file with mismatched magic bytes', async () => {
    const result = await reportsService.addFile('rpt_1', {
      data: validMp4Buffer, // MP4 bytes but claiming PNG
      filename: 'fake.png',
      mimeType: 'image/png',
      type: 'screenshot',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_FILE_CONTENT');
    }
  });
});
