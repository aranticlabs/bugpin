import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { publicFilesRoutes } from '../../../src/server/routes/api/public-files';
import type { FileRecord } from '../../../src/shared/types';

const originalFilesRepo = { ...filesRepo };
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
});

afterEach(() => {
  Object.assign(filesRepo, originalFilesRepo);
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
});
