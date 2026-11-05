import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { projectsRoutes } from '../../../src/server/routes/api/projects';
import { projectsService } from '../../../src/server/services/projects.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type { Project, Session, User } from '../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'user@example.com',
  name: 'User',
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

const baseProject: Project = {
  id: 'prj_1',
  name: 'Project',
  apiKey: 'proj_key',
  settings: {},
  reportsCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalProjectsService = { ...projectsService };

let listResult: Project[] = [baseProject];
let projectResult: Project | null = baseProject;
let createResult: Result<Project> = Result.ok(baseProject);
let updateResult: Result<Project> = Result.ok(baseProject);
let deleteResult: Result<void> = Result.ok(undefined);
let regenerateResult: Result<string> = Result.ok('proj_new');
let lastUpdateBody: unknown;

beforeEach(() => {
  listResult = [baseProject];
  projectResult = baseProject;
  createResult = Result.ok(baseProject);
  updateResult = Result.ok(baseProject);
  deleteResult = Result.ok(undefined);
  regenerateResult = Result.ok('proj_new');
  lastUpdateBody = undefined;

  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });

  projectsService.list = async () => Result.ok(listResult);
  projectsService.listSummaries = async () =>
    Result.ok(listResult.map(({ id, name, isActive }) => ({ id, name, isActive })));
  projectsService.getById = async () => {
    if (!projectResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok(projectResult);
  };
  projectsService.create = async () => createResult;
  projectsService.update = async (_id, input) => {
    lastUpdateBody = input;
    return updateResult;
  };
  projectsService.delete = async () => deleteResult;
  projectsService.regenerateApiKey = async () => regenerateResult;
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(projectsService, originalProjectsService);
});

function createApp() {
  const app = new Hono();
  app.route('/projects', projectsRoutes);
  return app;
}

describe('projects routes', () => {
  it('rejects the full project list for viewers', async () => {
    authService.validateSession = async () =>
      Result.ok({ user: { ...baseUser, role: 'viewer' }, session: baseSession });
    const app = createApp();
    const res = await app.request('http://localhost/projects', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(403);
  });

  it('lists project summaries without API keys for viewers', async () => {
    authService.validateSession = async () =>
      Result.ok({ user: { ...baseUser, role: 'viewer' }, session: baseSession });
    const app = createApp();
    const res = await app.request('http://localhost/projects/summaries', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: Record<string, unknown>[] };
    expect(body.projects).toEqual([{ id: 'prj_1', name: 'Project' }]);
    expect(body.projects[0]).not.toHaveProperty('apiKey');
  });

  it('lists projects', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when project missing', async () => {
    projectResult = null;
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_missing', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('creates project', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Project' }),
    });
    expect(res.status).toBe(201);
  });

  it('updates project', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(res.status).toBe(200);
  });

  it('passes project default assignee settings through update requests', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ settings: { defaultAssigneeUserId: 'usr_2' } }),
    });

    expect(res.status).toBe(200);
    expect(lastUpdateBody).toEqual({ settings: { defaultAssigneeUserId: 'usr_2' } });
  });

  it('deletes project', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('regenerates api key', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1/regenerate-key', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts a valid language settings block on PATCH', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        settings: { language: { mode: 'manual', defaultLanguage: 'de' } },
      }),
    });
    expect(res.status).toBe(200);
    expect(lastUpdateBody).toEqual({
      settings: { language: { mode: 'manual', defaultLanguage: 'de' } },
    });
  });

  it('accepts null language on PATCH to clear the project override', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ settings: { language: null } }),
    });
    expect(res.status).toBe(200);
    expect(lastUpdateBody).toEqual({ settings: { language: null } });
  });

  it('rejects an invalid language defaultLanguage on PATCH', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        settings: { language: { mode: 'manual', defaultLanguage: 'xx' } },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid language mode on PATCH', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/projects/prj_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        settings: { language: { mode: 'invalid', defaultLanguage: 'en' } },
      }),
    });
    expect(res.status).toBe(400);
  });
});
