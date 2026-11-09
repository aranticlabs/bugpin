import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';
import { reportOwnerRoutes } from '../../../src/server/routes/api/report-owner';
import { reportersRoutes } from '../../../src/server/routes/api/reporters';
import { projectsRoutes } from '../../../src/server/routes/api/projects';
import { reportsRoutes } from '../../../src/server/routes/api/reports';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { reportersRepo } from '../../../src/server/database/repositories/reporters.repo';
import { reporterAuthTokensRepo } from '../../../src/server/database/repositories/reporter-auth-tokens.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { reporterOwnershipService } from '../../../src/server/services/reporter-ownership.service';
import { reportersService } from '../../../src/server/services/reporters.service';
import { reportsService } from '../../../src/server/services/reports.service';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { githubSyncService } from '../../../src/server/services/integrations/github-sync.service';
import { emailService } from '../../../src/server/services/email.service';
import { registerEEHooks, resetEEHooks } from '../../../src/server/utils/ee-hooks';
import { createDefaultHooks } from '../../../src/server/types/ee-plugin';
import { getEEProjectLicenseService } from '../../../src/server/utils/ee';
import { hashToken } from '../../../src/server/utils/secure-token';
import { config } from '../../../src/server/config';
import { Result } from '../../../src/server/utils/result';
import type { Project, UserRole } from '../../../src/shared/types';
import type { ReportOwner } from '../../../src/shared/reporter-types';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let project: Project;
let cookies: Record<UserRole, string>;
const metadata = { timestamp: '2026-01-01T00:00:00.000Z' };

beforeEach(async () => {
  close = await openPortalDatabase();
  app = createPortalTestApp();
  app.route('/api/reports', reportsRoutes);
  app.route('/api/reports', reportOwnerRoutes);
  app.route('/api/reporters', reportersRoutes);
  app.route('/api/projects', projectsRoutes);
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
  project = await projectsRepo.create({
    name: 'Portal project',
    settings: { reporterPortal: { enabled: true, allowNewFeedback: false } },
  });
  spyOn(emailService, 'sendEmail').mockResolvedValue({ success: true });
  spyOn(notificationsService, 'notifyNewReport').mockResolvedValue(undefined);
  spyOn(notificationsService, 'notifyReporterSubmission').mockResolvedValue(undefined);
  spyOn(githubSyncService, 'getAutoSyncIntegration').mockResolvedValue(null);
});
afterEach(() => {
  mock.restore();
  resetEEHooks();
  close();
});

