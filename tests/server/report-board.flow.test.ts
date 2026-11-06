import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
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
import { reportHistoryRepo } from '../../src/server/database/repositories/report-history.repo';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { positionBetween, reportsService } from '../../src/server/services/reports.service';
import { notificationsService } from '../../src/server/services/notifications.service';
import { getEEProjectLicenseService } from '../../src/server/utils/ee';
import { logger } from '../../src/server/utils/logger';
import { Result } from '../../src/server/utils/result';
import {
  REPORT_SORT_KEYS,
  type Project,
  type Report,
  type ReportPriority,
  type ReportStatus,
} from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const originalNotifications = { ...notificationsService };
const originalReportsRepo = { ...reportsRepo };
const metadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop' as const, os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};
let tempDir = '';
let project: Project;

async function createReport(
  title: string,
  status: ReportStatus = 'open',
  options: { priority?: ReportPriority; inProject?: Project } = {}
): Promise<Report> {
  const report = await reportsRepo.create({
    projectId: (options.inProject ?? project).id,
    title,
    priority: options.priority,
    metadata,
  });
  if (status !== 'open') await reportsRepo.update(report.id, { status });
  return report;
}

async function column(status: ReportStatus, inProject: Project = project): Promise<string[]> {
  const result = await reportsRepo.find({
    projectId: inProject.id,
    status: [status],
    sortBy: 'position',
    sortOrder: 'asc',
  });
  return result.data.map((report) => report.title);
}

