import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { integrationsRepo } from '../../../src/server/database/repositories/integrations.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { publicFilesRoutes } from '../../../src/server/routes/api/public-files';
import type { FileRecord, Integration, Report } from '../../../src/shared/types';

const originalFilesRepo = { ...filesRepo };
const originalIntegrationsRepo = { ...integrationsRepo };
const originalReportsRepo = { ...reportsRepo };
let tempDir = '';
let fileRecord: FileRecord;

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
  reportsRepo.findById = async () => ({ id: 'rpt_1', projectId: 'prj_1' }) as Report;
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
    integrationsRepo.findActiveByProjectId = async () => [
      {
        type: 'github',
        isActive: true,
        config: { publicVideoLinks: true },
      } as Integration,
    ];

    const res = await createApp().request('http://localhost/public/files/rpt_1/file.png', {
      headers: { range: 'bytes=0-2' },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
    expect(res.headers.get('Content-Range')).toBe('bytes 0-2/6');
    expect(await res.text()).toBe('pub');
  });

  it('revokes video access when the toggle is disabled or the integration is inactive', async () => {
    fileRecord = { ...fileRecord, type: 'video', mimeType: 'video/mp4' };
    const integration = {
      type: 'github',
      isActive: true,
      config: { publicVideoLinks: true },
    } as Integration;
    integrationsRepo.findActiveByProjectId = async () => [integration];
    const app = createApp();

    expect((await app.request('http://localhost/public/files/rpt_1/file.png')).status).toBe(200);

    integration.config = { publicVideoLinks: false };
    expect((await app.request('http://localhost/public/files/rpt_1/file.png')).status).toBe(403);

    integration.config = { publicVideoLinks: true };
    integration.isActive = false;
    expect((await app.request('http://localhost/public/files/rpt_1/file.png')).status).toBe(403);
  });

  for (const type of ['avatar', 'branding'] as const) {
    it(`refuses ${type} files`, async () => {
      fileRecord = { ...fileRecord, type };

      const res = await createApp().request('http://localhost/public/files/rpt_1/file.png');

      expect(res.status).toBe(403);
    });
  }
});
