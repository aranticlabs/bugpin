import { settingsService } from '../../../src/server/services/settings.service';
import { settingsRoutes } from '../../../src/server/routes/api/settings';
import { reportersService } from '../../../src/server/services/reporters.service';
import { SUPPORTED_LOCALES } from '../../../src/shared/types';
import { reporterOwnershipService } from '../../../src/server/services/reporter-ownership.service';
import { createDefaultHooks } from '../../../src/server/types/ee-plugin';
import { registerEEHooks, resetEEHooks } from '../../../src/server/utils/ee-hooks';
import { afterEach, beforeEach, expect, it, mock, spyOn, setSystemTime } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { getDb } from '../../../src/server/database/database';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import {
  notificationPreferencesRepo,
  projectNotificationDefaultsRepo,
} from '../../../src/server/database/repositories/notification-preferences.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { emailService } from '../../../src/server/services/email.service';
import { reportMessagesService } from '../../../src/server/services/report-messages.service';
import { reportsService } from '../../../src/server/services/reports.service';
import { realtimeService } from '../../../src/server/services/realtime.service';
import { reportsRoutes } from '../../../src/server/routes/api/reports';
import { Result } from '../../../src/server/utils/result';
import { createPortalTestApp, openPortalDatabase, portalOrigin } from './helpers';
import type { SendEmailOptions } from '../../../src/server/services/email.service';

let close: () => void;
let sent: SendEmailOptions[];
beforeEach(async () => {
  close = await openPortalDatabase();
  getDb().exec(`
    INSERT INTO projects (id, name, api_key_hash, api_key_prefix, settings) VALUES ('project', 'Project', 'hash', 'prefix', '{"reporterPortal":{"enabled":true}}');
    INSERT INTO reporters (id, email, display_name) VALUES ('reporter', 'reporter@example.com', 'Reporter');
    INSERT INTO reports (id, project_id, title, metadata, reporter_id) VALUES ('report', 'project', 'Reporter activity', '{}', 'reporter');
    INSERT INTO users (id, email, password_hash, name, role, is_active) VALUES
      ('admin', 'admin@example.com', 'hash', 'Admin', 'admin', 1),
      ('editor', 'editor@example.com', 'hash', 'Editor', 'editor', 1),
      ('viewer', 'viewer@example.com', 'hash', 'Viewer', 'viewer', 1),
      ('disabled', 'disabled@example.com', 'hash', 'Disabled', 'admin', 0);
  `);
  sent = [];
  spyOn(emailService, 'sendEmail').mockImplementation(async (options) => {
    sent.push(options);
    return { success: true };
  });
});
afterEach(async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  setSystemTime();
  resetEEHooks();
  mock.restore();
  close();
});

const report = async () => (await reportsRepo.findById('report'))!;
const defaults = async () => (await settingsCacheService.getAll()).notifications;
const recipients = () =>
  sent.flatMap((email) => email.to.map((recipient) => recipient.email)).sort();

it('adds default-on reply preferences to existing rows without changing their other preferences', () => {
  const db = new Database(':memory:');
  try {
    db.exec(
      "CREATE TABLE notification_preferences (id TEXT, email_enabled INTEGER); CREATE TABLE project_notification_defaults (id TEXT); CREATE TABLE settings (key TEXT PRIMARY KEY, value JSON); INSERT INTO notification_preferences VALUES ('old', 0); INSERT INTO project_notification_defaults VALUES ('old');"
    );
    db.exec(
      readFileSync(
        new URL(
          '../../../src/server/database/migrations/023_add_reporter_reply_preferences.sql',
          import.meta.url
        ),
        'utf8'
      )
    );
    expect(db.query('SELECT * FROM notification_preferences').get()).toEqual({
      id: 'old',
      email_enabled: 0,
      notify_on_reporter_reply: 1,
    });
    expect(
      db.query('SELECT default_notify_on_reporter_reply FROM project_notification_defaults').get()
    ).toEqual({ default_notify_on_reporter_reply: 1 });
    expect(
      db.query("SELECT value FROM settings WHERE key = 'default_notify_on_reporter_reply'").get()
    ).toEqual({ value: 'true' });
  } finally {
    db.close();
  }
});