function login(email = `${crypto.randomUUID()}@example.com`) {
  return Result.unwrap(
    reporterAuthService.exchange(
      Result.unwrap(reporterAuthService.mintLoginToken(email, 'request')).secret
    )
  );
}

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  role: UserRole = 'admin'
): Promise<Response> {
  const settings = await settingsCacheService.getAll();
  return app.request(`${portalOrigin}${path}`, {
    method,
    headers: {
      Cookie: cookies[role],
      Origin: settings.appUrl ? new URL(settings.appUrl).origin : portalOrigin,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function report(claimableEmail?: string) {
  return reportsRepo.create({
    projectId: project.id,
    title: 'Report title',
    description: 'Original text',
    reporterEmail: 'contact@example.com',
    reporterName: 'Contact',
    metadata,
    claimableEmail,
  });
}

it('assigns, makes claimable, and removes ownership atomically with history and fresh unread state', async () => {
  const target = login();
  const first = await report();
  getDb().run('UPDATE reports SET owner_seen_at = ?, updated_at = ? WHERE id = ?', [
    '2026-01-01',
    '2026-01-01',
    first.id,
  ]);
  const assigned = await request(
    `/api/reports/${first.id}/owner`,
    'PUT',
    { reporterId: target.reporter.id },
    'editor'
  );
  expect(assigned.status).toBe(200);
  const owner = (await assigned.json()) as { owner: ReportOwner };
  expect(owner.owner.correspondentEmail).toBe(target.reporter.email);
  expect(owner.owner.reporter?.displayName).toBe(target.reporter.displayName);
  const detail = await request(`/api/reports/${first.id}`);
  expect(
    ((await detail.json()) as { report: { owner: ReportOwner } }).report.owner.reporterId
  ).toBe(target.reporter.id);
  expect((await reportsRepo.findById(first.id))!.ownerSeenAt).toBeUndefined();
  expect((await reportsRepo.findById(first.id))!.updatedAt).toBe('2026-01-01');
  expect(
    (
      await request(`/api/reports/${first.id}/owner`, 'PUT', {
        claimableEmail: ' BOB@Example.COM ',
      })
    ).status
  ).toBe(200);
  expect((await reportsRepo.findById(first.id))!.claimableEmail).toBe('bob@example.com');
  expect((await request(`/api/reports/${first.id}/owner`, 'DELETE')).status).toBe(200);
  expect((await reportsRepo.findById(first.id))!.reporterId).toBeUndefined();
  expect((await reportsRepo.findById(first.id))!.claimableEmail).toBeUndefined();
  expect(login('bob@example.com').attachedReportCount).toBe(0);
  expect(
    getDb()
      .query('SELECT action, user_id FROM report_history WHERE report_id = ? ORDER BY rowid')
      .all(first.id)
  ).toEqual([
    { action: 'owner_assigned', user_id: 'editor' },
    { action: 'claimable_set', user_id: 'admin' },
    { action: 'owner_removed', user_id: 'admin' },
  ]);
});

it('rejects mixed owner inputs and missing reporters, and rolls back ownership when history fails', async () => {
  const target = login();
  const first = await report();
  expect(
    (
      await request(`/api/reports/${first.id}/owner`, 'PUT', {
        reporterId: target.reporter.id,
        claimableEmail: 'bob@example.com',
      })
    ).status
  ).toBe(400);
  expect(
    (await request(`/api/reports/${first.id}/owner`, 'PUT', { reporterId: 'missing' })).status
  ).toBe(404);
  getDb().exec(
    "CREATE TRIGGER refuse_owner_history BEFORE INSERT ON report_history BEGIN SELECT RAISE(ABORT, 'refused'); END;"
  );
  expect(() =>
    reporterOwnershipService.set(first.id, { reporterId: target.reporter.id }, 'admin')
  ).toThrow('refused');
  expect((await reportsRepo.findById(first.id))!.reporterId).toBeUndefined();
});

it('returns a client error without changing ownership when the project license denies mutations', async () => {
  const target = login();
  const first = await report();
  Result.unwrap(
    reporterOwnershipService.set(first.id, { reporterId: target.reporter.id }, 'admin')
  );
  spyOn(getEEProjectLicenseService()!, 'checkAccess').mockReturnValue(
    Result.fail('Project is read-only', 'PROJECT_NOT_LICENSED')
  );
  for (const [method, body] of [
    ['PUT', { reporterId: target.reporter.id }],
    ['PUT', { claimableEmail: 'other@example.com' }],
    ['DELETE', undefined],
  ] as const) {
    const response = await request(`/api/reports/${first.id}/owner`, method, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'PROJECT_NOT_LICENSED',
    });
  }
  expect((await reportsRepo.findById(first.id))!.reporterId).toBe(target.reporter.id);
  expect(getDb().query('SELECT COUNT(*) AS count FROM report_history').get()).toEqual({ count: 1 });
});

it('does not reattach a removed owner on a later verified login', async () => {
  const first = Result.unwrap(
    await reportsService.create({
      apiKey: project.apiKey,
      title: 'Widget report',
      reporterEmail: 'jane@example.com',
      metadata,
    })
  );
  const original = login('jane@example.com');
  expect(original.attachedReportCount).toBe(1);
  expect((await request(`/api/reports/${first.id}/owner`, 'DELETE')).status).toBe(200);
  expect(login('jane@example.com').attachedReportCount).toBe(0);
  expect(reporterOwnershipRepo.canAccess(first.id, original.reporter.id)).toBe(false);
  const replacement = login('bob@example.com');
  expect(
    (
      await request(`/api/reports/${first.id}/owner`, 'PUT', {
        reporterId: replacement.reporter.id,
      })
    ).status
  ).toBe(200);
  expect(reporterOwnershipRepo.canAccess(first.id, original.reporter.id)).toBe(false);
  expect(reporterOwnershipRepo.canAccess(first.id, replacement.reporter.id)).toBe(true);
});

for (const action of ['suspend', 'revoke-sessions'] as const) {
  it(`${action} invalidates every session and outstanding token; unsuspension permits fresh login only`, async () => {
    const target = login();
    const second = login(target.reporter.email);
    const outstanding = Result.unwrap(
      reporterAuthService.mintLoginToken(target.reporter.email, 'confirmation')
    );
    const response = await request(`/api/reporters/${target.reporter.id}/${action}`, 'POST');
    expect(response.status).toBe(200);
    for (const secret of [target.sessionSecret, second.sessionSecret])
      expect(reporterAuthService.validateSession(secret).success).toBe(false);
    expect(reporterAuthService.exchange(outstanding.secret).success).toBe(false);
    expect(
      reporterAuthTokensRepo.findByHash(hashToken(outstanding.secret))!.revokedAt
    ).not.toBeNull();
    const record = reportersRepo.findById(target.reporter.id)!;
    expect(record.sessionsRevokedByUserId).toBe('admin');
    if (action === 'suspend') {
      expect(record.suspendedByUserId).toBe('admin');
      expect((await request(`/api/reporters/${target.reporter.id}/unsuspend`, 'POST')).status).toBe(
        200
      );
    }
    expect(login(target.reporter.email).reporter.id).toBe(target.reporter.id);
    expect(reporterAuthService.exchange(outstanding.secret).success).toBe(false);
  });
}

for (const eraseContactDetails of [false, true]) {
  it(`deletes accounts without reclaiming owned or unattached reports, contact erasure ${eraseContactDetails}`, async () => {
    const target = login('jane@example.com');
    const owned = await report();
    Result.unwrap(
      reporterOwnershipService.set(owned.id, { reporterId: target.reporter.id }, 'admin')
    );
    const unattached = await report('jane@example.com');
    const outstanding = Result.unwrap(
      reporterAuthService.mintLoginToken('jane@example.com', 'invitation')
    );
    getDb().run(
      "INSERT INTO reporter_email_suppressions (email, source) VALUES ('jane@example.com', 'unsubscribe')"
    );
    expect(
      (await request(`/api/reporters/${target.reporter.id}`, 'DELETE', { eraseContactDetails }))
        .status
    ).toBe(200);
    expect(reportersRepo.findById(target.reporter.id)).toBeNull();
    expect(reporterAuthService.validateSession(target.sessionSecret).success).toBe(false);
    expect(reporterAuthService.exchange(outstanding.secret).success).toBe(false);
    const former = (await reportsRepo.findById(owned.id))!;
    expect(former.reporterId).toBeUndefined();
    expect(former.claimableEmail).toBeUndefined();
    expect(former.reporterEmail).toBe(eraseContactDetails ? undefined : 'contact@example.com');
    expect(former.reporterName).toBe(eraseContactDetails ? undefined : 'Contact');
    const other = (await reportsRepo.findById(unattached.id))!;
    expect(other.claimableEmail).toBeUndefined();
    expect(other.reporterEmail).toBe('contact@example.com');
    expect(login('jane@example.com').attachedReportCount).toBe(0);
    const submitted = Result.unwrap(
      await reportsService.create({
        apiKey: project.apiKey,
        title: 'New widget report',
        reporterEmail: 'jane@example.com',
        metadata,
      })
    );
    expect(submitted.claimableEmail).toBe('jane@example.com');
    expect(login('jane@example.com').attachedReportCount).toBe(1);
    expect(
      getDb()
        .query("SELECT source FROM reporter_email_suppressions WHERE email = 'jane@example.com'")
        .get()
    ).toEqual({ source: 'unsubscribe' });
  });
}

it('anonymizes reporter messages and leaves other authors and content intact', async () => {
  const target = login();
  const other = login();
  const first = await report();
  getDb().run(
    "INSERT INTO report_messages (id, report_id, author_kind, reporter_id, user_id, author_name, body) VALUES ('target', ?, 'reporter', ?, NULL, 'Jane', 'Kept text'), ('other', ?, 'reporter', ?, NULL, 'Other', 'Other text'), ('staff', ?, 'staff', NULL, 'admin', 'Admin', 'Staff text')",
    [first.id, target.reporter.id, first.id, other.reporter.id, first.id]
  );
  expect(reportersService.delete(target.reporter.id, 'admin').success).toBe(true);
  expect(
    getDb()
      .query('SELECT reporter_id, author_name, body FROM report_messages WHERE id = ?')
      .get('target')
  ).toEqual({ reporter_id: null, author_name: 'Deleted reporter', body: 'Kept text' });
  expect(
    getDb().query('SELECT author_name FROM report_messages WHERE id = ?').get('other')
  ).toEqual({ author_name: 'Other' });
  expect(
    getDb().query('SELECT author_name FROM report_messages WHERE id = ?').get('staff')
  ).toEqual({ author_name: 'Admin' });
});

it('rolls deletion, revocation, erasure, history, and message anonymization back together', async () => {
  const target = login();
  const first = await report(target.reporter.email);
  const outstanding = Result.unwrap(
    reporterAuthService.mintLoginToken(target.reporter.email, 'confirmation')
  );
  getDb().run(
    "INSERT INTO report_messages (id, report_id, reporter_id, author_kind, author_name, body) VALUES ('original', ?, ?, 'reporter', 'Original author', 'Kept text')",
    [first.id, target.reporter.id]
  );
  getDb().exec(
    "CREATE TRIGGER refuse_reporter_delete BEFORE DELETE ON reporters BEGIN SELECT RAISE(ABORT, 'refused'); END;"
  );
  expect(() => reportersService.delete(target.reporter.id, 'admin', true)).toThrow('refused');
  expect(reportersRepo.findById(target.reporter.id)!.sessionsRevokedAt).toBeNull();
  expect(reporterAuthService.validateSession(target.sessionSecret).success).toBe(true);
  expect(reporterAuthTokensRepo.findByHash(hashToken(outstanding.secret))!.revokedAt).toBeNull();
  expect((await reportsRepo.findById(first.id))!.claimableEmail).toBe(target.reporter.email);
  expect(
    getDb().query('SELECT 1 FROM report_history WHERE report_id = ?').get(first.id)
  ).toBeNull();
  expect(getDb().query('SELECT author_name FROM report_messages').get()).toEqual({
    author_name: 'Original author',
  });
});

it('lists reporters with cursor pagination, literal search, status, projects, and owned counts', async () => {
  const target = login('a_1@example.com');
  const other = login('a21@example.com');
  const first = await report();
  Result.unwrap(
    reporterOwnershipService.set(first.id, { reporterId: target.reporter.id }, 'admin')
  );
  Result.unwrap(reportersService.suspend(other.reporter.id, 'admin'));
  const page = Result.unwrap(reportersService.list({ limit: 1 }));
  expect(page.total).toBe(2);
  expect(page.reporters).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const next = Result.unwrap(reportersService.list({ limit: 1, cursor: page.nextCursor! }));
  expect(next.reporters).toHaveLength(1);
  expect(next.reporters[0].id).not.toBe(page.reporters[0].id);
  expect(next.nextCursor).toBeNull();
  const searched = Result.unwrap(reportersService.list({ search: 'a_1', status: 'active' }));
  expect(searched.reporters).toEqual([
    {
      id: target.reporter.id,
      email: target.reporter.email,
      displayName: 'a_1',
      projects: [{ id: project.id, name: project.name }],
      ownedReportCount: 1,
      lastLoginAt: reportersRepo.findById(target.reporter.id)!.lastLoginAt,
      status: 'active',
    },
  ]);
  expect(Result.unwrap(reportersService.list({ status: 'suspended' })).reporters[0].id).toBe(
    other.reporter.id
  );
  expect(reportersService.list({ cursor: 'invalid' }).success).toBe(false);
  const filtered = await request(`/api/reports?reporterId=${target.reporter.id}`);
  expect(
    ((await filtered.json()) as { data: Array<{ id: string }>; total: number }).data.map(
      (item) => item.id
    )
  ).toEqual([first.id]);
  expect(Result.unwrap(reportersService.lookup(' A_1@EXAMPLE.COM '))?.id).toBe(target.reporter.id);
});

it('excludes soft-deleted projects and their reports from reporter list summaries', async () => {
  const target = login('owner@example.com');
  const active = await report();
  Result.unwrap(
    reporterOwnershipService.set(active.id, { reporterId: target.reporter.id }, 'admin')
  );
  const deleted = await projectsRepo.create({ name: 'Deleted project' });
  for (let index = 0; index < 2; index++) {
    const hidden = await reportsRepo.create({
      projectId: deleted.id,
      title: 'Report in deleted project',
      metadata,
    });
    Result.unwrap(
      reporterOwnershipService.set(hidden.id, { reporterId: target.reporter.id }, 'admin')
    );
  }
  await projectsRepo.delete(deleted.id);
  const response = await request('/api/reporters');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    reporters: [
      {
        id: target.reporter.id,
        projects: [{ id: project.id, name: project.name }],
        ownedReportCount: 1,
      },
    ],
  });
});

it('enforces staff CSRF checks against the configured origin for cookie mutations', async () => {
  const first = await report();
  for (const overrides of [
    { Origin: '' },
    { Origin: 'null' },
    { Origin: 'https://other.example.test' },
    { Origin: 'https://sub.bugpin.example.test' },
    { Origin: `${portalOrigin}/` },
    { Origin: portalOrigin, 'Sec-Fetch-Site': 'same-site' },
    { Origin: portalOrigin, 'Sec-Fetch-Site': 'cross-site' },
  ] as Record<string, string>[]) {
    const response = await app.request(`${portalOrigin}/api/reports/${first.id}/owner`, {
      method: 'DELETE',
      headers: { Cookie: cookies.admin, ...overrides },
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe('ORIGIN_REJECTED');
  }
  expect(
    (
      await app.request(`${portalOrigin}/api/reports/${first.id}/owner`, {
        method: 'DELETE',
        headers: { Cookie: cookies.admin, Origin: portalOrigin, 'Sec-Fetch-Site': 'same-origin' },
      })
    ).status
  ).toBe(200);
  const protectedToken = Result.unwrap(
    reporterAuthService.mintLoginToken('next@example.com', 'request')
  );
  expect((await portalPost(app, '/auth/exchange', { token: protectedToken.secret })).status).toBe(
    200
  );
});

it('exempts only validated Bearer credentials and never grants the exemption to an invalid Authorization header', async () => {
  const first = await report();
  const user = (await usersRepo.findById('admin'))!;
  registerEEHooks({
    ...createDefaultHooks(),
    getApiTokenService: () => ({
      isApiAccessEnabled: () => true,
      validateToken: async (token) =>
        token === 'valid-token'
          ? Result.ok({
              id: 'token',
              userId: user.id,
              name: 'Token',
              scopes: ['read', 'write', 'admin'],
              createdAt: new Date().toISOString(),
              user,
            })
          : Result.fail('Invalid API credentials', 'UNAUTHORIZED'),
      hasScope: () => true,
    }),
  });
  expect(
    (
      await app.request(`${portalOrigin}/api/reports/${first.id}/owner`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer valid-token' },
      })
    ).status
  ).toBe(200);
  expect(
    (
      await app.request(`${portalOrigin}/api/reports/${first.id}/owner`, {
        method: 'DELETE',
        headers: { Cookie: cookies.admin, Authorization: 'Bearer invalid-token' },
      })
    ).status
  ).toBe(401);
});

it('checks prerequisites for project enablement and sends test login only to the acting admin', async () => {
  const enabled = { settings: { reporterPortal: { enabled: true, allowNewFeedback: false } } };
  await settingsRepo.updateAll({ appUrl: '', smtpEnabled: false });
  settingsCacheService.invalidate();
  const blocked = await request(`/api/projects/${project.id}`, 'PATCH', enabled);
  expect(blocked.status).toBe(409);
  expect(((await blocked.json()) as { details: string[] }).details).toEqual(['appUrl', 'smtp']);
  expect(
    (await request('/api/projects', 'POST', { name: 'New portal project', ...enabled })).status
  ).toBe(409);
  expect(
    (await request(`/api/projects/${project.id}/reporter-portal/test-login`, 'POST')).status
  ).toBe(409);
  await settingsRepo.updateAll({ appUrl: 'http://public.example.com', smtpEnabled: true });
  settingsCacheService.invalidate();
  expect((await request(`/api/projects/${project.id}`, 'PATCH', enabled)).status).toBe(409);
  await settingsRepo.updateAll({
    appUrl: portalOrigin,
    portalBaseUrl: 'http://portal.example.com',
  });
  settingsCacheService.invalidate();
  expect((await request(`/api/projects/${project.id}`, 'PATCH', enabled)).status).toBe(409);
  await settingsRepo.updateAll({ portalBaseUrl: '' });
  settingsCacheService.invalidate();
  config.isDev = false;
  await settingsRepo.updateAll({ appUrl: 'http://dev.test' });
  settingsCacheService.invalidate();
  expect((await request(`/api/projects/${project.id}`, 'PATCH', enabled)).status).toBe(409);
  config.isDev = true;
  expect((await request(`/api/projects/${project.id}`, 'PATCH', enabled)).status).toBe(200);
  await settingsRepo.updateAll({ appUrl: 'http://localhost:7300' });
  settingsCacheService.invalidate();
  expect((await request(`/api/projects/${project.id}`, 'PATCH', enabled)).status).toBe(200);
  const sent = spyOn(emailService, 'sendEmail');
  expect(
    (
      await request(`/api/projects/${project.id}/reporter-portal/test-login`, 'POST', {
        email: 'other@example.com',
      })
    ).status
  ).toBe(200);
  expect(sent.mock.calls.at(-1)![0].to[0].email).toBe('admin@example.com');
  const invalid = { settings: { reporterPortal: { enabled: false, allowNewFeedback: true } } };
  expect((await request(`/api/projects/${project.id}`, 'PATCH', invalid)).status).toBe(400);
  expect(
    (
      await request(`/api/projects/${project.id}`, 'PATCH', {
        settings: { reporterPortal: { enabled: false, allowNewFeedback: false } },
      })
    ).status
  ).toBe(200);
});

for (const changes of [
  { smtpEnabled: false },
  { appUrl: '' },
  { appUrl: 'http://public.example.com' },
]) {
  it(`allows unrelated settings and disabling new submissions with missing prerequisites ${JSON.stringify(changes)}`, async () => {
    await projectsRepo.update(project.id, {
      settings: { reporterPortal: { enabled: true, allowNewFeedback: true } },
    });
    await settingsRepo.updateAll(changes);
    settingsCacheService.invalidate();
    expect(
      (
        await request(`/api/projects/${project.id}`, 'PATCH', {
          settings: { widgetLauncherButton: { position: 'bottom-left' } },
        })
      ).status
    ).toBe(200);
    const off = { settings: { reporterPortal: { enabled: true, allowNewFeedback: false } } };
    expect((await request(`/api/projects/${project.id}`, 'PATCH', off)).status).toBe(200);
    expect((await projectsRepo.findById(project.id))!.settings.reporterPortal).toEqual(
      off.settings.reporterPortal
    );
    expect(
      (
        await request(`/api/projects/${project.id}`, 'PATCH', {
          settings: { reporterPortal: { enabled: true, allowNewFeedback: true } },
        })
      ).status
    ).toBe(409);
  });
}

it('waits for test-login delivery and sends a usable request token to the acting admin', async () => {
  const delivery = Promise.withResolvers<{ success: boolean }>();
  const started = Promise.withResolvers<void>();
  const sent = spyOn(emailService, 'sendEmail').mockImplementation(() => {
    started.resolve();
    return delivery.promise;
  });
  let completed = false;
  const pending = request(`/api/projects/${project.id}/reporter-portal/test-login`, 'POST').then(
    (response) => {
      completed = true;
      return response;
    }
  );
  await started.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(completed).toBe(false);
  delivery.resolve({ success: true });
  expect((await pending).status).toBe(200);
  const email = sent.mock.calls[0][0];
  expect(email.to[0].email).toBe('admin@example.com');
  const url = new URL(email.text!.match(/https:\/\/\S+/)![0]);
  const token = url.hash.slice(1);
  const stored = getDb()
    .query<
      {
        email: string;
        source: string;
        created_at: string;
        expires_at: string;
      },
      [string]
    >('SELECT email, source, created_at, expires_at FROM reporter_auth_tokens WHERE token_hash = ?')
    .get(hashToken(token))!;
  expect(stored).toMatchObject({ email: 'admin@example.com', source: 'request' });
  expect(Date.parse(stored.expires_at) - Date.parse(stored.created_at)).toBe(15 * 60000);
  expect(Result.unwrap(reporterAuthService.exchange(token)).reporter.email).toBe(
    'admin@example.com'
  );
});

it('rejects test login when the acting admin reporter identity is suspended', async () => {
  const admin = login('admin@example.com');
  Result.unwrap(reportersService.suspend(admin.reporter.id, 'admin'));
  const sent = spyOn(emailService, 'sendEmail');
  const response = await request(`/api/projects/${project.id}/reporter-portal/test-login`, 'POST');
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ success: false, error: 'REPORTER_SUSPENDED' });
  expect(sent).not.toHaveBeenCalled();
  expect(getDb().query('SELECT COUNT(*) AS count FROM reporter_auth_tokens').get()).toEqual({
    count: 1,
  });
});

