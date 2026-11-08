import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { config } from '../../src/server/config';
import {
  initDatabase,
  initSchema,
  runMigrations,
  closeDatabase,
  getDb,
} from '../../src/server/database/database';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { dashboardService, median } from '../../src/server/services/dashboard.service';
import type { UserResolutionRow } from '../../src/server/database/repositories/gamification.repo';
import { userPreferencesService } from '../../src/server/services/user-preferences.service';
import { Result } from '../../src/server/utils/result';
import {
  buildProgress,
  gamificationService,
  levelFor,
  resolvedEarly,
  xpFor,
} from '../../src/server/services/gamification.service';
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_TARGETS,
  type AchievementId,
  type ReportHistoryAction,
  type ReportMetadata,
  type ReportPriority,
  type ReportStatus,
  type User,
  type UserRole,
} from '../../src/shared/types';

const originalConfig = { ...config };
let tempDir = '';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const metadata: ReportMetadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop', os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date(NOW).toISOString(),
};

let projectId = '';

async function createUser(name: string, role: UserRole): Promise<User> {
  return usersRepo.create({
    email: `${name.toLowerCase()}@example.com`,
    name,
    passwordHash: 'hash',
    role,
  });
}

interface ReportFixture {
  title?: string;
  priority?: ReportPriority;
  status?: ReportStatus;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  assignedTo?: string;
}

async function createReport(fixture: ReportFixture): Promise<string> {
  const report = await reportsRepo.create({
    projectId,
    title: fixture.title ?? 'Report',
    priority: fixture.priority ?? 'medium',
    metadata,
  });
  getDb().run(
    `UPDATE reports SET status = ?, created_at = ?, updated_at = ?, resolved_at = ?,
       resolved_by = ?, assigned_to = ? WHERE id = ?`,
    [
      fixture.status ?? 'open',
      fixture.createdAt,
      fixture.updatedAt ?? fixture.resolvedAt ?? fixture.createdAt,
      fixture.resolvedAt ?? null,
      fixture.resolvedBy ?? null,
      fixture.assignedTo ?? null,
      report.id,
    ]
  );
  return report.id;
}