it('routes assigned activity only to the assignee and never falls back when the assignee opts out', async () => {
  getDb().run("UPDATE reports SET assigned_to = 'editor' WHERE id = 'report'");
  await notificationsService.notifyReporterActivity(await report());
  expect(recipients()).toEqual(['editor@example.com']);
  sent = [];
  await notificationPreferencesRepo.upsert(
    'editor',
    'project',
    { notifyOnReporterReply: false },
    await defaults()
  );
  await notificationsService.notifyReporterActivity(await report());
  expect(sent).toEqual([]);
  await notificationPreferencesRepo.upsert(
    'editor',
    'project',
    { notifyOnReporterReply: true, emailEnabled: false },
    await defaults()
  );
  await notificationsService.notifyReporterActivity(await report());
  expect(sent).toEqual([]);
});

it('routes unassigned activity to opted-in active admins/editors, excluding the reporter mailbox', async () => {
  await notificationsService.notifyReporterActivity(await report());
  expect(recipients()).toEqual(['admin@example.com', 'editor@example.com']);
  sent = [];
  await notificationPreferencesRepo.upsert(
    'editor',
    'project',
    { notifyOnReporterReply: false },
    await defaults()
  );
  await notificationsService.notifyReporterActivity(await report());
  expect(recipients()).toEqual(['admin@example.com']);
  sent = [];
  getDb().run("UPDATE users SET email = 'reporter@example.com' WHERE id = 'admin'");
  await notificationsService.notifyReporterActivity(await report());
  expect(sent).toEqual([]);
});

it('resolves and persists the new preference with user, project, then global precedence', async () => {
  expect((await defaults()).notifyOnReporterReply).toBe(true);
  await settingsRepo.updateAll({
    notifications: { ...(await defaults()), notifyOnReporterReply: false },
  });
  settingsCacheService.invalidate();
  await notificationsService.notifyReporterActivity(await report());
  expect(sent).toEqual([]);
  await projectNotificationDefaultsRepo.upsert('project', { defaultNotifyOnReporterReply: true });
  await notificationsService.notifyReporterActivity(await report());
  expect(recipients()).toEqual(['admin@example.com', 'editor@example.com']);
  sent = [];
  await notificationPreferencesRepo.upsert(
    'admin',
    'project',
    { notifyOnReporterReply: false },
    await defaults()
  );
  expect(
    (await notificationPreferencesRepo.findByUserAndProject('admin', 'project'))!
      .notifyOnReporterReply
  ).toBe(false);
  await notificationsService.notifyReporterActivity(await report());
  expect(recipients()).toEqual(['editor@example.com']);
  await projectNotificationDefaultsRepo.upsert('project', { defaultNotifyOnReporterReply: false });
  expect(
    (await projectNotificationDefaultsRepo.findByProject('project'))!.defaultNotifyOnReporterReply
  ).toBe(false);
});

it('keeps reporter activity through a detail view, clears it through each staff action, and restores it for later replies', async () => {
  const hints = spyOn(realtimeService, 'publish');
  expect(
    (await reportMessagesService.sendReporter('report', 'reporter', 'More details')).success
  ).toBe(true);
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect(Result.unwrap(reportsService.reporterActivityCount())).toBe(1);
  await reportsService.getById('report');
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect((await reportsRepo.find({ reporterActivity: 'new' })).total).toBe(1);
  expect((await reportsService.update('report', { status: 'resolved' }, 'editor')).success).toBe(
    true
  );
  expect((await report()).hasNewReporterActivity).toBe(false);
  await reportMessagesService.sendReporter('report', 'reporter', 'Still occurs');
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect((await reportMessagesService.send('report', 'editor', 'Thanks')).success).toBe(true);
  expect((await report()).hasNewReporterActivity).toBe(false);
  await reportMessagesService.sendReporter('report', 'reporter', 'One more detail');
  expect(
    (
      await reportsService.acknowledgeReporterActivity(
        'report',
        (await report()).lastReporterActivityAt!
      )
    ).success
  ).toBe(true);
  expect((await report()).hasNewReporterActivity).toBe(false);
  await reportMessagesService.sendReporter('report', 'reporter', 'Later reply');
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect(hints).toHaveBeenCalledWith('reporter_activity.changed', {
    reportId: 'report',
    projectId: 'project',
  });
});

