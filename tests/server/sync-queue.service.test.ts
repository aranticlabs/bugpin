import { integrationsRepo } from '../../src/server/database/repositories/integrations.repo';
import * as projectLicense from '../../src/server/utils/project-license';
import type { Report, Integration } from '../../src/shared/types';
import { describe, it, expect, beforeEach, afterEach, spyOn, type Mock } from 'bun:test';
import { syncQueueService } from '../../src/server/services/integrations/sync-queue.service';
import { githubSyncService } from '../../src/server/services/integrations/github-sync.service';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { Result } from '../../src/server/utils/result';
import { logger } from '../../src/server/utils/logger';

const originalGithubSyncService = { ...githubSyncService };
const originalReportsRepo = { ...reportsRepo };
const originalLogger = { ...logger };
const originalIntegrationsRepo = { ...integrationsRepo };
let checkAccess: Mock<typeof projectLicense.checkProjectLicense>;

let markPendingIds: string[] = [];
let finalSyncError: string | null = null;
let syncResult = Result.ok({
  reportId: 'rpt_1',
  success: true,
  issueNumber: 123,
  issueUrl: 'https://github.com/org/repo/issues/123',
});

beforeEach(() => {
  checkAccess = spyOn(projectLicense, 'checkProjectLicense').mockReturnValue(Result.ok(undefined));
  reportsRepo.findById = async (id) => ({ id, projectId: 'prj_1' }) as Report;
  integrationsRepo.findById = async (id) => ({ id, projectId: 'prj_1' }) as Integration;
  markPendingIds = [];
  finalSyncError = null;
  syncResult = Result.ok({
    reportId: 'rpt_1',
    success: true,
    issueNumber: 123,
    issueUrl: 'https://github.com/org/repo/issues/123',
  });

  reportsRepo.markPendingSyncBatch = (ids) => {
    markPendingIds.push(...ids);
  };
  reportsRepo.updateGitHubSyncStatus = async (_id, update) => {
    finalSyncError = update.error ?? null;
    return null;
  };

  githubSyncService.syncReport = async () => syncResult;

  logger.info = () => undefined;
  logger.error = () => undefined;
  logger.warn = () => undefined;
  logger.debug = () => undefined;

  syncQueueService.clear();
});

afterEach(() => {
  Object.assign(githubSyncService, originalGithubSyncService);
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(logger, originalLogger);
  Object.assign(integrationsRepo, originalIntegrationsRepo);
  checkAccess.mockRestore();
  syncQueueService.clear();
});

