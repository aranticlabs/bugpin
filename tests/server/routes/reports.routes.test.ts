import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { reportsRoutes } from '../../../src/server/routes/api/reports';
import { reportsService } from '../../../src/server/services/reports.service';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type { Report, Session, User } from '../../../src/shared/types';

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
  source: 'widget',
  reporterLocale: 'en',
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
let createManualPayload: unknown;
let userRole: User['role'] = 'admin';
let boardMove: unknown;

beforeEach(() => {
  listFilter = undefined;
  reportResult = baseReport;
  reportUpdatePayload = undefined;
  createManualPayload = undefined;
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
  boardMove = undefined;
  reportsService.moveManyOnBoard = async (ids, target) => {
    boardMove = { ids, ...target };
    return Result.ok(ids.map((id) => ({ ...baseReport, id, status: target.status })));
  };
  reportsService.moveOnBoard = async (id, target) => {
    boardMove = { id, ...target };
    if (!reportResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok({ ...reportResult, status: target.status });
  };
  reportsService.createManual = async (body) => {
    createManualPayload = body;
    return Result.ok({
      ...baseReport,
      id: 'rpt_new',
      source: 'manual',
      projectId: body.projectId,
      title: body.title,
    });
  };
  reportsService.getStats = async () =>
    Result.ok({ total: 1, byStatus: { open: 1 }, byPriority: { medium: 1 } } as never);

  filesRepo.findByReportId = async () => [];
  filesRepo.findOriginalByReportId = async () => [];
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
    const res = await app.request(
      'http://localhost/reports?status=open,closed&assignedTo=usr_2&source=manual&limit=10',
      {
        headers: { cookie: 'session=sess_1' },
      }
    );
    expect(res.status).toBe(200);
    expect(listFilter).toMatchObject({
      status: ['open', 'closed'],
      assignedTo: 'usr_2',
      source: 'manual',
      limit: 10,
    });
  });

  it('passes a list cursor through and returns 400 for one the service rejects', async () => {
    const res = await createApp().request('http://localhost/reports?sortBy=position&after=abc', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    expect(listFilter).toMatchObject({ sortBy: 'position', after: 'abc' });

    reportsService.list = async () => Result.fail('The cursor does not match', 'INVALID_CURSOR');
    const rejected = await createApp().request('http://localhost/reports?after=abc', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as { error: string }).error).toBe('INVALID_CURSOR');
  });

  it('creates a manual report for admin/editor', async () => {
    userRole = 'editor';
    const app = createApp();
    const formData = new FormData();
    formData.append(
      'data',
      JSON.stringify({
        projectId: 'prj_1',
        title: 'Manual report',
        priority: 'medium',
        channel: 'email',
        url: 'bugpin.io',
      })
    );

    const res = await app.request('http://localhost/reports', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(createManualPayload).toMatchObject({
      projectId: 'prj_1',
      title: 'Manual report',
      channel: 'email',
      url: 'https://bugpin.io',
    });
  });

  it('normalizes MIME parameters on manual report files', async () => {
    const formData = new FormData();
    formData.append(
      'data',
      JSON.stringify({ projectId: 'prj_1', title: 'Manual report', priority: 'medium' })
    );
    formData.append(
      'files',
      new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])], 'clip.mp4', {
        type: 'video/mp4;codecs=avc1.64001f',
      })
    );

    const res = await createApp().request('http://localhost/reports', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(createManualPayload).toMatchObject({
      files: [{ mimeType: 'video/mp4' }],
    });
  });

  it('blocks manual report creation for viewers', async () => {
    userRole = 'viewer';
    const app = createApp();
    const res = await app.request('http://localhost/reports', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ projectId: 'prj_1', title: 'Manual report' }),
    });

    expect(res.status).toBe(403);
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

  it('moves a report on the board for admin/editor', async () => {
    userRole = 'editor';
    const res = await createApp().request('http://localhost/reports/rpt_1/board-position', {
      method: 'PATCH',
      headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'resolved',
        previousId: 'rpt_2',
        nextId: null,
        adoptSort: { sortBy: 'priority', sortOrder: 'desc' },
      }),
    });
    expect(res.status).toBe(200);
    expect(boardMove).toEqual({
      id: 'rpt_1',
      status: 'resolved',
      previousId: 'rpt_2',
      nextId: null,
      adoptSort: { sortBy: 'priority', sortOrder: 'desc' },
    });
    expect(((await res.json()) as { report: { status: string } }).report.status).toBe('resolved');
  });

  it('rejects board moves from viewers and with invalid bodies', async () => {
    const request = (body: unknown) =>
      createApp().request('http://localhost/reports/rpt_1/board-position', {
        method: 'PATCH',
        headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect((await request({ status: 'done' })).status).toBe(400);
    expect((await request({ status: 'open', position: 3 })).status).toBe(400);
    expect(
      (await request({ status: 'open', adoptSort: { sortBy: 'random', sortOrder: 'asc' } })).status
    ).toBe(400);
    userRole = 'viewer';
    expect((await request({ status: 'open' })).status).toBe(403);
    expect(boardMove).toBeUndefined();
  });

  it('scopes a saved sort to the board filters and resolves the signed-in assignee', async () => {
    const res = await createApp().request('http://localhost/reports/rpt_1/board-position', {
      method: 'PATCH',
      headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'open',
        nextId: 'rpt_2',
        adoptSort: {
          sortBy: 'priority',
          sortOrder: 'desc',
          scope: {
            projectId: 'prj_1',
            status: ['open', 'in_progress'],
            priority: ['high'],
            assignedTo: '__me__',
            search: 'crash',
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(boardMove).toMatchObject({
      adoptSort: {
        scope: {
          projectId: 'prj_1',
          status: ['open', 'in_progress'],
          priority: ['high'],
          assignedTo: 'usr_1',
          search: 'crash',
        },
      },
    });
  });

  it('rejects unknown or invalid board scope fields', async () => {
    const request = (scope: unknown) =>
      createApp().request('http://localhost/reports/rpt_1/board-position', {
        method: 'PATCH',
        headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'open',
          adoptSort: { sortBy: 'title', sortOrder: 'asc', scope },
        }),
      });

    expect((await request({ createdAfter: '2024-01-01' })).status).toBe(400);
    expect((await request({ status: ['done'] })).status).toBe(400);
    expect((await request({ priority: ['urgent'] })).status).toBe(400);
    expect(boardMove).toBeUndefined();
  });

  it('returns 500 when the board move cannot be saved', async () => {
    reportsService.moveOnBoard = async () => Result.fail('Failed to move report', 'UPDATE_FAILED');
    const res = await createApp().request('http://localhost/reports/rpt_1/board-position', {
      method: 'PATCH',
      headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(res.status).toBe(500);
  });

  it('moves several reports on the board in one request', async () => {
    userRole = 'editor';
    const res = await createApp().request('http://localhost/reports/bulk-board-position', {
      method: 'POST',
      headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['rpt_1', 'rpt_2'], status: 'closed', previousId: 'rpt_3' }),
    });
    expect(res.status).toBe(200);
    expect(boardMove).toEqual({
      ids: ['rpt_1', 'rpt_2'],
      status: 'closed',
      previousId: 'rpt_3',
    });
    expect(((await res.json()) as { reports: unknown[] }).reports).toHaveLength(2);
  });

  it('rejects group board moves from viewers and with too many or no reports', async () => {
    const request = (body: unknown) =>
      createApp().request('http://localhost/reports/bulk-board-position', {
        method: 'POST',
        headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    expect((await request({ ids: [], status: 'open' })).status).toBe(400);
    expect(
      (await request({ ids: Array.from({ length: 101 }, (_, i) => `rpt_${i}`), status: 'open' }))
        .status
    ).toBe(400);
    userRole = 'viewer';
    expect((await request({ ids: ['rpt_1'], status: 'open' })).status).toBe(403);
    expect(boardMove).toBeUndefined();
  });

  it('returns 404 when moving a missing report on the board', async () => {
    reportResult = null;
    const res = await createApp().request('http://localhost/reports/rpt_1/board-position', {
      method: 'PATCH',
      headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    expect(res.status).toBe(404);
  });

  it('ignores forwardedTo on report update mass-assignment', async () => {
    userRole = 'editor';
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Still allowed',
        forwardedTo: [
          {
            integrationId: 'int_fake',
            externalId: '999',
            externalUrl: 'https://evil.example/issues/999',
            forwardedAt: '2026-07-09T00:00:00.000Z',
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(reportUpdatePayload).toMatchObject({ title: 'Still allowed' });
    expect(reportUpdatePayload).not.toHaveProperty('forwardedTo');
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
