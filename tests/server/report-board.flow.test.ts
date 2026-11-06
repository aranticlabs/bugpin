import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  getDb,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { positionBetween, reportsService } from '../../src/server/services/reports.service';
import { logger } from '../../src/server/utils/logger';
import type { Project, Report, ReportStatus } from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const metadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop' as const, os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};
let tempDir = '';
let project: Project;

async function createReport(title: string, status: ReportStatus = 'open'): Promise<Report> {
  const report = await reportsRepo.create({ projectId: project.id, title, metadata });
  if (status !== 'open') await reportsRepo.update(report.id, { status });
  return report;
}

async function column(status: ReportStatus): Promise<string[]> {
  const result = await reportsRepo.find({
    projectId: project.id,
    status: [status],
    sortBy: 'position',
    sortOrder: 'asc',
  });
  return result.data.map((report) => report.title);
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-report-board-'));
  Object.assign(config, { dataDir: tempDir, dbPath: path.join(tempDir, 'bugpin.db') });
  await initDatabase();
  await initSchema();
  await runMigrations();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
});

beforeEach(async () => {
  project = await projectsRepo.create({ name: `Project ${crypto.randomUUID()}` });
});

describe('board positions', () => {
  it('puts new reports at the top of the Open column', async () => {
    await createReport('First');
    await createReport('Second');
    await createReport('Third');

    expect(await column('open')).toEqual(['Third', 'Second', 'First']);
  });

  it('puts a report whose status changed elsewhere at the top of its new column', async () => {
    await createReport('Older fix', 'resolved');
    const moved = await createReport('Moved');
    await createReport('Stays open');

    await reportsRepo.update(moved.id, { status: 'resolved' });
    await reportsRepo.update(moved.id, { status: 'resolved', priority: 'high' });

    expect(await column('resolved')).toEqual(['Moved', 'Older fix']);
    expect(await column('open')).toEqual(['Stays open']);
  });

  it('places a report between two neighbors in the same column', async () => {
    const bottom = await createReport('Bottom');
    const middle = await createReport('Middle');
    const top = await createReport('Top');

    const result = await reportsService.moveOnBoard(bottom.id, {
      status: 'open',
      previousId: top.id,
      nextId: middle.id,
    });

    expect(result.success).toBe(true);
    expect(await column('open')).toEqual(['Top', 'Bottom', 'Middle']);
  });

  it('changes the status when a report is dropped into another column', async () => {
    const report = await createReport('Crash');
    const first = await createReport('First in progress', 'in_progress');
    const second = await createReport('Second in progress', 'in_progress');

    const result = await reportsService.moveOnBoard(report.id, {
      status: 'in_progress',
      previousId: second.id,
      nextId: first.id,
    });

    expect(result.success && result.value.status).toBe('in_progress');
    expect(await column('in_progress')).toEqual([
      'Second in progress',
      'Crash',
      'First in progress',
    ]);
    expect(await column('open')).toEqual([]);
  });

  it('accepts a drop into an empty column and at either end of a column', async () => {
    const report = await createReport('Lonely');
    expect(
      (await reportsService.moveOnBoard(report.id, { status: 'closed', previousId: null })).success
    ).toBe(true);
    expect(await column('closed')).toEqual(['Lonely']);

    const last = await createReport('Last');
    const first = await createReport('First');
    await reportsService.moveOnBoard(last.id, { status: 'closed', previousId: report.id });
    await reportsService.moveOnBoard(first.id, { status: 'closed', nextId: report.id });
    expect(await column('closed')).toEqual(['First', 'Lonely', 'Last']);
  });

  it('places a report under its upper neighbor even when the lower neighbor is out of date', async () => {
    const third = await createReport('Third');
    await createReport('Second');
    const first = await createReport('First');
    const moving = await createReport('Moving', 'closed');

    const result = await reportsService.moveOnBoard(moving.id, {
      status: 'open',
      previousId: first.id,
      nextId: third.id,
    });

    expect(result.success).toBe(true);
    expect(await column('open')).toEqual(['First', 'Moving', 'Second', 'Third']);
  });

  it('puts a report at the top when no neighbors are given for a column that has reports', async () => {
    await createReport('Existing');
    const moving = await createReport('Moving', 'resolved');

    await reportsService.moveOnBoard(moving.id, { status: 'open' });

    expect(await column('open')).toEqual(['Moving', 'Existing']);
  });

  it('saves the sorted order as the hand-made order when a sorted board is reordered', async () => {
    const low = await reportsRepo.create({
      projectId: project.id,
      title: 'Low',
      priority: 'low',
      metadata,
    });
    await reportsRepo.create({ projectId: project.id, title: 'High', priority: 'high', metadata });
    const medium = await reportsRepo.create({
      projectId: project.id,
      title: 'Medium',
      priority: 'medium',
      metadata,
    });
    await reportsRepo.create({ projectId: project.id, title: 'Done', priority: 'low', metadata });
    await reportsRepo.update(
      (await reportsRepo.find({ projectId: project.id, search: 'Done' })).data[0].id,
      {
        status: 'closed',
      }
    );
    expect(await column('open')).toEqual(['Medium', 'High', 'Low']);

    const result = await reportsService.moveOnBoard(low.id, {
      status: 'open',
      previousId: null,
      nextId: medium.id,
      adoptSort: { sortBy: 'priority', sortOrder: 'desc' },
    });

    expect(result.success).toBe(true);
    expect(await column('open')).toEqual(['High', 'Low', 'Medium']);
    expect(await column('closed')).toEqual(['Done']);
  });

  it('renumbers a column when neighbors leave no room between them', async () => {
    const lower = await createReport('Lower');
    const upper = await createReport('Upper');
    const moving = await createReport('Moving', 'in_progress');
    reportsRepo.setBoardPosition(upper.id, 5);
    reportsRepo.setBoardPosition(lower.id, 5 + 1e-9);

    const result = await reportsService.moveOnBoard(moving.id, {
      status: 'open',
      previousId: upper.id,
      nextId: lower.id,
    });

    expect(result.success).toBe(true);
    expect(await column('open')).toEqual(['Upper', 'Moving', 'Lower']);
  });

  it('rejects neighbors from another column, itself as a neighbor, and unknown reports', async () => {
    const report = await createReport('Report');
    const elsewhere = await createReport('Elsewhere', 'closed');

    const wrongColumn = await reportsService.moveOnBoard(report.id, {
      status: 'open',
      previousId: elsewhere.id,
    });
    const self = await reportsService.moveOnBoard(report.id, {
      status: 'open',
      nextId: report.id,
    });
    const missing = await reportsService.moveOnBoard('rpt_missing', { status: 'open' });

    expect(!wrongColumn.success && wrongColumn.code).toBe('INVALID_BOARD_POSITION');
    expect(!self.success && self.code).toBe('INVALID_BOARD_POSITION');
    expect(!missing.success && missing.code).toBe('NOT_FOUND');
    expect((await reportsRepo.findById(report.id))?.status).toBe('open');
  });

  it('orders existing reports newest first in each column when the migration runs', async () => {
    const old = await createReport('Old');
    await createReport('New');
    getDb().run("UPDATE reports SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", [
      old.id,
    ]);
    await createReport('Done', 'closed');
    getDb().run('UPDATE reports SET board_position = 0 WHERE project_id = ?', [project.id]);

    const migration = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../src/server/database/migrations/014_add_report_board_position.sql'
      ),
      'utf8'
    );
    const backfill = migration.slice(
      migration.indexOf('UPDATE'),
      migration.indexOf(';', migration.indexOf('UPDATE'))
    );
    getDb().exec(backfill);

    expect(await column('open')).toEqual(['New', 'Old']);
    expect(await column('closed')).toEqual(['Done']);
  });
});

describe('positionBetween', () => {
  it('returns a position between, above, or below its neighbors', () => {
    expect(positionBetween(undefined, undefined)).toBe(0);
    expect(positionBetween(undefined, 3)).toBe(2);
    expect(positionBetween(3, undefined)).toBe(4);
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(1, 1 + 1e-9)).toBeNull();
  });
});
