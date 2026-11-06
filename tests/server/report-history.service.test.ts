import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../src/server/config';
import { initDatabase, initSchema, closeDatabase, getDb } from '../../src/server/database/database';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { reportHistoryService } from '../../src/server/services/report-history.service';
import type { ReportMetadata } from '../../src/shared/types';

const originalConfig = { ...config };
let tempDir = '';

const baseMetadata: ReportMetadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop', os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-report-history-'));
  Object.assign(config, {
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'bugpin.db'),
    uploadsDir: path.join(tempDir, 'uploads'),
    screenshotsDir: path.join(tempDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(tempDir, 'uploads', 'attachments'),
    brandingDir: path.join(tempDir, 'uploads', 'branding'),
    avatarsDir: path.join(tempDir, 'uploads', 'avatars'),
  });
  await initDatabase();
  await initSchema();
});

afterAll(() => {
  closeDatabase();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  Object.assign(config, originalConfig);
});

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM report_history');
  db.exec('DELETE FROM reports');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM projects');
});

describe('reportHistoryService', () => {
  it('returns NOT_FOUND for missing report', async () => {
    const result = await reportHistoryService.listByReport('missing');
    expect(result.success).toBe(false);
  });

  it('enriches assignee names in history entries', async () => {
    const project = await projectsRepo.create({ name: 'History Project' });
    const assignee = await usersRepo.create({
      email: 'assignee@example.com',
      name: 'Assignee User',
      passwordHash: 'hash',
      role: 'editor',
    });
    const actor = await usersRepo.create({
      email: 'actor@example.com',
      name: 'Actor User',
      passwordHash: 'hash',
      role: 'admin',
    });
    const report = await reportsRepo.create({
      projectId: project.id,
      title: 'History report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    await reportHistoryService.record(report.id, actor.id, 'assignee_changed', null, assignee.id);

    const result = await reportHistoryService.listByReport(report.id);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0].newDisplay).toBe('Assignee User');
      expect(result.value[0].oldDisplay).toBe('Unassigned');
    }
  });
});
