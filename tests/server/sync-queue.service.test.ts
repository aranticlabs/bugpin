import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { syncQueueService } from '../../src/server/services/integrations/sync-queue.service';
import { githubSyncService } from '../../src/server/services/integrations/github-sync.service';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { Result } from '../../src/server/utils/result';
import { logger } from '../../src/server/utils/logger';

const originalGithubSyncService = { ...githubSyncService };
const originalReportsRepo = { ...reportsRepo };
const originalLogger = { ...logger };

let markPendingIds: string[] = [];
let syncResult = Result.ok({
  reportId: 'rpt_1',
  success: true,
  issueNumber: 123,
  issueUrl: 'https://github.com/org/repo/issues/123',
});

beforeEach(() => {
  markPendingIds = [];
  syncResult = Result.ok({
    reportId: 'rpt_1',
    success: true,
    issueNumber: 123,
    issueUrl: 'https://github.com/org/repo/issues/123',
  });

  reportsRepo.markPendingSync = async (id) => {
    markPendingIds.push(id);
    return true;
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