describe('syncQueueService', () => {
  it('enqueues report and marks pending', async () => {
    await syncQueueService.enqueue('rpt_1', 'int_1');
    const status = syncQueueService.getStatus();
    expect(status.queueLength).toBe(1);
    expect(markPendingIds).toEqual(['rpt_1']);
  });

  it('does not enqueue duplicates', async () => {
    await syncQueueService.enqueue('rpt_1', 'int_1');
    await syncQueueService.enqueue('rpt_1', 'int_1');
    const status = syncQueueService.getStatus();
    expect(status.queueLength).toBe(1);
  });

  it('rejects a batch containing a missing or mismatched report before changing pending state', async () => {
    for (const invalid of [null, { id: 'rpt_2', projectId: 'prj_other' } as Report]) {
      reportsRepo.findById = async (id) =>
        id === 'rpt_1' ? ({ id, projectId: 'prj_1' } as Report) : invalid;
      const result = await syncQueueService.enqueueBatch(['rpt_1', 'rpt_2'], 'int_1');
      expect(result.success).toBe(false);
      expect(markPendingIds).toEqual([]);
      expect(syncQueueService.getStatus().queueLength).toBe(0);
    }
  });

  it('does not publish any tasks when pending-state persistence fails', async () => {
    reportsRepo.markPendingSyncBatch = () => {
      throw new Error('Storage unavailable');
    };
    const result = await syncQueueService.enqueueBatch(['rpt_1', 'rpt_2'], 'int_1');
    expect(result).toEqual(Result.fail('Could not queue reports for sync', 'QUEUE_FAILED'));
    expect(syncQueueService.getStatus().queueLength).toBe(0);
  });

  it('deduplicates batches and concurrent retries, reporting only newly queued tasks', async () => {
    const results = await Promise.all([
      syncQueueService.enqueueBatch(['rpt_1', 'rpt_2', 'rpt_1'], 'int_1'),
      syncQueueService.enqueueBatch(['rpt_1', 'rpt_2'], 'int_1'),
    ]);
    expect(results).toEqual([Result.ok(2), Result.ok(0)]);
    expect(markPendingIds).toEqual(['rpt_1', 'rpt_2']);
    expect(syncQueueService.getStatus().queueLength).toBe(2);
  });

  it('processes queue and removes successful tasks', async () => {
    await syncQueueService.enqueue('rpt_1', 'int_1');
    await syncQueueService.processQueue();
    const status = syncQueueService.getStatus();
    expect(status.queueLength).toBe(0);
  });

  it('retries failed tasks and removes after max attempts', async () => {
    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;

    syncResult = Result.fail('Sync failed', 'SYNC_FAILED');

    await syncQueueService.enqueue('rpt_1', 'int_1');

    for (let attempt = 0; attempt < 3; attempt++) {
      await syncQueueService.processQueue();
      now += 60000;
    }

    const status = syncQueueService.getStatus();
    expect(status.queueLength).toBe(0);
    expect(finalSyncError).toBe('Sync failed');

    Date.now = originalNow;
  });

  it('does not record the final error for a project without license access', async () => {
    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;
    syncResult = Result.fail('Sync failed', 'SYNC_FAILED');

    await syncQueueService.enqueue('rpt_1', 'int_1');
    checkAccess.mockReturnValue(Result.fail('This project is read-only', 'PROJECT_NOT_LICENSED'));
    for (let attempt = 0; attempt < 3; attempt++) {
      await syncQueueService.processQueue();
      now += 60000;
    }

    expect(syncQueueService.getStatus().queueLength).toBe(0);
    expect(finalSyncError).toBeNull();
    Date.now = originalNow;
  });

  it('bounds thrown sync failures and records the final error', async () => {
    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;
    githubSyncService.syncReport = async () => {
      throw new Error('Database unavailable');
    };

    await syncQueueService.enqueue('rpt_1', 'int_1');
    for (let attempt = 0; attempt < 3; attempt++) {
      await syncQueueService.processQueue();
      now += 60000;
    }

    expect(syncQueueService.getStatus().queueLength).toBe(0);
    expect(finalSyncError).toBe('Database unavailable');
    Date.now = originalNow;
  });

  it('starts and stops the queue processor', async () => {
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let started = false;
    let cleared = false;

    globalThis.setInterval = (() => {
      started = true;
      return 1 as never;
    }) as typeof setInterval;

    globalThis.clearInterval = (() => {
      cleared = true;
      return undefined as never;
    }) as typeof clearInterval;

    syncQueueService.start();
    syncQueueService.stop();

    expect(started).toBe(true);
    expect(cleared).toBe(true);

    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });
});

it('does not queue or mutate a locked report or one belonging to another integration', async () => {
  checkAccess.mockReturnValue(Result.fail('Locked', 'PROJECT_NOT_LICENSED'));
  const locked = await syncQueueService.enqueue('rpt_1', 'int_1');
  expect(locked.success).toBe(false);
  expect(markPendingIds).toEqual([]);
  expect(syncQueueService.getStatus().queueLength).toBe(0);
  checkAccess.mockReturnValue(Result.ok(undefined));
  integrationsRepo.findById = async (id) => ({ id, projectId: 'prj_other' }) as Integration;
  const mismatched = await syncQueueService.enqueue('rpt_1', 'int_1');
  expect(mismatched.success).toBe(false);
  if (!mismatched.success) expect(mismatched.code).toBe('PROJECT_MISMATCH');
  expect(markPendingIds).toEqual([]);
  expect(syncQueueService.getStatus().queueLength).toBe(0);
});
