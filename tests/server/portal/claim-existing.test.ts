import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { settingsRoutes } from '../../../src/server/routes/api/settings';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { reporterOwnershipService } from '../../../src/server/services/reporter-ownership.service';
import { reporterPortalSettingsService } from '../../../src/server/services/reporter-portal-settings.service';
import { realtimeService } from '../../../src/server/services/realtime.service';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { getEEProjectLicenseService } from '../../../src/server/utils/ee';
import { Result } from '../../../src/server/utils/result';
import type { Project, UserRole } from '../../../src/shared/types';
import { openPortalDatabase, portalOrigin } from './helpers';
import { registerEEHooks, resetEEHooks } from '../../../src/server/utils/ee-hooks';
import { createDefaultHooks } from '../../../src/server/types/ee-plugin';

let close: () => void;
let cookies: Record<UserRole, string>;
const metadata = { timestamp: '2026-01-01T00:00:00.000Z' };

interface HistoryRow {
  report_id: string;
  user_id: string | null;
  action: string;
  new_value: string | null;
}

beforeEach(async () => {
  close = await openPortalDatabase();
  cookies = { admin: '', editor: '', viewer: '' };
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    getDb().run('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [
      role,
      `${role}@example.com`,
      role,
      'unused',
      role,
    ]);
    const session = await sessionsRepo.create({
      userId: role,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    cookies[role] = `session=${session.id}`;
  }
  await settingsRepo.updateAll({ reporterPortal: { enabled: true, allowNewReports: false } });
  settingsCacheService.invalidate();
  spyOn(realtimeService, 'publish').mockImplementation(() => undefined);
});
afterEach(() => {
  mock.restore();
  close();
});

function inheriting(): Promise<Project> {
  return projectsRepo.create({ name: `Project ${crypto.randomUUID()}`, settings: {} });
}

function report(projectId: string, reporterEmail: string | undefined) {
  return reportsRepo.create({ projectId, title: 'Report', metadata, reporterEmail });
}

function history(): HistoryRow[] {
  return getDb()
    .query<HistoryRow, []>(
      "SELECT report_id, user_id, action, new_value FROM report_history WHERE action = 'claimable_set' ORDER BY report_id"
    )
    .all();
}

async function waitForDeliveries(delivered: string[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 200 && delivered.length < count; attempt++) await Bun.sleep(5);
  expect(delivered).toHaveLength(count);
}

async function claimable(id: string): Promise<string | undefined> {
  return (await reportsRepo.findById(id))!.claimableEmail;
}