it('rejects test login when the acting admin email is invalid', async () => {
  getDb().run('UPDATE users SET email = ? WHERE id = ?', ['invalid-email', 'admin']);
  const sent = spyOn(emailService, 'sendEmail');
  const response = await request(`/api/projects/${project.id}/reporter-portal/test-login`, 'POST');
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ success: false, error: 'INVALID_EMAIL' });
  expect(sent).not.toHaveBeenCalled();
  expect(getDb().query('SELECT COUNT(*) AS count FROM reporter_auth_tokens').get()).toEqual({
    count: 0,
  });
});

for (const failure of ['result', 'exception'] as const) {
  it(`reports test-login delivery failure when SMTP returns a failing ${failure}`, async () => {
    const sent = spyOn(emailService, 'sendEmail');
    if (failure === 'result')
      sent.mockResolvedValue({ success: false, error: 'Private SMTP details' });
    else sent.mockRejectedValue(new Error('Private SMTP details'));
    const response = await request(
      `/api/projects/${project.id}/reporter-portal/test-login`,
      'POST'
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      success: false,
      error: 'EMAIL_DELIVERY_FAILED',
      message: 'Could not send the login email',
    });
    expect(sent).toHaveBeenCalledTimes(1);
  });
}

const staffMatrix = [
  { method: 'PUT', path: '/api/reports/:id/owner', target: 'report', editors: true },
  { method: 'DELETE', path: '/api/reports/:id/owner', target: 'report', editors: true },
  { method: 'GET', path: '/api/reporters', target: 'account', editors: false },
  { method: 'GET', path: '/api/reporters/lookup', target: 'account', editors: true },
  { method: 'POST', path: '/api/reporters/:id/suspend', target: 'account', editors: false },
  { method: 'POST', path: '/api/reporters/:id/unsuspend', target: 'account', editors: false },
  { method: 'POST', path: '/api/reporters/:id/revoke-sessions', target: 'account', editors: false },
  { method: 'DELETE', path: '/api/reporters/:id', target: 'account', editors: false },
  {
    method: 'POST',
    path: '/api/projects/:id/reporter-portal/test-login',
    target: 'project',
    editors: false,
  },
] as const;