function positionsOf(reports: Report[]): number[] {
  const placements = reportsRepo.boardPlacements(reports.map((report) => report.id));
  return reports.map((report) => placements.get(report.id)?.position ?? Number.NaN);
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

afterEach(() => {
  Object.assign(notificationsService, originalNotifications);
  Object.assign(reportsRepo, originalReportsRepo);
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

  it('limits a saved sort to the reports in the board scope', async () => {
    const otherProject = await projectsRepo.create({ name: `Other ${crypto.randomUUID()}` });
    const elsewhere = [
      await createReport('Elsewhere low', 'open', { priority: 'low', inProject: otherProject }),
      await createReport('Elsewhere high', 'open', { priority: 'high', inProject: otherProject }),
    ];
    const low = await createReport('Low', 'open', { priority: 'low' });
    const lowest = await createReport('Lowest', 'open', { priority: 'lowest' });
    const high = await createReport('High', 'open', { priority: 'high' });
    const progress = [
      await createReport('Progress low', 'in_progress', { priority: 'low' }),
      await createReport('Progress high', 'in_progress', { priority: 'high' }),
    ];
    const elsewherePositions = positionsOf(elsewhere);
    const progressPositions = positionsOf(progress);
    const scopedSlots = positionsOf([low, lowest, high]).sort((a, b) => a - b);

    const result = await reportsService.moveOnBoard(lowest.id, {
      status: 'open',
      previousId: low.id,
      adoptSort: {
        sortBy: 'priority',
        sortOrder: 'desc',
        scope: { projectId: project.id, status: ['open'] },
      },
    });

    expect(result.success).toBe(true);
    expect(await column('open')).toEqual(['High', 'Low', 'Lowest']);
    expect(positionsOf(elsewhere)).toEqual(elsewherePositions);
    expect(await column('open', otherProject)).toEqual(['Elsewhere high', 'Elsewhere low']);
    expect(positionsOf(progress)).toEqual(progressPositions);
    expect(await column('in_progress')).toEqual(['Progress high', 'Progress low']);
    expect(positionsOf([high, low, lowest]).slice(0, 2)).toEqual(scopedSlots.slice(0, 2));
  });

  it('ignores a saved sort when the board is already in manual order', async () => {
    const first = await createReport('First');
    const second = await createReport('Second');
    const before = positionsOf([first, second]);

    await reportsService.moveOnBoard(second.id, {
      status: 'open',
      previousId: null,
      nextId: first.id,
      adoptSort: { sortBy: 'position', sortOrder: 'asc' },
    });

    expect(positionsOf([first, second])).toEqual(before);
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

  it('rejects itself as a neighbor and unknown reports', async () => {
    const report = await createReport('Report');

    const self = await reportsService.moveOnBoard(report.id, {
      status: 'closed',
      nextId: report.id,
    });
    const missing = await reportsService.moveOnBoard('rpt_missing', { status: 'open' });

    expect(!self.success && self.code).toBe('INVALID_BOARD_POSITION');
    expect(!missing.success && missing.code).toBe('NOT_FOUND');
    expect((await reportsRepo.findById(report.id))?.status).toBe('open');
  });

  it('places a report next to the neighbor that is still in the column when the other has left', async () => {
    const lower = await createReport('Lower');
    const upper = await createReport('Upper');
    const left = await createReport('Left the column');
    const moving = await createReport('Moving', 'closed');
    await reportsRepo.update(left.id, { status: 'resolved' });

    const result = await reportsService.moveOnBoard(moving.id, {
      status: 'open',
      previousId: left.id,
      nextId: lower.id,
    });

    expect(result.success).toBe(true);
    expect(await column('open')).toEqual(['Upper', 'Moving', 'Lower']);
  });

  it('drops below a vanished card at the end of the column, and above one at the top', async () => {
    await createReport('Bottom');
    await createReport('Top');
    const deleted = await createReport('Deleted');
    await reportsRepo.delete(deleted.id);
    const toBottom = await createReport('To bottom', 'closed');
    const toTop = await createReport('To top', 'closed');

    await reportsService.moveOnBoard(toBottom.id, { status: 'open', previousId: deleted.id });
    await reportsService.moveOnBoard(toTop.id, { status: 'open', nextId: deleted.id });

    expect(await column('open')).toEqual(['To top', 'Top', 'Bottom', 'To bottom']);
  });

  it('records the status change, sets resolution fields, and clears them when reopened', async () => {
    const user = await usersRepo.create({
      email: `board-${crypto.randomUUID()}@example.com`,
      passwordHash: 'hash',
      name: 'Board User',
      role: 'editor',
    });
    const report = await createReport('Bug');

    const resolved = await reportsService.moveOnBoard(report.id, { status: 'resolved' }, user.id);
    expect(resolved.success && resolved.value.resolvedAt).toBeTruthy();
    expect(resolved.success && resolved.value.resolvedBy).toBe(user.id);

    const reopened = await reportsService.moveOnBoard(report.id, { status: 'open' }, user.id);
    expect(reopened.success && reopened.value.resolvedAt).toBeUndefined();
    expect(reopened.success && reopened.value.resolvedBy).toBeUndefined();

    const history = await reportHistoryRepo.findByReportId(report.id);
    const changes = history.map((entry) => [entry.action, entry.oldValue, entry.newValue]);
    expect(changes).toHaveLength(2);
    expect(changes).toContainEqual(['status_changed', 'open', 'resolved']);
    expect(changes).toContainEqual(['status_changed', 'resolved', 'open']);
    expect(history.every((entry) => entry.userId === user.id)).toBe(true);
  });

  it('sends status notifications only when the column changes', async () => {
    const notified: string[] = [];
    notificationsService.notifyStatusChange = async (_report, oldStatus, newStatus) => {
      notified.push(`${oldStatus}->${newStatus}`);
    };
    notificationsService.notifyReporterStatusChange = async () => undefined;
    const report = await createReport('Bug');
    const other = await createReport('Other');

    await reportsService.moveOnBoard(report.id, { status: 'open', previousId: other.id });
    await reportsService.moveOnBoard(report.id, { status: 'in_progress' });

    expect(notified).toEqual(['open->in_progress']);
    expect(await reportHistoryRepo.findByReportId(other.id)).toEqual([]);
  });

  it('rolls back the sort, status, and history when placing the report fails', async () => {
    const notified: string[] = [];
    notificationsService.notifyStatusChange = async () => {
      notified.push('status');
    };
    const low = await createReport('Low', 'open', { priority: 'low' });
    await createReport('High', 'open', { priority: 'high' });
    const moving = await createReport('Moving', 'closed');
    reportsRepo.setBoardPosition = () => {
      throw new Error('disk full');
    };

    await expect(
      reportsService.moveOnBoard(moving.id, {
        status: 'open',
        nextId: low.id,
        adoptSort: { sortBy: 'priority', sortOrder: 'desc', scope: { projectId: project.id } },
      })
    ).rejects.toThrow('disk full');

    Object.assign(reportsRepo, originalReportsRepo);
    expect((await reportsRepo.findById(moving.id))?.status).toBe('closed');
    expect(await reportHistoryRepo.findByReportId(moving.id)).toEqual([]);
    expect(await column('open')).toEqual(['High', 'Low']);
    expect(await column('closed')).toEqual(['Moving']);
    expect(notified).toEqual([]);
  });

  it('refuses to move reports of a project without license access', async () => {
    const licenseService = getEEProjectLicenseService();
    if (!licenseService) return;
    const originalCheckAccess = licenseService.checkAccess;
    licenseService.checkAccess = () => Result.fail('Locked', 'PROJECT_NOT_LICENSED');
    try {
      const report = await createReport('Locked');
      const result = await reportsService.moveOnBoard(report.id, { status: 'closed' });
      expect(!result.success && result.code).toBe('PROJECT_NOT_LICENSED');
    } finally {
      licenseService.checkAccess = originalCheckAccess;
    }
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

describe('moving several reports', () => {
  it('places them as one block in the given order and records each status change', async () => {
    const third = await createReport('Third', 'resolved');
    await createReport('Stays open');
    const first = await createReport('First');
    const lower = await createReport('Lower', 'in_progress');
    const upper = await createReport('Upper', 'in_progress');

    const result = await reportsService.moveManyOnBoard([first.id, third.id], {
      status: 'in_progress',
      previousId: upper.id,
      nextId: lower.id,
    });

    expect(result.success && result.value.map((report) => report.status)).toEqual([
      'in_progress',
      'in_progress',
    ]);
    expect(await column('in_progress')).toEqual(['Upper', 'First', 'Third', 'Lower']);
    expect(await column('open')).toEqual(['Stays open']);
    expect(await column('resolved')).toEqual([]);
    const history = await reportHistoryRepo.findByReportId(third.id);
    expect(history.map((entry) => [entry.oldValue, entry.newValue])).toEqual([
      ['resolved', 'in_progress'],
    ]);
  });

  it('keeps reordering within a column as a block', async () => {
    const d = await createReport('D');
    const c = await createReport('C');
    const b = await createReport('B');
    await createReport('A');

    await reportsService.moveManyOnBoard([b.id, c.id], { status: 'open', previousId: d.id });

    expect(await column('open')).toEqual(['A', 'D', 'B', 'C']);
  });

  it('rejects duplicates, moved reports as neighbors, unknown reports, and empty lists', async () => {
    const one = await createReport('One');
    const two = await createReport('Two');

    const duplicate = await reportsService.moveManyOnBoard([one.id, one.id], { status: 'closed' });
    const neighbor = await reportsService.moveManyOnBoard([one.id, two.id], {
      status: 'open',
      previousId: two.id,
    });
    const unknown = await reportsService.moveManyOnBoard([one.id, 'rpt_missing'], {
      status: 'closed',
    });
    const empty = await reportsService.moveManyOnBoard([], { status: 'closed' });

    expect(!duplicate.success && duplicate.code).toBe('INVALID_INPUT');
    expect(!neighbor.success && neighbor.code).toBe('INVALID_BOARD_POSITION');
    expect(!unknown.success && unknown.code).toBe('NOT_FOUND');
    expect(!empty.success && empty.code).toBe('INVALID_INPUT');
    expect(await column('open')).toEqual(['Two', 'One']);
  });

  it('moves none of them when one cannot be placed', async () => {
    const one = await createReport('One');
    const two = await createReport('Two');
    let placed = 0;
    reportsRepo.setBoardPosition = (id, position) => {
      placed += 1;
      if (placed === 2) throw new Error('disk full');
      originalReportsRepo.setBoardPosition(id, position);
    };

    await expect(
      reportsService.moveManyOnBoard([one.id, two.id], { status: 'closed' })
    ).rejects.toThrow('disk full');

    Object.assign(reportsRepo, originalReportsRepo);
    expect(await column('open')).toEqual(['Two', 'One']);
    expect(await column('closed')).toEqual([]);
    expect(await reportHistoryRepo.findByReportId(one.id)).toEqual([]);
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

describe('cursor paging', () => {
  async function allPages(
    sortBy: (typeof REPORT_SORT_KEYS)[number],
    sortOrder: 'asc' | 'desc'
  ): Promise<string[]> {
    const ids: string[] = [];
    let after: string | undefined;
    for (let guard = 0; guard < 50; guard += 1) {
      const page = await reportsRepo.find({
        projectId: project.id,
        sortBy,
        sortOrder,
        limit: 2,
        after,
      });
      ids.push(...page.data.map((report) => report.id));
      if (!page.nextCursor) break;
      after = page.nextCursor;
    }
    return ids;
  }

  it('walks every sort in the same order as a single page', async () => {
    const assignee = await usersRepo.create({
      email: `cursor-${crypto.randomUUID()}@example.com`,
      passwordHash: 'hash',
      name: 'alice',
      role: 'editor',
    });
    const priorities: ReportPriority[] = ['low', 'high', 'medium', 'low', 'highest'];
    for (const [index, priority] of priorities.entries()) {
      const report = await createReport(`Report ${index % 3}`, index % 2 ? 'closed' : 'open', {
        priority,
      });
      if (index % 2 === 0) await reportsRepo.update(report.id, { assignedTo: assignee.id });
    }
    getDb().run('UPDATE reports SET created_at = ? WHERE project_id = ?', [
      '2024-01-01T00:00:00.000Z',
      project.id,
    ]);

    for (const sortBy of REPORT_SORT_KEYS) {
      for (const sortOrder of ['asc', 'desc'] as const) {
        const single = await reportsRepo.find({ projectId: project.id, sortBy, sortOrder });
        expect({ sortBy, sortOrder, ids: await allPages(sortBy, sortOrder) }).toEqual({
          sortBy,
          sortOrder,
          ids: single.data.map((report) => report.id),
        });
      }
    }
  });

  it('neither repeats nor skips reports when earlier ones move between pages', async () => {
    for (const title of ['A', 'B', 'C', 'D', 'E']) await createReport(title);
    const first = await reportsRepo.find({
      projectId: project.id,
      sortBy: 'position',
      sortOrder: 'asc',
      limit: 2,
    });
    expect(first.data.map((report) => report.title)).toEqual(['E', 'D']);

    await reportsRepo.update(first.data[0].id, { status: 'closed' });
    const rest = await reportsRepo.find({
      projectId: project.id,
      sortBy: 'position',
      sortOrder: 'asc',
      status: ['open'],
      after: first.nextCursor ?? undefined,
    });

    expect(rest.data.map((report) => report.title)).toEqual(['C', 'B', 'A']);
    expect(rest.nextCursor).toBeNull();
  });

  it('rejects malformed cursors and cursors from another sort', async () => {
    for (const title of ['A', 'B']) await createReport(title);
    const page = await reportsService.list({
      projectId: project.id,
      sortBy: 'title',
      sortOrder: 'asc',
      limit: 1,
    });
    const cursor = page.success ? page.value.nextCursor : null;
    expect(cursor).toBeTruthy();

    const otherSort = await reportsService.list({
      projectId: project.id,
      sortBy: 'priority',
      sortOrder: 'asc',
      after: cursor ?? undefined,
    });
    const garbage = await reportsService.list({ projectId: project.id, after: 'not-a-cursor' });

    expect(!otherSort.success && otherSort.code).toBe('INVALID_CURSOR');
    expect(!garbage.success && garbage.code).toBe('INVALID_CURSOR');
  });
});

describe('search index trigger', () => {
  it('only reindexes a report when its title or description changes', async () => {
    const trigger = getDb()
      .query("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'reports_au'")
      .get() as { sql: string };
    expect(trigger.sql).toContain('AFTER UPDATE OF title, description ON reports');

    const report = await createReport('Searchable crash');
    await reportsRepo.update(report.id, { title: 'Renamed overflow' });
    reportsRepo.setBoardPosition(report.id, 42);

    const found = await reportsRepo.find({ projectId: project.id, search: 'overflow' });
    const stale = await reportsRepo.find({ projectId: project.id, search: 'crash' });
    expect(found.data.map((item) => item.id)).toEqual([report.id]);
    expect(stale.data).toEqual([]);
  });
});
