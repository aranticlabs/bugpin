import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { integrationsRepo } from '../../../src/server/database/repositories/integrations.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { publicFilesRoutes } from '../../../src/server/routes/api/public-files';
import type {
  FileRecord,
  FileType,
  GitHubIntegrationConfig,
  Integration,
  Report,
} from '../../../src/shared/types';

const originalFilesRepo = { ...filesRepo };
const originalIntegrationsRepo = { ...integrationsRepo };
const originalReportsRepo = { ...reportsRepo };
let tempDir = '';
let fileRecord: FileRecord;
let report: Report;

function syncReportTo(owner: string, repo: string): void {
  report = { ...report, githubIssueUrl: `https://github.com/${owner}/${repo}/issues/12` };
}

function githubIntegration(overrides: Partial<GitHubIntegrationConfig> = {}): Integration {
  return {
    type: 'github',
    isActive: true,
    config: {
      owner: 'acme',
      repo: 'widgets',
      accessToken: 'token',
      publicVideoLinks: true,
      ...overrides,
    },
  } as Integration;
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bugpin-public-file-'));
  const filePath = join(tempDir, 'file.png');
  writeFileSync(filePath, 'public');
  fileRecord = {
    id: 'file_1',
    reportId: 'rpt_1',
    type: 'screenshot',
    filename: 'file.png',
    path: filePath,
    mimeType: 'image/png',
    sizeBytes: 6,
    createdAt: new Date().toISOString(),
  };
  filesRepo.findByReportId = async () => [fileRecord];
  report = { id: 'rpt_1', projectId: 'prj_1' } as Report;
  reportsRepo.findById = async () => report;
  integrationsRepo.findActiveByProjectId = async () => [];
});

afterEach(() => {
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(integrationsRepo, originalIntegrationsRepo);
  Object.assign(reportsRepo, originalReportsRepo);
  rmSync(tempDir, { recursive: true, force: true });
});

function createApp() {
  const app = new Hono();
  app.route('/public/files', publicFilesRoutes);
  return app;
}

describe('public file routes', () => {
  it('serves full files with range support advertised', async () => {
    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

    expect(res.status).toBe(200);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Length')).toBe('6');
    expect(await res.text()).toBe('public');
  });

  it('serves partial files and rejects out-of-bounds ranges', async () => {
    const app = createApp();
    const partial = await app.request('http://localhost/public/files/rpt_1/file.png', {
      headers: { range: 'bytes=-3' },
    });

    expect(partial.status).toBe(206);
    expect(partial.headers.get('Content-Range')).toBe('bytes 3-5/6');
    expect(await partial.text()).toBe('lic');

    const unsatisfiable = await app.request('http://localhost/public/files/rpt_1/file.png', {
      headers: { range: 'bytes=6-' },
    });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('Cache-Control')).toBe('no-store');
    expect(unsatisfiable.headers.get('Content-Range')).toBe('bytes */6');
  });

  it('refuses video files', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

    expect(res.status).toBe(403);
  });

  it('serves ranged videos privately while an active GitHub integration allows public links', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    syncReportTo('acme', 'widgets');
    integrationsRepo.findActiveByProjectId = async () => [githubIntegration()];

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png', {
      headers: { range: 'bytes=0-2' },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Content-Range')).toBe('bytes 0-2/6');
    expect(await res.text()).toBe('pub');
  });

  it('answers HEAD requests with headers only', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    syncReportTo('acme', 'widgets');
    integrationsRepo.findActiveByProjectId = async () => [githubIntegration()];

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png', {
      method: 'HEAD',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('6');
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(await res.text()).toBe('');
  });

  it('serves videos of reports forwarded manually to the allowed repository', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    report = {
      ...report,
      forwardedTo: [{ type: 'github', id: '7', url: 'https://github.com/Acme/Widgets/issues/7' }],
    };
    integrationsRepo.findActiveByProjectId = async () => [githubIntegration()];

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

    expect(res.status).toBe(200);
  });

  it('refuses videos of reports that were never sent to GitHub', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    let integrationsLoaded = false;
    integrationsRepo.findActiveByProjectId = async () => {
      integrationsLoaded = true;
      return [githubIntegration()];
    };

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

    expect(res.status).toBe(403);
    expect(integrationsLoaded).toBe(false);
  });

  it('refuses videos synced only to a repository whose integration disallows public links', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    syncReportTo('acme', 'private-repo');
    integrationsRepo.findActiveByProjectId = async () => [
      githubIntegration(),
      githubIntegration({ repo: 'private-repo', publicVideoLinks: false }),
    ];

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

    expect(res.status).toBe(403);
  });

  it('refuses public video links enabled by a non-boolean config value', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    syncReportTo('acme', 'widgets');
    const integration = githubIntegration();
    integration.config = {
      ...integration.config,
      publicVideoLinks: 'true',
    } as unknown as Integration['config'];
    integrationsRepo.findActiveByProjectId = async () => [integration];

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

    expect(res.status).toBe(403);
  });

  it('revokes video access when the toggle is disabled or the integration is inactive', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    syncReportTo('acme', 'widgets');
    const integration = githubIntegration();
    integrationsRepo.findActiveByProjectId = async () => [integration];
    const app = createApp();

    expect((await app.request('http://localhost/public/files/rpt_1/file.png')).status).toBe(200);

    integration.config = { ...integration.config, publicVideoLinks: false };
    expect((await app.request('http://localhost/public/files/rpt_1/file.png')).status).toBe(403);

    integration.config = { ...integration.config, publicVideoLinks: true };
    integration.isActive = false;
    expect((await app.request('http://localhost/public/files/rpt_1/file.png')).status).toBe(403);
  });

  for (const type of ['avatar', 'branding'] as const) {
    it(`refuses ${type} files`, async () => {
      // Rows read from SQLite are not checked against FileType, so the service must reject other values
      fileRecord = { ...fileRecord, type: type as string as FileType };

      const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

      expect(res.status).toBe(403);
    });
  }
});