function addHistory(
  reportId: string,
  userId: string | null,
  action: ReportHistoryAction,
  oldValue: string | null,
  newValue: string | null,
  createdAt: string
): void {
  getDb().run(
    `INSERT INTO report_history (id, report_id, user_id, action, old_value, new_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), reportId, userId, action, oldValue, newValue, createdAt]
  );
}

/** A report assigned to the user and resolved by them, with matching history */
async function resolveAfter(
  user: User,
  priority: ReportPriority,
  assignedAgo: number,
  hoursToResolve: number
): Promise<string> {
  const assignedAt = ago(assignedAgo);
  const resolvedAt = new Date(Date.parse(assignedAt) + hoursToResolve * HOUR).toISOString();
  const id = await createReport({
    priority,
    status: 'resolved',
    createdAt: ago(assignedAgo + HOUR),
    resolvedAt,
    resolvedBy: user.id,
    assignedTo: user.id,
  });
  addHistory(id, user.id, 'assignee_changed', null, user.id, assignedAt);
  addHistory(id, user.id, 'status_changed', 'open', 'resolved', resolvedAt);
  return id;
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-dashboard-'));
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
  await runMigrations();
});

afterAll(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
});

beforeEach(async () => {
  const db = getDb();
  db.exec('DELETE FROM report_history');
  db.exec('DELETE FROM reporter_messages');
  db.exec('DELETE FROM reports');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM projects');
  db.exec("DELETE FROM settings WHERE key LIKE 'gamification_%'");
  projectId = (await projectsRepo.create({ name: 'Shop' })).id;
});

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('levelFor', () => {
  it('maps XP to levels and stops at the top level', () => {
    expect(levelFor(0)).toEqual({ level: 1, levelStartXp: 0, nextLevelXp: 100 });
    expect(levelFor(260)).toEqual({ level: 3, levelStartXp: 250, nextLevelXp: 500 });
    expect(levelFor(9_999)).toEqual({ level: 9, levelStartXp: 6000, nextLevelXp: 10000 });
    expect(levelFor(99_999)).toEqual({ level: 10, levelStartXp: 10000, nextLevelXp: null });
  });
});

describe('buildProgress', () => {
  const now = Date.parse('2026-11-30T12:00:00.000Z');

  function resolution(
    overrides: Partial<UserResolutionRow> & Pick<UserResolutionRow, 'reportId'>
  ): UserResolutionRow {
    return {
      userId: 'u1',
      projectId: 'p1',
      priority: 'medium',
      createdAt: '2026-10-31T10:00:00.000Z',
      resolvedAt: '2026-11-01T10:00:00.000Z',
      assignedAt: null,
      firstAssignedAt: null,
      reopenedAt: null,
      ...overrides,
    };
  }

  it('adds XP by priority and dates each unlocked achievement', () => {
    const progress = buildProgress(
      [
        resolution({
          reportId: 'a',
          priority: 'highest',
          firstAssignedAt: '2026-11-01T08:00:00.000Z',
        }),
        resolution({
          reportId: 'b',
          projectId: 'p2',
          priority: 'low',
          resolvedAt: '2026-11-02T10:00:00.000Z',
        }),
      ],
      [],
      now
    );
    const byId = Object.fromEntries(progress.achievements.map((item) => [item.id, item]));

    expect(progress.xp).toBe(60);
    expect(byId.hatchling.unlockedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(byId.firefly.unlockedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(byId.cocoon).toMatchObject({ current: 2, target: 100, unlockedAt: undefined });
    expect(byId.butterfly).toMatchObject({ current: 2, target: 500, unlockedAt: undefined });
    expect(byId.web_weaver).toMatchObject({ current: 2, target: 5 });
    expect(progress.achievements.map((item) => item.id)).toEqual([
      'hatchling',
      'cocoon',
      'butterfly',
      'firefly',
      'dragonfly',
      'ladybug',
      'web_weaver',
      'amber',
    ]);
  });

  it('doubles the XP of reports resolved within 60 minutes and adds 5 XP per reporter message', () => {
    const early = resolution({
      reportId: 'early',
      priority: 'high',
      firstAssignedAt: '2026-11-01T09:10:00.000Z',
    });
    const late = resolution({
      reportId: 'late',
      priority: 'high',
      firstAssignedAt: '2026-11-01T08:59:00.000Z',
    });
    const neverAssigned = resolution({
      reportId: 'arrived',
      priority: 'low',
      createdAt: '2026-11-01T09:30:00.000Z',
    });

    expect(resolvedEarly(early)).toBe(true);
    expect(resolvedEarly(late)).toBe(false);
    expect(resolvedEarly(neverAssigned)).toBe(true);
    expect(xpFor([early, late, neverAssigned], 0)).toBe(60 + 30 + 20);
    expect(xpFor([], 3)).toBe(15);
    expect(buildProgress([late], [], now, 2).xp).toBe(40);
  });

  it('counts fixes that stayed fixed for 14 days, once the 14 days are over', () => {
    const progress = buildProgress(
      [
        resolution({ reportId: 'kept' }),
        resolution({ reportId: 'reopened', reopenedAt: '2026-11-05T10:00:00.000Z' }),
        resolution({ reportId: 'reopened-late', reopenedAt: '2026-11-20T10:00:00.000Z' }),
        resolution({ reportId: 'too-recent', resolvedAt: '2026-11-25T10:00:00.000Z' }),
      ],
      [],
      now
    );
    expect(progress.achievements.find((item) => item.id === 'ladybug')).toMatchObject({
      current: 2,
      target: 25,
    });
  });

  it('unlocks the cold case for a report that waited more than 90 days', () => {
    const progress = buildProgress(
      [
        resolution({ reportId: 'recent' }),
        resolution({
          reportId: 'old',
          createdAt: '2026-07-01T10:00:00.000Z',
          resolvedAt: '2026-11-03T10:00:00.000Z',
        }),
      ],
      [],
      now
    );
    expect(progress.achievements.find((item) => item.id === 'amber')).toMatchObject({
      current: 1,
      unlockedAt: '2026-11-03T10:00:00.000Z',
    });
  });
});

describe('dashboardService.getOverview', () => {
  it('counts KPIs, intake, backlog and reports that need attention', async () => {
    const editor = await createUser('Priya', 'editor');
    await createReport({ title: 'Checkout fails', priority: 'highest', createdAt: ago(2 * DAY) });
    await createReport({ title: 'Old typo', priority: 'low', createdAt: ago(40 * DAY) });
    await createReport({
      title: 'Fixed yesterday',
      status: 'resolved',
      createdAt: ago(20 * DAY),
      resolvedAt: ago(DAY),
      resolvedBy: editor.id,
    });
    const reopened = await createReport({
      title: 'Came back',
      priority: 'medium',
      createdAt: ago(10 * DAY),
      updatedAt: ago(HOUR),
      assignedTo: editor.id,
    });
    addHistory(reopened, editor.id, 'status_changed', 'resolved', 'open', ago(HOUR));

    const result = await dashboardService.getOverview(
      { projectId, range: 30, timeZone: 'UTC' },
      NOW
    );
    if (!result.success) throw new Error(result.error);
    const overview = result.value;

    expect(overview.kpis.backlog.value).toBe(3);
    // A week ago the new report did not exist yet and the resolved one was still open
    expect(overview.kpis.backlog.previous).toBe(3);
    expect(overview.kpis.created.value).toBe(1);
    expect(overview.kpis.resolved.value).toBe(1);
    expect(overview.kpis.resolveHours.value).toBe(19 * 24);
    expect(overview.kpis.backlog.series).toHaveLength(14);
    expect(overview.intake).toHaveLength(30);
    expect(overview.intake.at(-1)?.date).toBe('2026-11-06');
    expect(overview.intake.find((day) => day.date === '2026-11-05')?.resolved).toBe(1);
    expect(overview.backlogByPriority).toEqual({
      highest: 1,
      high: 0,
      medium: 1,
      low: 1,
      lowest: 0,
    });
    expect(overview.needsAttentionTotal).toBe(3);
    expect(overview.needsAttention.map((item) => [item.title, item.reason])).toEqual([
      ['Checkout fails', 'unassigned'],
      ['Came back', 'reopened'],
      ['Old typo', 'stale'],
    ]);
    expect(overview.activity[0]).toMatchObject({ reportTitle: 'Came back', userName: 'Priya' });
  });

  it('counts every report needing attention, beyond the ten it lists', async () => {
    for (let index = 0; index < 13; index++) {
      await createReport({ title: `Urgent ${index}`, priority: 'high', createdAt: ago(DAY) });
    }
    const result = await dashboardService.getOverview({ projectId, range: 30 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.needsAttention).toHaveLength(10);
    expect(result.value.needsAttentionTotal).toBe(13);
  });

  it('only counts the selected project', async () => {
    const other = await projectsRepo.create({ name: 'Blog' });
    await createReport({ createdAt: ago(DAY) });
    const result = await dashboardService.getOverview({ projectId: other.id, range: 7 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.kpis.backlog.value).toBe(0);
    expect(result.value.kpis.created.value).toBe(0);
  });
});

describe('dashboardService.getPersonal', () => {
  it('measures time to resolve from assignment and compares with the team', async () => {
    const me = await createUser('Alex', 'admin');
    const teammate = await createUser('Sam', 'editor');
    const third = await createUser('Kim', 'editor');
    await resolveAfter(me, 'highest', 3 * DAY, 2);
    await resolveAfter(me, 'medium', 5 * DAY, 10);
    await resolveAfter(teammate, 'medium', 4 * DAY, 30);
    await resolveAfter(third, 'medium', 4 * DAY, 20);
    await createReport({ createdAt: ago(9 * DAY), assignedTo: me.id });

    const result = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!result.success) throw new Error(result.error);
    const personal = result.value;

    expect(personal.assignedOpen).toBe(1);
    expect(personal.resolvedThisMonth).toBe(2);
    expect(personal.resolveTime.medianHours).toBe(6);
    expect(personal.resolveTime.teamMedianHours).toBe(15);
    expect(personal.resolveTime.bestHours).toBe(2);
    expect(personal.resolveTime.resolvedLast30Days).toBe(2);
    expect(personal.resolveTime.weekly).toHaveLength(12);
    expect(personal.resolveTime.byPriority.find((row) => row.priority === 'medium')).toEqual({
      priority: 'medium',
      mine: 10,
      team: 20,
    });
    expect(personal.gamification).toBeNull();
    expect(personal.resolveXp).toEqual({});
  });

  it('returns progress only when the workspace and the user both have it on', async () => {
    const me = await createUser('Alex', 'admin');
    const viewer = await createUser('Mia', 'viewer');
    await resolveAfter(me, 'highest', 3 * DAY, 2);

    const reportId = await createReport({ createdAt: ago(DAY) });
    getDb().run(
      'INSERT INTO reporter_messages (id, report_id, user_id, message) VALUES (?, ?, ?, ?)',
      [randomUUID(), reportId, me.id, 'Thanks, fixed in the next release']
    );

    await gamificationService.update({ enabled: true });
    const on = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!on.success) throw new Error(on.error);
    expect(on.value.gamification?.xp).toBe(55);
    expect(
      on.value.gamification?.achievements.find((item) => item.id === 'firefly')?.unlockedAt
    ).toBeDefined();

    const asViewer = await dashboardService.getPersonal(viewer, 'UTC', NOW);
    if (!asViewer.success) throw new Error(asViewer.error);
    expect(asViewer.value.gamification).toBeNull();

    await gamificationService.update({ users: { [me.id]: false } });
    const optedOut = await usersRepo.findById(me.id);
    if (!optedOut) throw new Error('missing user');
    const off = await dashboardService.getPersonal(optedOut, 'UTC', NOW);
    if (!off.success) throw new Error(off.error);
    expect(off.value.gamification).toBeNull();
  });
});

describe('history from before gamification', () => {
  it('counts all past work as soon as gamification is turned on', async () => {
    const me = await createUser('Alex', 'admin');
    await resolveAfter(me, 'high', 40 * DAY, 3);
    await createReport({
      priority: 'medium',
      status: 'resolved',
      createdAt: ago(400 * DAY),
      resolvedAt: ago(300 * DAY),
      resolvedBy: me.id,
    });
    const messaged = await createReport({ createdAt: ago(200 * DAY) });
    getDb().run(
      'INSERT INTO reporter_messages (id, report_id, user_id, message, sent_at) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), messaged, me.id, 'Old message', ago(200 * DAY)]
    );

    const before = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!before.success) throw new Error(before.error);
    expect(before.value.gamification).toBeNull();

    await gamificationService.update({ enabled: true });
    const after = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!after.success) throw new Error(after.error);
    const game = after.value.gamification;

    // 30 for the high report, 20 for the report resolved before history existed, 5 for the message
    expect(game?.xp).toBe(55);
    expect(game?.achievements.find((item) => item.id === 'hatchling')?.unlockedAt).toBe(
      ago(300 * DAY)
    );
    // Waited 100 days before it was resolved
    expect(game?.achievements.find((item) => item.id === 'amber')?.current).toBe(1);
  });
});

describe('gamificationService.getTeam', () => {
  it('ranks people by XP in the chosen period and hides anyone who does not take part', async () => {
    const alex = await createUser('Alex', 'admin');
    const sam = await createUser('Sam', 'editor');
    const jordan = await createUser('Jordan', 'editor');
    await createUser('Mia', 'viewer');
    await resolveAfter(alex, 'highest', 200 * DAY, 3);
    await resolveAfter(alex, 'highest', 190 * DAY, 3);
    await resolveAfter(alex, 'highest', 20 * DAY, 3);
    await resolveAfter(alex, 'highest', 15 * DAY, 3);
    await resolveAfter(sam, 'highest', 60 * DAY, 3);
    await resolveAfter(sam, 'highest', 61 * DAY, 3);
    await resolveAfter(sam, 'highest', 62 * DAY, 3);
    await resolveAfter(sam, 'medium', 2 * DAY, 3);
    await resolveAfter(jordan, 'high', 2 * DAY, 3);
    await gamificationService.update({ enabled: true });
    const jordanUser = await usersRepo.findById(jordan.id);
    if (!jordanUser) throw new Error('missing user');
    await gamificationService.setOptOut(jordanUser, true);

    const rank = async (period: '30d' | '90d' | 'all') => {
      const result = await gamificationService.getTeam(alex, period, NOW);
      if (!result.success) throw new Error(result.error);
      expect(result.value.ranking).toBe(true);
      expect(result.value.period).toBe(period);
      return result.value.members.map((member) => [member.name, member.periodXp, member.xp]);
    };
    expect(await rank('30d')).toEqual([
      ['Alex', 100, 200],
      ['Sam', 20, 170],
    ]);
    expect(await rank('90d')).toEqual([
      ['Sam', 170, 170],
      ['Alex', 100, 200],
    ]);
    expect(await rank('all')).toEqual([
      ['Alex', 200, 200],
      ['Sam', 170, 170],
    ]);

    await gamificationService.update({ showRanking: false });
    const listed = await gamificationService.getTeam(sam, '90d', NOW);
    if (!listed.success) throw new Error(listed.error);
    expect(listed.value.ranking).toBe(false);
    expect(listed.value.members.map((member) => member.name)).toEqual(['Alex', 'Sam']);
  });

  it('refuses people who do not take part themselves', async () => {
    const viewer = await createUser('Mia', 'viewer');
    await gamificationService.update({ enabled: true });
    const result = await gamificationService.getTeam(viewer, '30d', NOW);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('FORBIDDEN');
  });
});

describe('gamificationService', () => {
  it('stores the workspace switch and per-user switches', async () => {
    const alex = await createUser('Alex', 'admin');
    const jordan = await createUser('Jordan', 'editor');

    const initial = await gamificationService.getSettings();
    if (!initial.success) throw new Error(initial.error);
    expect(initial.value.enabled).toBe(false);
    expect(initial.value.users.every((user) => user.enabled)).toBe(true);

    const updated = await gamificationService.update({
      enabled: true,
      users: { [jordan.id]: false },
    });
    if (!updated.success) throw new Error(updated.error);
    expect(updated.value.enabled).toBe(true);
    expect(updated.value.users.map((user) => [user.name, user.enabled])).toEqual([
      ['Alex', true],
      ['Jordan', false],
    ]);
    expect(alex.gamificationEnabled).toBe(true);
  });

  it('starts with users allowed to opt out and new users turned on', async () => {
    const result = await gamificationService.getSettings();
    if (!result.success) throw new Error(result.error);
    expect(result.value).toMatchObject({ newUsersDefault: true, allowOptOut: true });
  });

  it('lets users opt out only while the workspace allows it', async () => {
    await createUser('Alex', 'admin');
    await gamificationService.update({ enabled: true });
    const alex = await usersRepo.findByEmail('alex@example.com');
    if (!alex) throw new Error('missing user');

    const optedOut = await gamificationService.setOptOut(alex, true);
    expect(optedOut.success && optedOut.value).toEqual({
      available: true,
      canOptOut: true,
      optedOut: true,
      active: false,
    });
    const reloaded = await usersRepo.findById(alex.id);
    if (!reloaded) throw new Error('missing user');
    expect(await gamificationService.isActiveFor(reloaded)).toEqual(Result.ok(false));
    const settings = await gamificationService.getSettings();
    if (!settings.success) throw new Error(settings.error);
    expect(settings.value.users.find((user) => user.id === alex.id)?.optedOut).toBe(true);
    const preferences = await userPreferencesService.get(alex.id);
    expect(preferences.success && preferences.value.gamificationOptedOut).toBe(true);

    await gamificationService.update({ allowOptOut: false });
    expect(await gamificationService.isActiveFor(reloaded)).toEqual(Result.ok(true));
    const refused = await gamificationService.setOptOut(reloaded, false);
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.code).toBe('FORBIDDEN');
  });

  it('never lets viewers or turned-off users change their own switch', async () => {
    const viewer = await createUser('Mia', 'viewer');
    await gamificationService.update({ enabled: true });
    const result = await gamificationService.setOptOut(viewer, true);
    expect(result.success).toBe(false);
  });

  it('applies the new-user default only when it is off', async () => {
    const first = await createUser('Alex', 'admin');
    await gamificationService.applyNewUserDefault(first.id);
    expect((await usersRepo.findById(first.id))?.gamificationEnabled).toBe(true);

    await gamificationService.update({ newUsersDefault: false });
    const second = await createUser('Jordan', 'editor');
    await gamificationService.applyNewUserDefault(second.id);
    expect((await usersRepo.findById(second.id))?.gamificationEnabled).toBe(false);
  });

  it('rejects unknown users', async () => {
    const result = await gamificationService.update({ users: { nobody: true } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('NOT_FOUND');
  });
});

describe('levelFor boundaries', () => {
  it('reaches a level at exactly its XP and not one point before', () => {
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(249).level).toBe(2);
    expect(levelFor(250).level).toBe(3);
    expect(levelFor(9_999).level).toBe(9);
    expect(levelFor(10_000)).toEqual({ level: 10, levelStartXp: 10000, nextLevelXp: null });
  });
});

describe('early resolve clock', () => {
  const base = {
    createdAt: '2026-10-01T00:00:00.000Z',
    resolvedAt: '2026-11-01T10:00:00.000Z',
  };

  it('counts from the first assignment, so handing a report back and forth does not restart it', () => {
    expect(resolvedEarly({ ...base, firstAssignedAt: '2026-11-01T09:00:00.000Z' })).toBe(true);
    expect(resolvedEarly({ ...base, firstAssignedAt: '2026-11-01T08:59:59.000Z' })).toBe(false);
    expect(resolvedEarly({ ...base, firstAssignedAt: '2026-10-20T10:00:00.000Z' })).toBe(false);
  });

  it('counts from arrival when the report was never assigned', () => {
    expect(resolvedEarly({ ...base, firstAssignedAt: null })).toBe(false);
    expect(
      resolvedEarly({
        createdAt: '2026-11-01T09:30:00.000Z',
        resolvedAt: '2026-11-01T10:00:00.000Z',
        firstAssignedAt: null,
      })
    ).toBe(true);
  });

  it('gives no double XP for self-assigning an old report that someone else got first', async () => {
    const me = await createUser('Alex', 'admin');
    const other = await createUser('Sam', 'editor');
    const id = await createReport({
      priority: 'highest',
      status: 'resolved',
      createdAt: ago(30 * DAY),
      resolvedAt: ago(DAY - 10 * 60_000),
      resolvedBy: me.id,
      assignedTo: me.id,
    });
    addHistory(id, other.id, 'assignee_changed', null, other.id, ago(20 * DAY));
    addHistory(id, me.id, 'assignee_changed', other.id, me.id, ago(DAY));
    addHistory(id, me.id, 'status_changed', 'open', 'resolved', ago(DAY - 10 * 60_000));
    await gamificationService.update({ enabled: true });

    const result = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.gamification?.xp).toBe(50);
    expect(
      result.value.gamification?.achievements.find((item) => item.id === 'firefly')?.unlockedAt
    ).toBeUndefined();
  });
});

describe('achievement rules', () => {
  const now = Date.parse('2026-12-31T12:00:00.000Z');
  let sequence = 0;

  function row(overrides: Partial<UserResolutionRow> = {}): UserResolutionRow {
    sequence++;
    const resolvedAt = new Date(Date.parse('2026-11-01T00:00:00.000Z') + sequence * HOUR);
    return {
      userId: 'u1',
      reportId: `r${sequence}`,
      projectId: 'p1',
      priority: 'medium',
      createdAt: new Date(resolvedAt.getTime() - 10 * HOUR).toISOString(),
      resolvedAt: resolvedAt.toISOString(),
      assignedAt: null,
      firstAssignedAt: null,
      reopenedAt: null,
      ...overrides,
    };
  }

  const times = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      new Date(Date.UTC(2026, 10, 1, index)).toISOString()
    );

  // Builds the least data that meets an achievement, given how many qualifying events there are
  const scenarios: Record<
    AchievementId,
    (count: number) => { rows: UserResolutionRow[]; triage: string[] }
  > = {
    hatchling: (count) => ({ rows: Array.from({ length: count }, () => row()), triage: [] }),
    cocoon: (count) => ({ rows: Array.from({ length: count }, () => row()), triage: [] }),
    butterfly: (count) => ({ rows: Array.from({ length: count }, () => row()), triage: [] }),
    firefly: (count) => ({
      rows: Array.from({ length: count }, () => {
        const fast = row({ priority: 'highest' });
        return {
          ...fast,
          firstAssignedAt: new Date(Date.parse(fast.resolvedAt) - 4 * HOUR).toISOString(),
        };
      }),
      triage: [],
    }),
    dragonfly: (count) => ({ rows: [], triage: times(count) }),
    ladybug: (count) => ({ rows: Array.from({ length: count }, () => row()), triage: [] }),
    web_weaver: (count) => ({
      rows: Array.from({ length: count }, (_, index) => row({ projectId: `p${index}` })),
      triage: [],
    }),
    amber: (count) => ({
      rows: Array.from({ length: count }, () => {
        const old = row();
        return { ...old, createdAt: new Date(Date.parse(old.resolvedAt) - 91 * DAY).toISOString() };
      }),
      triage: [],
    }),
  };

  for (const id of ACHIEVEMENT_IDS) {
    it(`unlocks ${id} at its target and not one short of it`, () => {
      const target = ACHIEVEMENT_TARGETS[id];
      const progressFor = (count: number) => {
        sequence = 0;
        const { rows, triage } = scenarios[id](count);
        return buildProgress(rows, triage, now).achievements.find((item) => item.id === id);
      };
      expect(progressFor(target)?.unlockedAt).toBeDefined();
      expect(progressFor(target - 1)).toMatchObject({ current: target - 1, unlockedAt: undefined });
    });
  }

  it('does not count a fast resolution of a non-highest report towards Firefly', () => {
    const fast = row({ priority: 'high' });
    const progress = buildProgress([{ ...fast, firstAssignedAt: fast.resolvedAt }], [], now);
    expect(progress.achievements.find((item) => item.id === 'firefly')?.current).toBe(0);
  });

  it('counts a triage at exactly the 60-minute limit towards Dragonfly', async () => {
    const me = await createUser('Alex', 'admin');
    const id = await createReport({ createdAt: '2026-11-01T10:00:00.000Z' });
    addHistory(id, me.id, 'priority_changed', 'medium', 'high', '2026-11-01T11:00:00.000Z');
    const late = await createReport({ createdAt: '2026-11-01T10:00:00.000Z' });
    addHistory(late, me.id, 'priority_changed', 'medium', 'high', '2026-11-01T11:00:01.000Z');
    await gamificationService.update({ enabled: true });

    const result = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!result.success) throw new Error(result.error);
    expect(
      result.value.gamification?.achievements.find((item) => item.id === 'dragonfly')?.current
    ).toBe(1);
  });
});

describe('resolving a report that is already resolved', () => {
  it('keeps who resolved it and when', async () => {
    const first = await createUser('Alex', 'admin');
    const second = await createUser('Sam', 'editor');
    const id = await createReport({ createdAt: ago(3 * DAY) });

    await reportsRepo.update(id, { status: 'resolved', resolvedBy: first.id });
    const resolved = await reportsRepo.findById(id);
    await reportsRepo.update(id, { status: 'resolved', resolvedBy: second.id });
    const again = await reportsRepo.findById(id);

    expect(again?.resolvedBy).toBe(first.id);
    expect(again?.resolvedAt).toBe(resolved?.resolvedAt);
  });

  it('keeps when a closed report was closed', async () => {
    const id = await createReport({ createdAt: ago(3 * DAY) });
    await reportsRepo.update(id, { status: 'closed' });
    const closed = await reportsRepo.findById(id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await reportsRepo.update(id, { status: 'closed' });
    expect((await reportsRepo.findById(id))?.closedAt).toBe(closed?.closedAt);
  });

  it('still records a new resolver after the report was reopened', async () => {
    const first = await createUser('Alex', 'admin');
    const second = await createUser('Sam', 'editor');
    const id = await createReport({ createdAt: ago(3 * DAY) });
    await reportsRepo.update(id, { status: 'resolved', resolvedBy: first.id });
    await reportsRepo.update(id, { status: 'open' });
    await reportsRepo.update(id, { status: 'resolved', resolvedBy: second.id });
    expect((await reportsRepo.findById(id))?.resolvedBy).toBe(second.id);
  });
});

describe('personal resolve time', () => {
  it('counts reports resolved without being assigned, timed from their arrival', async () => {
    const me = await createUser('Alex', 'admin');
    const id = await createReport({
      status: 'resolved',
      createdAt: ago(2 * DAY + 5 * HOUR),
      resolvedAt: ago(2 * DAY),
      resolvedBy: me.id,
    });
    addHistory(id, me.id, 'status_changed', 'open', 'resolved', ago(2 * DAY));

    const result = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.resolveTime.resolvedLast30Days).toBe(1);
    expect(result.value.resolveTime.medianHours).toBe(5);
  });

  it('hides team figures when fewer than three people resolved reports', async () => {
    const me = await createUser('Alex', 'admin');
    const teammate = await createUser('Sam', 'editor');
    await resolveAfter(me, 'medium', 3 * DAY, 4);
    await resolveAfter(teammate, 'medium', 3 * DAY, 30);

    const result = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.resolveTime.medianHours).toBe(4);
    expect(result.value.resolveTime.teamMedianHours).toBeNull();
    expect(result.value.resolveTime.weekly.every((week) => week.team === null)).toBe(true);
    expect(result.value.resolveTime.byPriority.every((row) => row.team === null)).toBe(true);
  });

  it('leaves people who opted out or were turned off out of the team figures', async () => {
    const me = await createUser('Alex', 'admin');
    const sam = await createUser('Sam', 'editor');
    const kim = await createUser('Kim', 'editor');
    const lee = await createUser('Lee', 'editor');
    await resolveAfter(me, 'medium', 3 * DAY, 2);
    await resolveAfter(sam, 'medium', 3 * DAY, 4);
    await resolveAfter(kim, 'medium', 3 * DAY, 6);
    await resolveAfter(lee, 'medium', 5 * DAY, 50);
    await gamificationService.update({ enabled: true });

    const all = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!all.success) throw new Error(all.error);
    expect(all.value.resolveTime.teamMedianHours).toBe(5);

    await gamificationService.setOptOut(lee, true);
    const withoutLee = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!withoutLee.success) throw new Error(withoutLee.error);
    expect(withoutLee.value.resolveTime.teamMedianHours).toBe(4);

    await gamificationService.update({ users: { [kim.id]: false } });
    const tooFew = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!tooFew.success) throw new Error(tooFew.error);
    expect(tooFew.value.resolveTime.teamMedianHours).toBeNull();
  });
});

describe('XP for resolving open reports', () => {
  it('shows base XP, double XP inside the early window, and none for a report resolved before', async () => {
    const me = await createUser('Alex', 'admin');
    await gamificationService.update({ enabled: true });
    const waiting = await createReport({
      priority: 'high',
      createdAt: ago(3 * DAY),
      assignedTo: me.id,
    });
    addHistory(waiting, me.id, 'assignee_changed', null, me.id, ago(2 * DAY));
    const fresh = await createReport({
      priority: 'high',
      createdAt: ago(30 * 60_000),
      assignedTo: me.id,
    });
    const again = await createReport({
      priority: 'high',
      createdAt: ago(10 * DAY),
      assignedTo: me.id,
    });
    addHistory(again, me.id, 'status_changed', 'open', 'resolved', ago(5 * DAY));
    addHistory(again, me.id, 'status_changed', 'resolved', 'open', ago(4 * DAY));

    const result = await dashboardService.getPersonal(me, 'UTC', NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.resolveXp).toEqual({ [waiting]: 30, [fresh]: 60, [again]: 0 });
  });
});

describe('overview edge cases', () => {
  it('lists the most urgent reports first even when older, lower ones fill the limit', async () => {
    for (let index = 0; index < 10; index++) {
      await createReport({
        title: `Stale ${index}`,
        priority: 'lowest',
        createdAt: ago(60 * DAY),
        updatedAt: ago((40 + index) * DAY),
      });
    }
    await createReport({
      title: 'Stale and urgent',
      priority: 'highest',
      createdAt: ago(60 * DAY),
      updatedAt: ago(20 * DAY),
      assignedTo: (await createUser('Alex', 'admin')).id,
    });

    const result = await dashboardService.getOverview({ projectId, range: 30 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.needsAttentionTotal).toBe(11);
    expect(result.value.needsAttention).toHaveLength(10);
    expect(result.value.needsAttention[0]?.title).toBe('Stale and urgent');
  });

  it('leaves out reports of deleted projects', async () => {
    await createReport({ createdAt: ago(DAY) });
    await projectsRepo.delete(projectId);

    const result = await dashboardService.getOverview({ range: 7 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.kpis.backlog.value).toBe(0);
    expect(result.value.kpis.created.value).toBe(0);
    expect(result.value.activity).toEqual([]);
  });

  it('sends assignees without their email address', async () => {
    const editor = await createUser('Priya', 'editor');
    await createReport({
      createdAt: ago(30 * DAY),
      updatedAt: ago(30 * DAY),
      assignedTo: editor.id,
    });
    const result = await dashboardService.getOverview({ projectId, range: 30 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.needsAttention[0]?.assignee).toEqual({
      id: editor.id,
      name: 'Priya',
      avatarUrl: undefined,
    });
  });

  it('tells widget activity apart from activity of deleted users', async () => {
    const editor = await createUser('Priya', 'editor');
    const widget = await createReport({ title: 'From widget', createdAt: ago(2 * DAY) });
    addHistory(widget, null, 'created', null, null, ago(2 * DAY));
    addHistory(widget, null, 'assignee_changed', null, editor.id, ago(2 * DAY - 1000));
    addHistory(widget, null, 'status_changed', 'open', 'resolved', ago(DAY));
    addHistory(widget, editor.id, 'priority_changed', 'medium', 'high', ago(HOUR));

    const result = await dashboardService.getOverview({ projectId, range: 7 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.activity.map((item) => [item.action, item.actor])).toEqual([
      ['priority_changed', 'user'],
      ['status_changed', 'deleted_user'],
      ['assignee_changed', 'widget'],
      ['created', 'widget'],
    ]);
  });
});

describe('time zones', () => {
  it('puts a report on the calendar day of the requested time zone', async () => {
    await createReport({ createdAt: '2026-11-05T23:30:00.000Z' });
    const dayOf = async (timeZone: string) => {
      const result = await dashboardService.getOverview({ projectId, range: 7, timeZone }, NOW);
      if (!result.success) throw new Error(result.error);
      return result.value.intake.filter((day) => day.created > 0).map((day) => day.date);
    };
    expect(await dayOf('UTC')).toEqual(['2026-11-05']);
    expect(await dayOf('Asia/Tokyo')).toEqual(['2026-11-06']);
    expect(await dayOf('America/Los_Angeles')).toEqual(['2026-11-05']);
  });

  it('keeps day boundaries right across a daylight saving change', async () => {
    // New York leaves daylight saving time on 2026-11-01
    await createReport({ createdAt: '2026-11-01T04:30:00.000Z' });
    await createReport({ createdAt: '2026-11-02T04:30:00.000Z' });
    const result = await dashboardService.getOverview(
      { projectId, range: 7, timeZone: 'America/New_York' },
      NOW
    );
    if (!result.success) throw new Error(result.error);
    expect(result.value.intake.find((day) => day.date === '2026-11-01')?.created).toBe(2);
  });

  it('falls back to UTC for an unknown time zone', async () => {
    await createReport({ createdAt: '2026-11-05T23:30:00.000Z' });
    const result = await dashboardService.getOverview(
      { projectId, range: 7, timeZone: 'Not/AZone' },
      NOW
    );
    if (!result.success) throw new Error(result.error);
    expect(result.value.intake.find((day) => day.date === '2026-11-05')?.created).toBe(1);
  });

  it('reports no change instead of a broken trend for a new workspace', async () => {
    await createReport({ createdAt: ago(DAY) });
    const result = await dashboardService.getOverview({ projectId, range: 7 }, NOW);
    if (!result.success) throw new Error(result.error);
    expect(result.value.kpis.created).toMatchObject({ value: 1, previous: 0 });
    expect(result.value.kpis.resolveHours).toMatchObject({ value: null, previous: null });
  });
});