it('does not erase a reply arriving after acknowledgement, including replies in the same millisecond', async () => {
  setSystemTime(new Date('2026-11-09T10:00:00.000Z'));
  await reportMessagesService.sendReporter('report', 'reporter', 'First');
  await reportsService.acknowledgeReporterActivity(
    'report',
    (await report()).lastReporterActivityAt!
  );
  const acknowledged = (await report()).reporterActivitySeenAt!;
  await reportMessagesService.sendReporter('report', 'reporter', 'Second');
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect(Date.parse((await report()).lastReporterActivityAt!)).toBeGreaterThan(
    Date.parse(acknowledged)
  );
});

it('keeps a reply new when it arrives between the displayed report and acknowledgement', async () => {
  setSystemTime(new Date('2026-11-09T10:00:00.000Z'));
  await reportMessagesService.sendReporter('report', 'reporter', 'First');
  const displayedAt = (await report()).lastReporterActivityAt!;
  await reportMessagesService.sendReporter('report', 'reporter', 'Arrived after fetch');
  await reportsService.acknowledgeReporterActivity('report', displayedAt);
  expect((await report()).reporterActivitySeenAt).toBe(displayedAt);
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect(Result.unwrap(reportsService.reporterActivityCount())).toBe(1);
  await reportsService.acknowledgeReporterActivity(
    'report',
    (await report()).lastReporterActivityAt!
  );
  await reportsService.acknowledgeReporterActivity('report', displayedAt);
  expect((await report()).hasNewReporterActivity).toBe(false);
});

it('acknowledges only an actual staff status change, not other edits or integration updates', async () => {
  await reportMessagesService.sendReporter('report', 'reporter', 'First');
  await reportsService.update('report', { status: 'open', priority: 'high' }, 'editor');
  expect((await report()).hasNewReporterActivity).toBe(true);
  await reportsService.update('report', { status: 'resolved' });
  expect((await report()).hasNewReporterActivity).toBe(true);
  await reportsService.update('report', { status: 'closed' }, 'editor');
  expect((await report()).hasNewReporterActivity).toBe(false);
});