it('has a role matrix for every added staff endpoint', () => {
  const registered = app.routes
    .filter(
      (route) =>
        route.method !== 'ALL' &&
        (route.path.startsWith('/api/reporters') ||
          route.path.endsWith('/owner') ||
          route.path.endsWith('/reporter-portal/test-login'))
    )
    .map((route) => `${route.method} ${route.path.replace(/\/$/, '')}`);
  expect([...new Set(registered)].sort()).toEqual(
    staffMatrix.map((row) => `${row.method} ${row.path}`).sort()
  );
});

it('enforces roles and rejects reporter-only or missing credentials for every added staff endpoint', async () => {
  const guest = login('guest@example.com');
  for (const row of staffMatrix) {
    for (const role of ['admin', 'editor', 'viewer', 'reporter', 'anonymous'] as const) {
      const target = login();
      const first = await report();
      const id =
        row.target === 'report'
          ? first.id
          : row.target === 'project'
            ? project.id
            : target.reporter.id;
      const path =
        row.path.replace(':id', id) +
        (row.path.endsWith('/lookup') ? `?email=${encodeURIComponent(target.reporter.email)}` : '');
      const cookie =
        role === 'reporter'
          ? `bugpin_reporter_session=${guest.sessionSecret}`
          : role === 'anonymous'
            ? ''
            : cookies[role];
      const response = await app.request(`${portalOrigin}${path}`, {
        method: row.method,
        headers: { Cookie: cookie, Origin: portalOrigin, 'content-type': 'application/json' },
        ...(row.method === 'PUT'
          ? { body: JSON.stringify({ reporterId: target.reporter.id }) }
          : {}),
      });
      const expected =
        role === 'reporter' || role === 'anonymous'
          ? 401
          : role === 'admin' || (role === 'editor' && row.editors)
            ? 200
            : 403;
      expect({ route: `${row.method} ${row.path}`, role, status: response.status }).toEqual({
        route: `${row.method} ${row.path}`,
        role,
        status: expected,
      });
    }
  }
});

