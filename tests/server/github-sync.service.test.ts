import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { githubSyncService } from '../../src/server/services/integrations/github-sync.service';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { integrationsRepo } from '../../src/server/database/repositories/integrations.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { githubService } from '../../src/server/services/integrations/github.service';
import { settingsService } from '../../src/server/services/settings.service';
import { logger } from '../../src/server/utils/logger';
import { Result } from '../../src/server/utils/result';
import type { Integration, Report } from '../../src/shared/types';

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  title: 'Bug report',
  status: 'open',
  priority: 'medium',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    timestamp: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseIntegration: Integration = {
  id: 'int_1',
  projectId: 'prj_1',
  type: 'github',
  name: 'GitHub',
  config: {
    owner: 'org',
    repo: 'repo',
    accessToken: 'token',
    syncMode: 'manual',
  },
  isActive: true,
  usageCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalReportsRepo = { ...reportsRepo };
const originalIntegrationsRepo = { ...integrationsRepo };
const originalFilesRepo = { ...filesRepo };
const originalGithubService = { ...githubService };
const originalSettingsService = { ...settingsService };
const originalLogger = { ...logger };

let reportById: Report | null = baseReport;
let integrationById: Integration | null = baseIntegration;
let updateSyncPayload: unknown;
let updateLastUsedId: string | null = null;
let updateStatusPayload: unknown;
let deletedWebhookId: string | null = null;
let updatedIntegrationConfig: unknown;
let createWebhookUrl: string | null = null;

beforeEach(() => {
  reportById = baseReport;
  integrationById = baseIntegration;
  updateSyncPayload = undefined;
  updateLastUsedId = null;
  updateStatusPayload = undefined;
  deletedWebhookId = null;
  updatedIntegrationConfig = null;
  createWebhookUrl = null;

  reportsRepo.findById = async () => reportById;
  reportsRepo.updateGitHubSyncStatus = async (_id, payload) => {
    updateSyncPayload = payload;
    return true;
  };
  reportsRepo.markPendingSync = async () => true;
  reportsRepo.findByGitHubIssueNumber = async () => null;
  reportsRepo.update = async (_id, payload) => {
    updateStatusPayload = payload;
    return reportById;
  };
  reportsRepo.findUnsyncedByProject = async () => [];

  integrationsRepo.findById = async () => integrationById;
  integrationsRepo.findByProjectId = async () => [baseIntegration];
  integrationsRepo.updateLastUsed = async (id) => {
    updateLastUsedId = id;
    return true;
  };
  integrationsRepo.update = async (_id, payload) => {
    updatedIntegrationConfig = payload.config;
    return baseIntegration;
  };

  filesRepo.findByReportId = async () => [];

  githubService.createIssue = async () => ({
    success: true,
    issueNumber: 123,
    issueUrl: 'https://github.com/org/repo/issues/123',
  });
  githubService.updateIssue = async () => ({
    success: true,
    issueNumber: 456,
    issueUrl: 'https://github.com/org/repo/issues/456',
  });
  githubService.createWebhook = async (_config, url) => {
    createWebhookUrl = url;
    return { success: true, webhookId: '42' };
  };
  githubService.deleteWebhook = async (_config, webhookId) => {
    deletedWebhookId = webhookId;
    return { success: true };
  };

  settingsService.getAll = async () => Result.ok({ appUrl: 'https://app.example.com' } as never);

  logger.info = () => undefined;
  logger.error = () => undefined;
  logger.warn = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(integrationsRepo, originalIntegrationsRepo);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(githubService, originalGithubService);
  Object.assign(settingsService, originalSettingsService);
  Object.assign(logger, originalLogger);
});

describe('githubSyncService', () => {
  it('returns NOT_FOUND when report missing', async () => {
    reportById = null;
    const result = await githubSyncService.syncReport('rpt_missing', 'int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('syncs report by creating issue', async () => {
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(true);
    expect(updateSyncPayload).toMatchObject({ status: 'synced' });
    expect(updateLastUsedId).toBe('int_1');
  });

  it('returns NOT_FOUND when integration missing', async () => {
    integrationById = null;
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('rejects sync for invalid integration type', async () => {
    integrationById = { ...baseIntegration, type: 'slack' } as Integration;
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_TYPE');
  });

  it('rejects sync when integration is inactive', async () => {
    integrationById = { ...baseIntegration, isActive: false };
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INACTIVE');
  });

  it('marks sync error when create issue fails', async () => {
    githubService.createIssue = async () => ({ success: false, error: 'Nope' });
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(updateSyncPayload).toMatchObject({ status: 'error', error: 'Nope' });
  });

  it('updates issue when report already linked', async () => {
    reportById = { ...baseReport, githubIssueNumber: 42 } as Report;
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(true);
    expect(updateSyncPayload).toMatchObject({ status: 'synced', issueNumber: 456 });
  });

  it('marks sync error when update issue fails', async () => {
    reportById = { ...baseReport, githubIssueNumber: 42 } as Report;
    githubService.updateIssue = async () => ({ success: false, error: 'Nope' });
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(updateSyncPayload).toMatchObject({ status: 'error', error: 'Nope' });
  });

  it('handles thrown errors during sync', async () => {
    githubService.createIssue = async () => {
      throw new Error('boom');
    };
    const result = await githubSyncService.syncReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(updateSyncPayload).toMatchObject({ status: 'error', error: 'boom' });
  });

  it('stops retries on invalid integration type', async () => {
    const originalSyncReport = githubSyncService.syncReport;
    let attempts = 0;

    githubSyncService.syncReport = async () => {
      attempts++;
      return Result.fail('Invalid type', 'INVALID_TYPE');
    };

    const result = await githubSyncService.syncWithRetry('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(attempts).toBe(1);

    githubSyncService.syncReport = originalSyncReport;
  });

  it('retries on transient sync failures and succeeds', async () => {
    const originalSyncReport = githubSyncService.syncReport;
    const originalTimeout = globalThis.setTimeout;
    let attempts = 0;

    globalThis.setTimeout = ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler();
      return 0 as never;
    }) as typeof setTimeout;

    githubSyncService.syncReport = async () => {
      attempts += 1;
      if (attempts < 2) {
        return Result.fail('Transient', 'SYNC_FAILED');
      }
      return Result.ok({
        reportId: 'rpt_1',
        success: true,
        issueNumber: 123,
        issueUrl: 'https://github.com/org/repo/issues/123',
      });
    };

    const result = await githubSyncService.syncWithRetry('rpt_1', 'int_1');
    expect(result.success).toBe(true);
    expect(attempts).toBe(2);

    githubSyncService.syncReport = originalSyncReport;
    globalThis.setTimeout = originalTimeout;
  });

  it('records error after max retries', async () => {
    const originalSyncReport = githubSyncService.syncReport;
    const originalTimeout = globalThis.setTimeout;
    let attempts = 0;

    globalThis.setTimeout = ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler();
      return 0 as never;
    }) as typeof setTimeout;

    githubSyncService.syncReport = async () => {
      attempts += 1;
      return Result.fail('Still failing', 'SYNC_FAILED');
    };

    const result = await githubSyncService.syncWithRetry('rpt_1', 'int_1');
    expect(result.success).toBe(false);
    expect(attempts).toBe(3);
    expect(updateSyncPayload).toMatchObject({
      status: 'error',
      error: 'Failed after 3 attempts: Still failing',
    });

    githubSyncService.syncReport = originalSyncReport;
    globalThis.setTimeout = originalTimeout;
  });

  it('syncs reports in batch', async () => {
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler();
      return 0 as never;
    }) as typeof setTimeout;

    const result = await githubSyncService.syncReports(['rpt_1'], 'int_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.total).toBe(1);
    }

    globalThis.setTimeout = originalTimeout;
  });

  it('syncs reports in batch with failures', async () => {
    const originalSyncReport = githubSyncService.syncReport;
    const originalTimeout = globalThis.setTimeout;

    globalThis.setTimeout = ((handler: TimerHandler) => {
      if (typeof handler === 'function') handler();
      return 0 as never;
    }) as typeof setTimeout;

    let calls = 0;
    githubSyncService.syncReport = async () => {
      calls += 1;
      if (calls === 1) {
        return Result.ok({
          reportId: 'rpt_1',
          success: true,
        });
      }
      return Result.fail('Nope', 'SYNC_FAILED');
    };

    const result = await githubSyncService.syncReports(['rpt_1', 'rpt_2'], 'int_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.successful).toBe(1);
      expect(result.value.failed).toBe(1);
    }

    githubSyncService.syncReport = originalSyncReport;
    globalThis.setTimeout = originalTimeout;
  });

  it('enables automatic sync', async () => {
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(true);
  });

  it('returns NOT_FOUND when enabling auto sync for missing integration', async () => {
    integrationById = null;
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns INVALID_TYPE when enabling auto sync for non-github', async () => {
    integrationById = { ...baseIntegration, type: 'slack' } as Integration;
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_TYPE');
  });

  it('returns SETTINGS_ERROR when settings lookup fails', async () => {
    settingsService.getAll = async () => Result.fail('fail', 'ERROR');
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('SETTINGS_ERROR');
  });

  it('returns error when app url is missing', async () => {
    settingsService.getAll = async () => Result.ok({ appUrl: '' } as never);
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('CONFIG_ERROR');
  });

  it('strips trailing slash from app url for webhook', async () => {
    settingsService.getAll = async () => Result.ok({ appUrl: 'https://app.example.com/' } as never);
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(true);
    expect(createWebhookUrl).toBe('https://app.example.com/api/webhooks/github/int_1');
  });

  it('continues when webhook creation fails', async () => {
    githubService.createWebhook = async () => ({ success: false, error: 'Nope' });
    const result = await githubSyncService.enableAutoSync('int_1');
    expect(result.success).toBe(true);
    expect(updatedIntegrationConfig).toMatchObject({
      syncMode: 'automatic',
      webhookId: undefined,
      webhookSecret: undefined,
    });
  });

  it('disables automatic sync', async () => {
    const result = await githubSyncService.disableAutoSync('int_1');
    expect(result.success).toBe(true);
  });

  it('returns NOT_FOUND when disabling auto sync for missing integration', async () => {
    integrationById = null;
    const result = await githubSyncService.disableAutoSync('int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('returns INVALID_TYPE when disabling auto sync for non-github', async () => {
    integrationById = { ...baseIntegration, type: 'slack' } as Integration;
    const result = await githubSyncService.disableAutoSync('int_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_TYPE');
  });

  it('deletes webhook when disabling auto sync', async () => {
    integrationById = {
      ...baseIntegration,
      config: { ...baseIntegration.config, webhookId: 'whk_1' },
    };
    const result = await githubSyncService.disableAutoSync('int_1');
    expect(result.success).toBe(true);
    expect(deletedWebhookId).toBe('whk_1');
  });

  it('clears webhook config when disabling auto sync', async () => {
    const result = await githubSyncService.disableAutoSync('int_1');
    expect(result.success).toBe(true);
    expect(updatedIntegrationConfig).toMatchObject({
      syncMode: 'manual',
      webhookId: undefined,
      webhookSecret: undefined,
    });
  });

  it('updates report status from webhook', async () => {
    reportsRepo.findByGitHubIssueNumber = async () =>
      ({
        ...baseReport,
        status: 'open',
      }) as Report;

    const result = await githubSyncService.handleWebhook('int_1', 'closed', {
      number: 123,
      state: 'closed',
    });
    expect(result.success).toBe(true);
    expect(updateStatusPayload).toMatchObject({ status: 'resolved' });
  });

  it('returns NOT_FOUND when webhook integration is missing', async () => {
    integrationById = null;
    const result = await githubSyncService.handleWebhook('int_1', 'closed', {
      number: 123,
      state: 'closed',
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('does nothing when no report matches the issue', async () => {
    reportsRepo.findByGitHubIssueNumber = async () => null;
    const result = await githubSyncService.handleWebhook('int_1', 'closed', {
      number: 123,
      state: 'closed',
    });
    expect(result.success).toBe(true);
    expect(updateStatusPayload).toBeUndefined();
  });

  it('does not update when status already resolved', async () => {
    reportsRepo.findByGitHubIssueNumber = async () =>
      ({
        ...baseReport,
        status: 'resolved',
      }) as Report;

    const result = await githubSyncService.handleWebhook('int_1', 'closed', {
      number: 123,
      state: 'closed',
    });
    expect(result.success).toBe(true);
    expect(updateStatusPayload).toBeUndefined();
  });

  it('reopens report status from webhook', async () => {
    reportsRepo.findByGitHubIssueNumber = async () =>
      ({
        ...baseReport,
        status: 'resolved',
      }) as Report;

    const result = await githubSyncService.handleWebhook('int_1', 'reopened', {
      number: 123,
      state: 'open',
    });
    expect(result.success).toBe(true);
    expect(updateStatusPayload).toMatchObject({ status: 'open' });
  });

  it('returns auto sync integration when configured', async () => {
    integrationsRepo.findByProjectId = async () =>
      [
        { ...baseIntegration, config: { ...baseIntegration.config, syncMode: 'automatic' } },
      ] as Integration[];
    const result = await githubSyncService.getAutoSyncIntegration('prj_1');
    expect(result?.id).toBe('int_1');
  });

  it('returns null when no auto sync integration exists', async () => {
    integrationsRepo.findByProjectId = async () =>
      [
        { ...baseIntegration, config: { ...baseIntegration.config, syncMode: 'manual' } },
      ] as Integration[];
    const result = await githubSyncService.getAutoSyncIntegration('prj_1');
    expect(result).toBeNull();
  });

  it('returns unsynced report count', async () => {
    reportsRepo.findUnsyncedByProject = async () => [{ id: 'rpt_1' }, { id: 'rpt_2' }] as Report[];
    const count = await githubSyncService.getUnsyncedCount('prj_1');
    expect(count).toBe(2);
  });

  it('returns unsynced report IDs', async () => {
    reportsRepo.findUnsyncedByProject = async () => [{ id: 'rpt_2' }] as Report[];
    const ids = await githubSyncService.getUnsyncedReportIds('prj_1');
    expect(ids).toEqual(['rpt_2']);
  });
});
