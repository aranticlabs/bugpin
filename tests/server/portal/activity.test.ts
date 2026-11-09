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
  expect((await reportsService.acknowledgeReporterActivity('report')).success).toBe(true);
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
  await reportsService.acknowledgeReporterActivity('report');
  const acknowledged = (await report()).reporterActivitySeenAt!;
  await reportMessagesService.sendReporter('report', 'reporter', 'Second');
  expect((await report()).hasNewReporterActivity).toBe(true);
  expect(Date.parse((await report()).lastReporterActivityAt!)).toBeGreaterThan(
    Date.parse(acknowledged)
  );
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
      headers,
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
