import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../../src/server/node_modules/hono/dist/index.js';
import { integrationsRoutes } from '../../../../src/server/routes/api/integrations';
import { integrationsService } from '../../../../src/server/services/integrations.service';
import { githubService } from '../../../../src/server/services/integrations/github.service';
import { githubSyncService } from '../../../../src/server/services/integrations/github-sync.service';
import { syncQueueService } from '../../../../src/server/services/integrations/sync-queue.service';
import { integrationsRepo } from '../../../../src/server/database/repositories/integrations.repo';
import { authService } from '../../../../src/server/services/auth.service';
import { Result } from '../../../../src/server/utils/result';
import type { Integration, Session, User } from '../../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseSession: Session = {
  id: 'sess_1',
  userId: 'usr_1',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
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

const originalAuthService = { ...authService };
const originalIntegrationsService = { ...integrationsService };
const originalGithubService = { ...githubService };
const originalGithubSyncService = { ...githubSyncService };
const originalSyncQueueService = { ...syncQueueService };
const originalIntegrationsRepo = { ...integrationsRepo };

let userRole: User['role'] = 'admin';
let integrationById: Integration | null = baseIntegration;
let listProjectId: string | null = null;
let createPayload: unknown;
let updatePayload: unknown;
let deleteId: string | null = null;
let testId: string | null = null;
let queuedReports: Array<{ reportId: string; integrationId: string }> = [];
let autoSyncEnableId: string | null = null;
let autoSyncDisableId: string | null = null;

let listResult = Result.ok([baseIntegration]);
let getResult = Result.ok(baseIntegration);
let createResult = Result.ok(baseIntegration);
let updateResult = Result.ok(baseIntegration);
let deleteResult = Result.ok(undefined);
let testResult = Result.ok({ success: true });

beforeEach(() => {
  userRole = 'admin';
  integrationById = baseIntegration;
  listProjectId = null;
  createPayload = undefined;
  updatePayload = undefined;
  deleteId = null;
  testId = null;
  queuedReports = [];
  autoSyncEnableId = null;
  autoSyncDisableId = null;

  listResult = Result.ok([baseIntegration]);
  getResult = Result.ok(baseIntegration);
  createResult = Result.ok(baseIntegration);
  updateResult = Result.ok(baseIntegration);
  deleteResult = Result.ok(undefined);
  testResult = Result.ok({ success: true });

  authService.validateSession = async () =>
    Result.ok({
      user: { ...baseUser, role: userRole },
      session: baseSession,
    });

  integrationsService.listByProject = async (projectId) => {
    listProjectId = projectId;
    return listResult;
  };
  integrationsService.getById = async () => getResult;
  integrationsService.create = async (payload) => {
    createPayload = payload;
    return createResult;
  };
  integrationsService.update = async (_id, payload) => {
    updatePayload = payload;
    return updateResult;
  };
  integrationsService.delete = async (id) => {
    deleteId = id;
    return deleteResult;
  };
  integrationsService.testConnection = async (id) => {
    testId = id;
    return testResult;
  };

  githubService.fetchRepositories = async () => ({
    success: true,
    repositories: [{ owner: 'org', name: 'repo', fullName: 'org/repo', private: false }],
  });
  githubService.fetchLabels = async () => ({
    success: true,
    labels: [{ name: 'bug', color: 'ff0000', description: null }],
  });
  githubService.fetchAssignees = async () => ({
    success: true,
    assignees: [{ login: 'octo', avatarUrl: 'https://example.com/octo.png' }],
  });

  githubSyncService.enableAutoSync = async (id) => {
    autoSyncEnableId = id;
    return Result.ok(undefined);
  };
  githubSyncService.disableAutoSync = async (id) => {
    autoSyncDisableId = id;
    return Result.ok(undefined);
  };
  githubSyncService.getUnsyncedCount = async () => 2;
  githubSyncService.getUnsyncedReportIds = async () => ['rpt_1', 'rpt_2'];

  syncQueueService.enqueue = async (reportId, integrationId) => {
    queuedReports.push({ reportId, integrationId });
  };
  syncQueueService.getStatus = () => ({
    queueLength: queuedReports.length,
    processing: false,
    tasks: queuedReports.map((task) => ({
      reportId: task.reportId,
      attempts: 0,
      nextAttempt: Date.now(),
    })),
  });

  integrationsRepo.findById = async () => integrationById;
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(integrationsService, originalIntegrationsService);
  Object.assign(githubService, originalGithubService);
  Object.assign(githubSyncService, originalGithubSyncService);
  Object.assign(syncQueueService, originalSyncQueueService);
  Object.assign(integrationsRepo, originalIntegrationsRepo);
});

function createApp() {
  const app = new Hono();
  app.route('/integrations', integrationsRoutes);
  return app;
}

