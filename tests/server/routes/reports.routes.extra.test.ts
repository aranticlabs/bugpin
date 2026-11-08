import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Hono } from '../../../src/server/node_modules/hono';
import { reportsRoutes } from '../../../src/server/routes/api/reports';
import { authService } from '../../../src/server/services/auth.service';
import {
  integrationsService,
  type ForwardReportResult,
} from '../../../src/server/services/integrations.service';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { syncQueueService } from '../../../src/server/services/integrations/sync-queue.service';
import { Result } from '../../../src/server/utils/result';
import type { Report, Session, User, Integration } from '../../../src/shared/types';

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

const baseIntegration: Integration = {
  id: 'int_1',
  projectId: 'prj_1',
  type: 'github',
  name: 'GitHub',
  config: {
    owner: 'octo',
    repo: 'repo',
    accessToken: 'token',
  },
  isActive: true,
  usageCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let forwardResult: Result<ForwardReportResult> = Result.ok({ type: 'github', id: '123' });
let retryReport: Report | null = baseReport;
let retryIntegrations: Integration[] = [];

// Overrides go on the shared service objects and are restored after each test. Replacing
// whole modules with mock.module would leak into every test file that runs later.
const enqueueMock = mock(async (_reportId: string, _integrationId: string) => undefined);

let tempDir: string | null = null;
let storedFilePath = '';

const originalAuthService = { ...authService };
const originalFilesRepo = { ...filesRepo };
const originalIntegrationsService = { ...integrationsService };
const originalSyncQueueService = { ...syncQueueService };

beforeEach(() => {
  integrationsService.forwardReport = async () => forwardResult;

  forwardResult = Result.ok({ type: 'github', id: '123' });
  retryReport = baseReport;
  retryIntegrations = [];
  enqueueMock.mockClear();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugpin-'));
  storedFilePath = path.join(tempDir, 'file.png');
  fs.writeFileSync(storedFilePath, Buffer.from('file'));

  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });

  filesRepo.findById = async () => ({
    id: 'file_1',
    reportId: 'rpt_1',
    type: 'screenshot',
    filename: 'file.png',
    path: storedFilePath,
    mimeType: 'image/png',
    sizeBytes: 4,
    createdAt: new Date().toISOString(),
  });

  syncQueueService.retrySyncForReport = async (reportId: string) => {
    if (!retryReport) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }
    const githubIntegration = retryIntegrations.find(
      (i: Integration) => i.type === 'github' && i.isActive
    );
    if (!githubIntegration) {
      return Result.fail('No active GitHub integration found', 'INTEGRATION_NOT_FOUND');
    }
    await enqueueMock(reportId, githubIntegration.id);
    return Result.ok(undefined);
  };
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(integrationsService, originalIntegrationsService);
  Object.assign(syncQueueService, originalSyncQueueService);
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = null;
});

function createApp() {
  const app = new Hono();
  app.route('/reports', reportsRoutes);
  return app;
}

describe('reports routes extras', () => {
  it('serves report file contents when present', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/files/file_1', {
      headers: { cookie: 'session=sess_1' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('Content-Length')).toBe('4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await res.text()).toBe('file');
  });

  it('serves report file byte ranges', async () => {
    const res = await createApp().request('http://localhost/reports/rpt_1/files/file_1', {
      headers: { cookie: 'session=sess_1', range: 'bytes=1-2' },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect(res.headers.get('Content-Length')).toBe('2');
    expect(await res.text()).toBe('il');
  });

  it('returns 416 for an out-of-bounds report file range', async () => {
    const res = await createApp().request('http://localhost/reports/rpt_1/files/file_1', {
      headers: { cookie: 'session=sess_1', range: 'bytes=4-' },
    });

    expect(res.status).toBe(416);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Range')).toBe('bytes */4');
  });

  it('returns 404 when file missing on disk', async () => {
    fs.unlinkSync(storedFilePath);
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/files/file_1', {
      headers: { cookie: 'session=sess_1' },
    });

    expect(res.status).toBe(404);
  });

  it('forwards a report to integration', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/forward/int_1', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ extra: true }),
    });

    expect(res.status).toBe(200);
  });

  it('returns 403 when forward fails due to project mismatch', async () => {
    forwardResult = Result.fail('Mismatch', 'PROJECT_MISMATCH');
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/forward/int_1', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when integration is missing', async () => {
    forwardResult = Result.fail('Missing', 'INTEGRATION_NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/forward/int_1', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 when retrying sync for missing report', async () => {
    retryReport = null;
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/retry-sync', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when no active github integration exists', async () => {
    retryIntegrations = [];
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/retry-sync', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
    });

    expect(res.status).toBe(400);
  });

  it('queues sync when active github integration exists', async () => {
    retryIntegrations = [baseIntegration];
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/retry-sync', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
    });

    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledWith('rpt_1', 'int_1');
  });
});
