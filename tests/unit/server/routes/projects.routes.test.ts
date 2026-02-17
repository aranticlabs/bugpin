import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../../src/server/node_modules/hono/dist/index.js';
import { projectsRoutes } from '../../../../src/server/routes/api/projects';
import { projectsService } from '../../../../src/server/services/projects.service';
import { authService } from '../../../../src/server/services/auth.service';
import { Result } from '../../../../src/server/utils/result';
import type { Project, Session, User } from '../../../../src/shared/types';

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

beforeEach(() => {
  listResult = [baseProject];
  projectResult = baseProject;
  createResult = Result.ok(baseProject);
  updateResult = Result.ok(baseProject);
  deleteResult = Result.ok(undefined);
  regenerateResult = Result.ok('proj_new');

  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });

  projectsService.list = async () => Result.ok(listResult);
  projectsService.getById = async () => {
    if (!projectResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok(projectResult);
  };
  projectsService.create = async () => createResult;
  projectsService.update = async () => updateResult;
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
});