describe('integrations routes', () => {
  it('lists integrations for a project', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations?projectId=prj_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    expect(listProjectId).toBe('prj_1');
  });

  it('returns 400 when list service fails', async () => {
    listResult = Result.fail('Oops', 'LIST_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/integrations?projectId=prj_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when projectId missing', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('blocks non-admin', async () => {
    userRole = 'viewer';
    const app = createApp();
    const res = await app.request('http://localhost/integrations?projectId=prj_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when integration not found', async () => {
    getResult = Result.fail('Not found', 'NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_missing', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('returns integration by id', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when integration lookup fails', async () => {
    getResult = Result.fail('Nope', 'BAD');
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('creates integration and returns 201', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'prj_1',
        type: 'github',
        name: 'GitHub',
        config: { owner: 'org', repo: 'repo', accessToken: 'token' },
      }),
    });
    expect(res.status).toBe(201);
    expect(createPayload).toBeTruthy();
  });

  it('returns 404 when project missing on create', async () => {
    createResult = Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/integrations', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 'prj_missing',
        type: 'github',
        name: 'GitHub',
        config: { owner: 'org', repo: 'repo', accessToken: 'token' },
      }),
    });
    expect(res.status).toBe(404);
  });

  it('updates integration', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New name' }),
    });
    expect(res.status).toBe(200);
    expect(updatePayload).toMatchObject({ name: 'New name' });
  });

  it('returns 404 when update fails', async () => {
    updateResult = Result.fail('Not found', 'NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_missing', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New name' }),
    });
    expect(res.status).toBe(404);
  });

  it('deletes integration', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    expect(deleteId).toBe('int_1');
  });

  it('returns 404 when delete fails', async () => {
    deleteResult = Result.fail('Not found', 'NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_missing', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('tests integration connection', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/test', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    expect(testId).toBe('int_1');
  });

  it('returns 400 when test connection fails', async () => {
    testResult = Result.fail('Bad', 'FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/test', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('fetches GitHub repositories', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/repositories', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accessToken: 'token' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing GitHub token', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/repositories', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when GitHub repositories fetch fails', async () => {
    githubService.fetchRepositories = async () => ({ success: false, error: 'Bad' });
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/repositories', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accessToken: 'token' }),
    });
    expect(res.status).toBe(400);
  });

  it('fetches GitHub labels', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/labels', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accessToken: 'token', owner: 'org', repo: 'repo' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing GitHub label params', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/labels', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accessToken: 'token' }),
    });
    expect(res.status).toBe(400);
  });

  it('fetches GitHub assignees', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/assignees', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accessToken: 'token', owner: 'org', repo: 'repo' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing GitHub assignee params', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/github/assignees', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ accessToken: 'token' }),
    });
    expect(res.status).toBe(400);
  });

  it('sets sync mode to automatic', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-mode', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ syncMode: 'automatic' }),
    });
    expect(res.status).toBe(200);
    expect(autoSyncEnableId).toBe('int_1');
  });

  it('returns 404 when sync mode integration missing', async () => {
    integrationById = null;
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_missing/sync-mode', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ syncMode: 'automatic' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns success when sync mode is unchanged', async () => {
    integrationById = {
      ...baseIntegration,
      config: { ...baseIntegration.config, syncMode: 'automatic' },
    };
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-mode', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ syncMode: 'automatic' }),
    });
    expect(res.status).toBe(200);
    expect(autoSyncEnableId).toBeNull();
    expect(autoSyncDisableId).toBeNull();
  });

  it('returns 400 when sync mode update fails', async () => {
    githubSyncService.enableAutoSync = async () => Result.fail('Bad', 'SYNC_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-mode', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ syncMode: 'automatic' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects sync mode for unsupported integration types', async () => {
    integrationById = { ...baseIntegration, type: 'jira' } as Integration;
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-mode', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ syncMode: 'manual' }),
    });
    expect(res.status).toBe(400);
  });

  it('queues existing reports when syncing all', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-existing', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reportIds: 'all' }),
    });
    expect(res.status).toBe(200);
    expect(queuedReports).toHaveLength(2);
  });

  it('returns 400 when sync existing params are invalid', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-existing', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reportIds: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 when there are no reports to sync', async () => {
    githubSyncService.getUnsyncedReportIds = async () => [];
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-existing', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reportIds: 'all' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns sync status summary', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-status', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when sync status integration missing', async () => {
    integrationById = null;
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_missing/sync-status', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when sync status integration has invalid type', async () => {
    integrationById = { ...baseIntegration, type: 'jira' } as Integration;
    const app = createApp();
    const res = await app.request('http://localhost/integrations/int_1/sync-status', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });
});