describe('claimExisting', () => {
  it('claims eligible reports with the normalized email and records history for the user', async () => {
    const project = await inheriting();
    const first = await report(project.id, '  Jane@Example.com ');
    const second = await report(project.id, 'bob@example.com');

    expect(reporterOwnershipService.countClaimable()).toBe(2);
    const result = reporterOwnershipService.claimExisting('admin');

    expect(Result.unwrap(result)).toBe(2);
    expect(await claimable(first.id)).toBe('jane@example.com');
    expect(await claimable(second.id)).toBe('bob@example.com');
    expect(
      history().map(({ report_id, user_id, new_value }) => ({ report_id, user_id, new_value }))
    ).toEqual(
      [
        { report_id: first.id, user_id: 'admin', new_value: 'jane@example.com' },
        { report_id: second.id, user_id: 'admin', new_value: 'bob@example.com' },
      ].sort((a, b) => a.report_id.localeCompare(b.report_id))
    );
  });

  it('skips reports that are owned or already claimable', async () => {
    const project = await inheriting();
    const owned = await report(project.id, 'owned@example.com');
    getDb().run(
      "INSERT INTO reporters (id, email, display_name) VALUES ('rep', 'r@example.com', 'R')"
    );
    reporterOwnershipRepo.setOwner(owned.id, 'rep', null);
    const claimed = await reportsRepo.create({
      projectId: project.id,
      title: 'Claimed',
      metadata,
      reporterEmail: 'claimed@example.com',
      claimableEmail: 'someone@example.com',
    });

    expect(reporterOwnershipService.countClaimable()).toBe(0);
    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(0);
    expect(await claimable(claimed.id)).toBe('someone@example.com');
    expect(history()).toEqual([]);
  });

  it('skips blank and invalid emails', async () => {
    const project = await inheriting();
    await report(project.id, undefined);
    await report(project.id, '   ');
    const invalid = await report(project.id, 'not-an-email');

    expect(reporterOwnershipService.countClaimable()).toBe(0);
    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(0);
    expect(await claimable(invalid.id)).toBeUndefined();
  });

  it('skips disabled and deleted projects and follows project overrides', async () => {
    const forcedOff = await projectsRepo.create({
      name: 'Off',
      settings: { reporterPortal: { enabled: false, allowNewReports: false } },
    });
    const forcedOn = await projectsRepo.create({
      name: 'On',
      settings: { reporterPortal: { enabled: true, allowNewReports: false } },
    });
    const deleted = await inheriting();
    const offReport = await report(forcedOff.id, 'a@example.com');
    const onReport = await report(forcedOn.id, 'b@example.com');
    const deletedReport = await report(deleted.id, 'c@example.com');
    await projectsRepo.delete(deleted.id);

    expect(reporterOwnershipService.countClaimable()).toBe(1);
    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(1);
    expect(await claimable(onReport.id)).toBe('b@example.com');
    expect(await claimable(offReport.id)).toBeUndefined();
    expect(await claimable(deletedReport.id)).toBeUndefined();
  });

  it('claims nothing when the default is off and projects inherit it', async () => {
    await settingsRepo.updateAll({ reporterPortal: { enabled: false, allowNewReports: false } });
    settingsCacheService.invalidate();
    const project = await inheriting();
    await report(project.id, 'jane@example.com');

    expect(reporterOwnershipService.countClaimable()).toBe(0);
    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(0);
  });

  it.each(['owner_assigned', 'owner_removed', 'claimable_set'])(
    'skips reports with prior %s history',
    async (action) => {
      const project = await inheriting();
      const touched = await report(project.id, 'jane@example.com');
      getDb().run(
        'INSERT INTO report_history (id, report_id, user_id, action) VALUES (?, ?, ?, ?)',
        [crypto.randomUUID(), touched.id, 'admin', action]
      );

      expect(reporterOwnershipService.countClaimable()).toBe(0);
      expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(0);
      expect(await claimable(touched.id)).toBeUndefined();
    }
  );

  it('still claims reports whose history holds only unrelated actions', async () => {
    const project = await inheriting();
    const target = await report(project.id, 'jane@example.com');
    getDb().run('INSERT INTO report_history (id, report_id, user_id, action) VALUES (?, ?, ?, ?)', [
      crypto.randomUUID(),
      target.id,
      'admin',
      'status_changed',
    ]);

    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(1);
  });

  it('skips projects that fail the license check', async () => {
    const unlicensed = await inheriting();
    const licensed = await inheriting();
    const blocked = await report(unlicensed.id, 'a@example.com');
    const allowed = await report(licensed.id, 'b@example.com');
    spyOn(getEEProjectLicenseService()!, 'checkAccess').mockImplementation((projectId: string) =>
      projectId === unlicensed.id
        ? Result.fail('Project is read-only', 'PROJECT_NOT_LICENSED')
        : Result.ok(undefined)
    );

    expect(reporterOwnershipService.countClaimable()).toBe(1);
    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(1);
    expect(await claimable(blocked.id)).toBeUndefined();
    expect(await claimable(allowed.id)).toBe('b@example.com');
  });

  it('is idempotent', async () => {
    const project = await inheriting();
    await report(project.id, 'jane@example.com');

    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(1);
    expect(Result.unwrap(reporterOwnershipService.claimExisting('admin'))).toBe(0);
    expect(reporterOwnershipService.countClaimable()).toBe(0);
    expect(history()).toHaveLength(1);
  });

  it('refreshes staff views once per project and sends owner webhooks one at a time', async () => {
    const first = await inheriting();
    const second = await inheriting();
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com'])
      await report(first.id, email);
    await report(second.id, 'd@example.com');
    const publish = spyOn(realtimeService, 'publish').mockImplementation(() => undefined);
    let running = 0;
    let maxRunning = 0;
    const delivered: string[] = [];
    registerEEHooks({
      ...createDefaultHooks(),
      onReportOwnerChanged: async (event) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await Bun.sleep(1);
        delivered.push(event.reportId);
        running--;
      },
    });
    try {
      expect(reporterOwnershipService.claimExisting('admin')).toEqual(Result.ok(4));
      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish.mock.calls.map(([, data]) => data.projectId)).toEqual(
        expect.arrayContaining([first.id, second.id])
      );
      await waitForDeliveries(delivered, 4);
      expect(maxRunning).toBe(1);
    } finally {
      resetEEHooks();
    }
  });
});

describe('reporter portal settings routes', () => {
  function request(role: UserRole, path: string, method: 'GET' | 'POST') {
    const app = new Hono();
    app.route('/api/settings', settingsRoutes);
    return app.request(`${portalOrigin}/api/settings${path}`, {
      method,
      headers: { Cookie: cookies[role], Origin: portalOrigin },
    });
  }

  it('returns prerequisites and the claimable count to admins', async () => {
    const project = await inheriting();
    await report(project.id, 'jane@example.com');

    const response = await request('admin', '/reporter-portal', 'GET');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      prerequisites: [],
      claimableReports: 1,
    });
  });

  it('lists the missing prerequisites', async () => {
    await settingsRepo.updateAll({ smtpEnabled: false });
    settingsCacheService.invalidate();

    const response = await request('admin', '/reporter-portal', 'GET');

    expect(((await response.json()) as { prerequisites: string[] }).prerequisites).toEqual([
      'smtp',
    ]);
  });

  it('claims existing reports for the acting admin', async () => {
    const project = await inheriting();
    const target = await report(project.id, 'jane@example.com');

    const response = await request('admin', '/reporter-portal/claim-existing', 'POST');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, count: 1 });
    expect(await claimable(target.id)).toBe('jane@example.com');
    expect(history()[0]?.user_id).toBe('admin');
    const second = await request('admin', '/reporter-portal/claim-existing', 'POST');
    expect(await second.json()).toEqual({ success: true, count: 0 });
  });

  it.each(['editor', 'viewer'] as const)('rejects the %s role with 403', async (role) => {
    const project = await inheriting();
    const target = await report(project.id, 'jane@example.com');

    expect((await request(role, '/reporter-portal', 'GET')).status).toBe(403);
    expect((await request(role, '/reporter-portal/claim-existing', 'POST')).status).toBe(403);
    expect(await claimable(target.id)).toBeUndefined();
  });

  it('rejects unauthenticated requests', async () => {
    const app = new Hono();
    app.route('/api/settings', settingsRoutes);
    const response = await app.request(`${portalOrigin}/api/settings/reporter-portal`);
    expect(response.status).toBe(401);
  });
});

it('overview counts the same reports that claiming would change', async () => {
  const project = await inheriting();
  await report(project.id, 'jane@example.com');
  await report(project.id, 'broken');

  const overview = Result.unwrap(await reporterPortalSettingsService.overview());

  expect(overview.claimableReports).toBe(1);
});
