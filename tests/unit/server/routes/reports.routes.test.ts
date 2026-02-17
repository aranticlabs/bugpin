import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../../src/server/node_modules/hono/dist/index.js';
import { reportsRoutes } from '../../../../src/server/routes/api/reports';
import { reportsService } from '../../../../src/server/services/reports.service';
import { filesRepo } from '../../../../src/server/database/repositories/files.repo';
import { authService } from '../../../../src/server/services/auth.service';
import { Result } from '../../../../src/server/utils/result';
import type { Report, Session, User } from '../../../../src/shared/types';

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

const originalAuthService = { ...authService };
const originalReportsService = { ...reportsService };
const originalFilesRepo = { ...filesRepo };

let listFilter: unknown;
let reportResult: Report | null = baseReport;
let reportUpdatePayload: unknown;
let userRole: User['role'] = 'admin';

beforeEach(() => {
  listFilter = undefined;
  reportResult = baseReport;
  reportUpdatePayload = undefined;
  userRole = 'admin';

  authService.validateSession = async () =>
    Result.ok({
      user: { ...baseUser, role: userRole },
      session: baseSession,
    });

  reportsService.list = async (filter) => {
    listFilter = filter;
    return Result.ok({
      data: [baseReport],
      total: 1,
      page: filter.page ?? 1,
      limit: filter.limit ?? 20,
      totalPages: 1,
    });
  };
  reportsService.getByIdWithFiles = async () => {
    if (!reportResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok({ report: reportResult, files: [] });
  };
  reportsService.update = async (_id, body) => {
    reportUpdatePayload = body;
    if (!reportResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok({ ...reportResult, ...(body as Partial<Report>) });
  };
  reportsService.delete = async () => {
    if (!reportResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok(undefined);
  };
  reportsService.bulkUpdate = async () => Result.ok(2);
  reportsService.getStats = async () =>
    Result.ok({ total: 1, byStatus: { open: 1 }, byPriority: { medium: 1 } } as never);

  filesRepo.findByReportId = async () => [];
  filesRepo.findById = async () => null;
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(reportsService, originalReportsService);
  Object.assign(filesRepo, originalFilesRepo);
});

function createApp() {
  const app = new Hono();
  app.route('/reports', reportsRoutes);
  return app;
}

describe('reports routes', () => {
  it('lists reports with filter params', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports?status=open,closed&limit=10', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    expect(listFilter).toMatchObject({ status: ['open', 'closed'], limit: 10 });
  });

  it('returns 404 for missing report', async () => {
    reportResult = null;
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_missing', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('updates report for admin/editor', async () => {
    userRole = 'editor';
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'New title' }),
    });
    expect(res.status).toBe(200);
    expect(reportUpdatePayload).toMatchObject({ title: 'New title' });
  });

  it('blocks delete for non-admin', async () => {
    userRole = 'viewer';
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(403);
  });

  it('bulk updates reports', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/bulk-update', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ids: ['rpt_1'], updates: { status: 'closed' } }),
    });
    expect(res.status).toBe(200);
  });

  it('returns report stats', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/stats/overview', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns report files list', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/files', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when file missing', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/files/file_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });
});
