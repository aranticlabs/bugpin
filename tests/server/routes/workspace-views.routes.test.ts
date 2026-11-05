import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { reportsRoutes } from '../../../src/server/routes/api/reports';
import { projectsRoutes } from '../../../src/server/routes/api/projects';
import { authService } from '../../../src/server/services/auth.service';
import { reportsService } from '../../../src/server/services/reports.service';
import { workspaceViewsService } from '../../../src/server/services/workspace-views.service';
import { Result } from '../../../src/server/utils/result';
import type { ReportFilter, Session, User } from '../../../src/shared/types';

const viewer: User = {
  id: 'usr_viewer',
  email: 'viewer@example.com',
  name: 'Viewer',
  role: 'viewer',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const session: Session = {
  id: 'sess_1',
  userId: viewer.id,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalReportsService = { ...reportsService };
const originalWorkspaceViewsService = { ...workspaceViewsService };
let listFilter: ReportFilter | undefined;
let calls: string[] = [];

function request(path: string, method = 'GET') {
  const app = new Hono();
  app.route('/reports', reportsRoutes);
  app.route('/projects', projectsRoutes);
  return app.request(`http://localhost${path}`, {
    method,
    headers: { cookie: 'session=sess_1' },
  });
}

beforeEach(() => {
  listFilter = undefined;
  calls = [];
  authService.validateSession = async () => Result.ok({ user: viewer, session });
  reportsService.list = async (filter) => {
    listFilter = filter;
    return Result.ok({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  };
  workspaceViewsService.getViewCounts = async (userId) => {
    calls.push(`counts:${userId}`);
    return Result.ok({ assignedToMe: 1, unassigned: 2, active: 3 });
  };
  workspaceViewsService.listRecentReports = async (userId, limit) => {
    calls.push(`recent:${userId}:${limit}`);
    return Result.ok([]);
  };
  workspaceViewsService.recordReportView = async (userId, reportId) => {
    calls.push(`view:${userId}:${reportId}`);
    return reportId === 'rpt_missing'
      ? Result.fail('Report not found', 'NOT_FOUND')
      : Result.ok(undefined);
  };
  workspaceViewsService.listPinnedProjects = async (userId) => {
    calls.push(`pinned:${userId}`);
    return Result.ok([]);
  };
  workspaceViewsService.pinProject = async (userId, projectId) => {
    calls.push(`pin:${userId}:${projectId}`);
    return projectId === 'prj_missing'
      ? Result.fail('Project not found', 'NOT_FOUND')
      : Result.ok(undefined);
  };
  workspaceViewsService.unpinProject = async (userId, projectId) => {
    calls.push(`unpin:${userId}:${projectId}`);
    return Result.ok(undefined);
  };
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(reportsService, originalReportsService);
  Object.assign(workspaceViewsService, originalWorkspaceViewsService);
});

describe('report view routes', () => {
  it('resolves the "assigned to me" filter to the signed-in user', async () => {
    const res = await request('/reports?assignedTo=__me__&status=open,in_progress');
    expect(res.status).toBe(200);
    expect(listFilter?.assignedTo).toBe(viewer.id);
    expect(listFilter?.status).toEqual(['open', 'in_progress']);
  });

  it('passes other assignee filters through', async () => {
    await request('/reports?assignedTo=__unassigned__');
    expect(listFilter?.assignedTo).toBe('__unassigned__');
  });

  it('returns view counts for the signed-in user', async () => {
    const res = await request('/reports/views/counts');
    expect(await res.json()).toMatchObject({
      counts: { assignedToMe: 1, unassigned: 2, active: 3 },
    });
    expect(calls).toEqual([`counts:${viewer.id}`]);
  });

  it('lists recent reports with a default limit', async () => {
    const res = await request('/reports/recent');
    expect(res.status).toBe(200);
    expect(calls).toEqual([`recent:${viewer.id}:3`]);
  });

  it('records a report view for every role', async () => {
    expect((await request('/reports/rpt_1/views', 'POST')).status).toBe(200);
    expect((await request('/reports/rpt_missing/views', 'POST')).status).toBe(404);
    expect(calls).toEqual([`view:${viewer.id}:rpt_1`, `view:${viewer.id}:rpt_missing`]);
  });
});

describe('pinned project routes', () => {
  it('lets viewers list, pin and unpin projects', async () => {
    expect((await request('/projects/pinned')).status).toBe(200);
    expect((await request('/projects/prj_1/pin', 'PUT')).status).toBe(200);
    expect((await request('/projects/prj_1/pin', 'DELETE')).status).toBe(200);
    expect(calls).toEqual([
      `pinned:${viewer.id}`,
      `pin:${viewer.id}:prj_1`,
      `unpin:${viewer.id}:prj_1`,
    ]);
  });

  it('keeps project management admin-only', async () => {
    expect((await request('/projects')).status).toBe(403);
  });
});