it('authorizes activity reads and acknowledgements and accepts the filter only with its supported value', async () => {
  const app = createPortalTestApp();
  app.route('/api/reports', reportsRoutes);
  await reportMessagesService.sendReporter('report', 'reporter', 'First');
  for (const role of ['admin', 'editor', 'viewer']) {
    const session = await sessionsRepo.create({
      userId: role,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const headers = { Cookie: `session=${session.id}`, Origin: portalOrigin };
    const count = await app.request(`${portalOrigin}/api/reports/reporter-activity/count`, {
      headers,
    });
    expect(count.status).toBe(200);
    const filtered = await app.request(`${portalOrigin}/api/reports?reporterActivity=new`, {
      headers,
    });
    expect(filtered.status).toBe(200);
    expect(
      (await app.request(`${portalOrigin}/api/reports?reporterActivity=all`, { headers })).status
    ).toBe(400);
    const seen = await app.request(`${portalOrigin}/api/reports/report/reporter-activity/seen`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ lastReporterActivityAt: (await report()).lastReporterActivityAt }),
    });
    expect(seen.status).toBe(role === 'viewer' ? 403 : 200);
  }
  for (const cookie of ['', 'bugpin_reporter_session=reporter']) {
    expect(
      (
        await app.request(`${portalOrigin}/api/reports/reporter-activity/count`, {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(401);
    expect(
      (
        await app.request(`${portalOrigin}/api/reports/report/reporter-activity/seen`, {
          method: 'POST',
          headers: { Cookie: cookie, Origin: portalOrigin },
        })
      ).status
    ).toBe(401);
  }
});

it('publishes owner hints and exact webhook payloads only for committed owner changes', async () => {
  const hooks = createDefaultHooks();
  const ownerChanged = spyOn(hooks, 'onReportOwnerChanged');
  registerEEHooks(hooks);
  const publish = spyOn(realtimeService, 'publish');
  getDb().run(
    "INSERT INTO reporters (id, email, display_name) VALUES ('other', 'other@example.com', 'Other')"
  );
  expect(reporterOwnershipService.set('report', { reporterId: 'reporter' }, 'editor').success).toBe(
    true
  );
  expect(publish).not.toHaveBeenCalled();
  expect(reporterOwnershipService.set('report', { reporterId: 'other' }, 'editor').success).toBe(
    true
  );
  expect(
    reporterOwnershipService.set('report', { claimableEmail: 'new@example.com' }, 'editor').success
  ).toBe(true);
  expect(reporterOwnershipService.remove('report', 'editor').success).toBe(true);
  expect(reporterOwnershipService.set('report', { reporterId: 'missing' }, 'editor').success).toBe(
    false
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(publish).toHaveBeenCalledTimes(3);
  expect(ownerChanged.mock.calls.map(([change]) => change)).toEqual([
    {
      reportId: 'report',
      projectId: 'project',
      action: 'owner_assigned',
      oldReporterId: 'reporter',
      newReporterId: 'other',
      actorUserId: 'editor',
    },
    {
      reportId: 'report',
      projectId: 'project',
      action: 'claimable_set',
      oldReporterId: 'other',
      newReporterId: null,
      actorUserId: 'editor',
    },
    {
      reportId: 'report',
      projectId: 'project',
      action: 'owner_removed',
      oldReporterId: null,
      newReporterId: null,
      actorUserId: 'editor',
    },
  ]);
});

it('publishes same-column board changes after success and emits nothing for invalid moves', async () => {
  const publish = spyOn(realtimeService, 'publish');
  expect((await reportsService.moveOnBoard('report', { status: 'open' }, 'editor')).success).toBe(
    true
  );
  expect(publish).toHaveBeenCalledWith('report.updated', {
    reportId: 'report',
    projectId: 'project',
  });
  publish.mockClear();
  expect(
    (await reportsService.moveOnBoard('report', { status: 'open', previousId: 'report' }, 'editor'))
      .success
  ).toBe(false);
  expect(publish).not.toHaveBeenCalled();
});

it('announces committed owner removal when a reporter is deleted', async () => {
  const hooks = createDefaultHooks();
  const ownerChanged = spyOn(hooks, 'onReportOwnerChanged');
  registerEEHooks(hooks);
  expect(reportersService.delete('reporter', 'admin').success).toBe(true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(ownerChanged).toHaveBeenCalledWith({
    reportId: 'report',
    projectId: 'project',
    action: 'owner_removed',
    oldReporterId: 'reporter',
    newReporterId: null,
    actorUserId: 'admin',
  });
});

it('allows only admins to change portal settings and keeps staff Origin bound to the configured Application URL', async () => {
  const app = createPortalTestApp();
  app.route('/api/settings', settingsRoutes);
  for (const role of ['admin', 'editor', 'viewer']) {
    const session = await sessionsRepo.create({
      userId: role,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const response = await app.request(`${portalOrigin}/api/settings`, {
      method: 'PUT',
      headers: {
        Cookie: `session=${session.id}`,
        Origin: portalOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        portalBaseUrl: 'https://feedback.example.com',
        reporterPortalLimits: { sseStreamsPerSession: 4 },
      }),
    });
    expect(response.status).toBe(role === 'admin' ? 200 : 403);
    if (role === 'admin') {
      const wrongOrigin = await app.request('https://other.example.com/api/settings', {
        method: 'PUT',
        headers: {
          Cookie: `session=${session.id}`,
          Origin: 'https://other.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ portalBaseUrl: '' }),
      });
      expect(wrongOrigin.status).toBe(403);
    }
  }
});

it('rejects API updates that leave a portal origin without an Application URL', async () => {
  getDb().run("UPDATE projects SET settings = '{}' WHERE id = 'project'");
  const app = createPortalTestApp();
  app.route('/api/settings', settingsRoutes);
  const session = await sessionsRepo.create({
    userId: 'admin',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  for (const portalBaseUrl of ['', 'https://feedback.example.com']) {
    await settingsRepo.updateAll({ appUrl: portalOrigin, portalBaseUrl });
    settingsCacheService.invalidate();
    const before = await settingsRepo.getAll();
    const response = await app.request(`${portalOrigin}/api/settings`, {
      method: 'PUT',
      headers: {
        Cookie: `session=${session.id}`,
        Origin: portalOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appUrl: '',
        ...(portalBaseUrl ? {} : { portalBaseUrl: 'https://feedback.example.com' }),
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: 'INVALID_APP_URL' });
    expect(await settingsRepo.getAll()).toEqual(before);
  }
});

it('validates and persists a separate portal URL and rejects a colliding Application URL', async () => {
  for (const portalBaseUrl of [
    'bad',
    'ftp://feedback.example.com',
    'https://user:password@feedback.example.com',
    'https://bugpin.example.test:8443',
    'https://feedback.example.com/portal',
    'https://feedback.example.com?project=example',
    'https://feedback.example.com#portal',
  ]) {
    expect(await settingsService.update({ portalBaseUrl })).toMatchObject({
      success: false,
      code: 'INVALID_PORTAL_BASE_URL',
    });
  }
  expect(
    (await settingsService.update({ portalBaseUrl: 'https://feedback.example.com/' })).success
  ).toBe(true);
  expect((await settingsRepo.getAll()).portalBaseUrl).toBe('https://feedback.example.com');
  expect(
    (await settingsService.update({ appUrl: 'https://feedback.example.com:8443' })).success
  ).toBe(false);
  expect((await settingsService.update({ portalBaseUrl: '' })).success).toBe(true);
  expect((await settingsRepo.getAll()).portalBaseUrl).toBe('');
});

it('renders localized editable staff activity emails with their own footer type and absolute URLs', async () => {
  const footer = spyOn(emailService, 'appendFooter');
  const settings = await settingsRepo.getAll();
  await settingsRepo.updateAll({ appUrl: '' });
  settingsCacheService.invalidate();
  for (const locale of SUPPORTED_LOCALES) {
    const template = await emailService.getTemplate('reporterActivity', locale);
    expect(template.html).toContain(`lang="${locale}"`);
  }
  await emailService.sendReporterActivityEmail(
    [{ email: 'editor@example.com' }],
    await report(),
    'Project'
  );
  expect(sent.at(-1)!.html).toContain('lang="en"');
  expect(sent.at(-1)!.html).toContain('http://localhost:3000/admin/reports/report');
  expect(footer).toHaveBeenLastCalledWith(expect.any(String), 'reporterActivity');
  await settingsRepo.updateAll({ appUrl: settings.appUrl + '/nested/' });
  settingsCacheService.invalidate();
  const hooks = createDefaultHooks();
  hooks.getCustomEmailTemplates = async () => ({
    reporterActivity: {
      en: {
        subject: 'Custom: {{report.title}}',
        html: '<html><body><div><a href="{{report.url}}">Lien</a></div></body></html>',
      },
    },
  });
  registerEEHooks(hooks);
  await emailService.sendReporterActivityEmail(
    [{ email: 'editor@example.com' }],
    await report(),
    'Project'
  );
  expect(sent.at(-1)!.subject).toBe('Custom: Reporter activity');
  expect(sent.at(-1)!.html).toContain('https://bugpin.example.test/admin/reports/report');
  expect(sent.at(-1)!.html).not.toContain('/nested/');
});

it('requires a valid Application URL for a separate portal even while projects have portals disabled', async () => {
  getDb().run("UPDATE projects SET settings = '{}' WHERE id = 'project'");
  await settingsRepo.updateAll({ appUrl: 'invalid', portalBaseUrl: '' });
  expect(
    await settingsService.update({ portalBaseUrl: 'https://feedback.example.com' })
  ).toMatchObject({ success: false, code: 'INVALID_APP_URL' });
  for (const appUrl of ['', ' ', 'invalid', 'ftp://staff.example.com']) {
    expect(
      await settingsService.update({ appUrl, portalBaseUrl: 'https://feedback.example.com' })
    ).toMatchObject({ success: false, code: 'INVALID_APP_URL' });
    expect((await settingsRepo.getAll()).portalBaseUrl).toBe('');
  }
  expect(
    (
      await settingsService.update({
        appUrl: 'https://staff.example.com',
        portalBaseUrl: 'https://feedback.example.com',
      })
    ).success
  ).toBe(true);
  expect(await settingsService.update({ appUrl: '' })).toMatchObject({
    success: false,
    code: 'INVALID_APP_URL',
  });
  expect((await settingsRepo.getAll()).appUrl).toBe('https://staff.example.com');
  expect((await settingsService.update({ appUrl: '', portalBaseUrl: '' })).success).toBe(true);
  expect((await settingsRepo.getAll()).appUrl).toBe('');
  await settingsRepo.updateAll({
    appUrl: 'invalid',
    portalBaseUrl: 'https://feedback.example.com',
  });
  expect((await settingsService.update({ portalBaseUrl: '' })).success).toBe(true);
  expect((await settingsRepo.getAll()).portalBaseUrl).toBe('');
  expect(await settingsService.update({ appUrl: 'invalid' })).toMatchObject({
    success: false,
    code: 'INVALID_APP_URL',
  });
});

it('rejects global URL downgrades while any reporter portal is enabled and preserves loopback URLs', async () => {
  for (const [updates, code] of [
    [{ appUrl: 'http://bugpin.example.com' }, 'INVALID_APP_URL'],
    [{ appUrl: '' }, 'INVALID_APP_URL'],
    [{ portalBaseUrl: 'http://feedback.example.com' }, 'INVALID_PORTAL_BASE_URL'],
  ] as const) {
    expect(await settingsService.update(updates)).toMatchObject({ success: false, code });
    expect((await settingsRepo.getAll()).appUrl).toBe(portalOrigin);
    expect((await settingsRepo.getAll()).portalBaseUrl).toBe('');
  }
  expect(
    (
      await settingsService.update({
        appUrl: 'http://localhost:3000',
        portalBaseUrl: 'http://127.0.0.1:3001',
      })
    ).success
  ).toBe(true);
  expect((await settingsRepo.getAll()).portalBaseUrl).toBe('http://127.0.0.1:3001');
});

it('rejects other global updates when an enabled portal has insecure restored settings', async () => {
  await settingsRepo.updateAll({ appUrl: 'http://bugpin.example.com' });
  expect(await settingsService.update({ appName: 'Renamed' })).toMatchObject({
    success: false,
    code: 'INVALID_APP_URL',
  });
  expect((await settingsRepo.getAll()).appName).toBe('BugPin');
});

it('enforces secure URLs for an enabled portal on another inactive project, excluding deleted projects', async () => {
  getDb().run("UPDATE projects SET settings = '{}' WHERE id = 'project'");
  getDb().exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix, is_active, settings)
    VALUES ('other', 'Other', 'other-hash', 'other-prefix', 0, '{"reporterPortal":{"enabled":true}}')`);
  expect(await settingsService.update({ appUrl: 'http://bugpin.example.com' })).toMatchObject({
    success: false,
    code: 'INVALID_APP_URL',
  });
  getDb().run("UPDATE projects SET deleted_at = ? WHERE id = 'other'", [new Date().toISOString()]);
  expect((await settingsService.update({ appUrl: 'http://bugpin.example.com' })).success).toBe(
    true
  );
});