it('uses strict effective-origin equality for staff bootstrap and ignores untrusted forwarded headers', async () => {
  await settingsRepo.updateAll({ appUrl: '' });
  settingsCacheService.invalidate();
  const first = await report();
  const url = `http://localhost:7301/api/reports/${first.id}/owner`;
  const headers = {
    Cookie: cookies.admin,
    Origin: 'http://localhost:7300',
    'X-Forwarded-Host': 'localhost:7300',
    'X-Forwarded-Proto': 'http',
  };
  const peer = { requestIP: () => ({ address: '127.0.0.1' }) };
  expect((await app.request(url, { method: 'DELETE', headers }, peer)).status).toBe(403);
  config.trustProxy = 'auto';
  expect((await app.request(url, { method: 'DELETE', headers }, peer)).status).toBe(200);
  expect(
    (
      await app.request(
        url,
        { method: 'DELETE', headers: { ...headers, Origin: 'http://sibling.localhost:7300' } },
        peer
      )
    ).status
  ).toBe(403);
  expect(
    (
      await app.request(
        url,
        { method: 'DELETE', headers },
        { requestIP: () => ({ address: '203.0.113.1' }) }
      )
    ).status
  ).toBe(403);
  await settingsRepo.updateAll({ appUrl: portalOrigin });
  settingsCacheService.invalidate();
  expect((await app.request(url, { method: 'DELETE', headers }, peer)).status).toBe(403);
});
