import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { reportsService } from '../../src/server/services/reports.service';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { registerEEHooks, resetEEHooks } from '../../src/server/utils/ee-hooks';
import { notificationsService } from '../../src/server/services/notifications.service';
import { githubSyncService } from '../../src/server/services/integrations/github-sync.service';
import { syncQueueService } from '../../src/server/services/integrations/sync-queue.service';
import { config } from '../../src/server/config';
import type { Report, ReportMetadata, Project } from '../../src/shared/types';
import type { EEHooks } from '../../src/server/types/ee-plugin';

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
  title: 'Bug report',
  description: 'Details',
  status: 'open',
  priority: 'medium',
  metadata: baseMetadata,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalReportsRepo = { ...reportsRepo };
const originalProjectsRepo = { ...projectsRepo };
const originalFilesRepo = { ...filesRepo };
const originalNotificationsService = { ...notificationsService };
const originalGithubSyncService = { ...githubSyncService };
const originalSyncQueueService = { ...syncQueueService };
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
let notifyStatusCalls = 0;
let notifyPriorityCalls = 0;
let notifyAssignmentCalls = 0;
let syncQueueCalls: Array<{ reportId: string; integrationId: string }> = [];
let fileCreateTypes: string[] = [];

beforeEach(() => {
  reportById = baseReport;
  projectByApiKey = baseProject;
  updatedReport = baseReport;
  createdReportInput = undefined;
  updatePayload = undefined;
  webhooksCreatedCalls = 0;
  webhooksUpdatedArgs = [];
  webhooksDeletedCalls = 0;
  notifyNewReportCalls = 0;
  notifyStatusCalls = 0;
  notifyPriorityCalls = 0;
  notifyAssignmentCalls = 0;
  syncQueueCalls = [];
  fileCreateTypes = [];

  projectsRepo.findByApiKey = async () => projectByApiKey;
  reportsRepo.create = async (input) => {
    createdReportInput = input;
    return { ...baseReport, ...input, id: 'rpt_new' };
  };
  reportsRepo.findById = async () => reportById;
  reportsRepo.find = async () => ({ data: [baseReport], total: 1 });
  reportsRepo.update = async (_id, updates) => {
    updatePayload = updates;
    return updatedReport ? { ...updatedReport, ...updates } : null;
  };
  reportsRepo.delete = async () => true;
  reportsRepo.bulkUpdate = async () => 3;
  reportsRepo.getStats = async () =>
    ({ total: 1, byStatus: { open: 1 }, byPriority: { medium: 1 } }) as never;

  filesRepo.findByReportId = async () => [];
  filesRepo.create = async (input) => {
    fileCreateTypes.push(input.type);
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
    onReportCreated: async () => {
      webhooksCreatedCalls += 1;
    },
    onReportUpdated: async (report, changes) => {
      webhooksUpdatedArgs.push({ reportId: report.id, changes });
    },
    onReportDeleted: async () => {
      webhooksDeletedCalls += 1;
    },
  } as EEHooks);

  notificationsService.notifyNewReport = async () => {
    notifyNewReportCalls += 1;
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

  githubSyncService.getAutoSyncIntegration = async () => null;
  syncQueueService.enqueue = async (reportId, integrationId) => {
    syncQueueCalls.push({ reportId, integrationId });
  };
});

afterEach(() => {
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(notificationsService, originalNotificationsService);
  Object.assign(githubSyncService, originalGithubSyncService);
  Object.assign(syncQueueService, originalSyncQueueService);
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
  });

  it('creates report with media and continues on file errors', async () => {
    filesRepo.create = async () => {
      throw new Error('DB error');
    };
    const result = await reportsService.create({
      apiKey: 'proj_key',
      title: 'Media Bug',
      metadata: baseMetadata,
      media: [
        {
          filename: 'screen.png',
          mimeType: 'image/png',
          data: Buffer.from([0x00, 0x01]),
        },
        {
          filename: 'clip.mp4',
          mimeType: 'video/mp4',
          data: Buffer.from([0x00, 0x01]),
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
      media: [
        {
          filename: 'screen.png',
          mimeType: 'image/png',
          data: Buffer.from([0x00, 0x01]),
        },
        {
          filename: 'clip.mp4',
          mimeType: 'video/mp4',
          data: Buffer.from([0x00, 0x01]),
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(fileCreateTypes).toEqual(['screenshot', 'video']);
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
      'usr_1',
    );
    expect(result.success).toBe(true);
    expect(updatePayload).toMatchObject({ resolvedBy: 'usr_1' });
    await Promise.resolve();
    expect(webhooksUpdatedArgs.length).toBe(1);
    expect(notifyStatusCalls).toBe(1);
    expect(notifyPriorityCalls).toBe(1);
    expect(notifyAssignmentCalls).toBe(1);
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
  });

  it('clears assignedTo when null is provided', async () => {
    const result = await reportsService.update('rpt_1', { assignedTo: null });
    expect(result.success).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(updatePayload as object, 'assignedTo')).toBe(true);
    expect((updatePayload as { assignedTo?: string }).assignedTo).toBeUndefined();
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
      data: new Uint8Array([0x00, 0x01]),
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
      data: new Uint8Array([0x00, 0x01]),
      filename: 'file.png',
      mimeType: 'image/png',
      type: 'screenshot',
    });
    expect(result.success).toBe(false);
  });
});
