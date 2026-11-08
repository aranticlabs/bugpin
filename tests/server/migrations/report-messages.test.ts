import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono';
import { config } from '../../../src/server/config';
import {
  closeDatabase,
  getDb,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../../src/server/database/database';
import { MigrationRunner } from '../../../src/server/database/migration-runner';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { gamificationRepo } from '../../../src/server/database/repositories/gamification.repo';
import { reportMessagesRepo } from '../../../src/server/database/repositories/report-messages.repo';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { reporterMessagesRoutes } from '../../../src/server/routes/api/reporter-messages';
import { authService } from '../../../src/server/services/auth.service';
import { reportMessagesService } from '../../../src/server/services/report-messages.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { Result } from '../../../src/server/utils/result';
import type { ReporterMessage } from '../../../src/shared/types';

const originalConfig = { ...config };
let directory: string;

beforeEach(async () => {
  closeDatabase();
  directory = mkdtempSync(join(tmpdir(), 'bugpin-message-migration-'));
  Object.assign(config, {
    dataDir: directory,
    dbPath: join(directory, 'bugpin.db'),
    screenshotsDir: join(directory, 'screenshots'),
    attachmentsDir: join(directory, 'attachments'),
    brandingDir: join(directory, 'branding'),
    avatarsDir: join(directory, 'avatars'),
  });
  await initDatabase();
});

afterEach(() => {
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
  Object.assign(config, originalConfig);
});

function seedReport(): void {
  getDb().exec(`
    INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO users (id, email, password_hash, name, role) VALUES ('staff', 'staff@example.com', 'hash', 'Original name', 'editor');
    INSERT INTO reports (id, project_id, title, metadata, reporter_email) VALUES ('report', 'project', 'A report', '{}', 'reporter@example.com');
  `);
}

it('migrates authoritative sent times and preserves the legacy JSON API and staff XP', async () => {
  const db = getDb();
  db.exec(readFileSync(resolve(import.meta.dir, '../../fixtures/pre-portal-schema.sql'), 'utf8'));
  seedReport();
  db.exec(`
    INSERT INTO reporter_messages (id, report_id, user_id, message, sent_at, created_at)
    VALUES ('old-message', 'report', 'staff', 'Original message', '2026-01-02T03:04:05.000Z', '2026-01-09T10:11:12.000Z');
  `);
  await initSchema();
  await runMigrations();

  expect(
    db
      .query(
        "SELECT name FROM sqlite_schema WHERE name IN ('reporter_messages', 'idx_reporter_messages_user_sent', 'idx_reporter_messages_report_id')"
      )
      .all()
  ).toEqual([]);
  expect(gamificationRepo.listReporterMessageTimes(['staff'])).toEqual([
    { userId: 'staff', at: '2026-01-02T03:04:05.000Z' },
  ]);
  const user = await usersRepo.findById('staff');
  if (!user) throw new Error('Missing staff fixture');
  const auth = spyOn(authService, 'validateSession').mockResolvedValue(
    Result.ok({
      user,
      session: {
        id: 'session',
        userId: user.id,
        createdAt: '2026-01-01',
        lastActivityAt: '2026-01-01',
        expiresAt: '2099-01-01',
      },
    })
  );
  const notify = spyOn(notificationsService, 'notifyReporterMessage').mockResolvedValue(undefined);
  try {
    const app = new Hono();
    app.route('/reports', reporterMessagesRoutes);
    const response = await app.request('http://localhost/reports/report/reporter-messages', {
      headers: { cookie: 'session=session' },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { messages: ReporterMessage[] };
    expect(data.messages).toEqual([
      {
        id: 'old-message',
        reportId: 'report',
        userId: 'staff',
        userName: 'Original name',
        message: 'Original message',
        sentAt: '2026-01-02T03:04:05.000Z',
        createdAt: '2026-01-02T03:04:05.000Z',
        authorKind: 'staff',
        reporterId: null,
        authorName: 'Original name',
        files: [],
        hiddenAt: null,
      },
    ]);
    const sent = await app.request('http://localhost/reports/report/reporter-messages', {
      method: 'POST',
      headers: { cookie: 'session=session', 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'A new reply', ccSender: true }),
    });
    expect(sent.status).toBe(200);
    const result = (await sent.json()) as { reporterMessage: ReporterMessage };
    expect(result.reporterMessage).toMatchObject({
      message: 'A new reply',
      authorKind: 'staff',
      authorName: 'Original name',
    });
    expect(result.reporterMessage.sentAt).toBe(result.reporterMessage.createdAt);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'report' }),
      'A new reply',
      'staff',
      true
    );
  } finally {
    auth.mockRestore();
    notify.mockRestore();
  }
  expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('keeps author snapshots, returns both authors and their files, and counts only staff for XP', async () => {
  await initSchema();
  await runMigrations();
  seedReport();
  const db = getDb();
  const staffMessage = reportMessagesRepo.insert(
    'report',
    { kind: 'staff', userId: 'staff' },
    'A staff reply'
  );
  if (!staffMessage) throw new Error('Missing staff fixture');
  db.exec(`
    INSERT INTO reporters (id, email, display_name) VALUES ('reporter', 'reporter@example.com', 'Reporter');
    INSERT INTO report_messages (id, report_id, author_kind, reporter_id, author_name, body, created_at)
    VALUES ('reply', 'report', 'reporter', 'reporter', 'Reporter snapshot', 'A reporter reply', '2090-01-01');
    UPDATE users SET name = 'Renamed staff' WHERE id = 'staff';
  `);
  db.run('UPDATE report_messages SET hidden_at = ?, hidden_by_user_id = ? WHERE id = ?', [
    '2026-01-02',
    'staff',
    staffMessage.id,
  ]);
  const file = await filesRepo.create({
    reportId: 'report',
    messageId: 'reply',
    uploadedByReporterId: 'reporter',
    type: 'screenshot',
    filename: 'image.png',
    path: '/image.png',
    mimeType: 'image/png',
    sizeBytes: 12,
  });
  expect(file).toMatchObject({ messageId: 'reply', uploadedByReporterId: 'reporter' });
  expect(await filesRepo.findByMessageId('reply')).toEqual([file]);
  expect(gamificationRepo.listReporterMessageTimes(['staff'])).toEqual([
    { userId: 'staff', at: staffMessage.createdAt },
  ]);
  const messages = await reportMessagesService.listByReport('report');
  expect(messages.success).toBe(true);
  if (!messages.success) throw new Error(messages.error);
  expect(messages.value).toMatchObject([
    { authorName: 'Original name', hiddenAt: '2026-01-02', files: [] },
    {
      authorKind: 'reporter',
      userId: null,
      reporterId: 'reporter',
      authorName: 'Reporter snapshot',
      files: [file],
    },
  ]);
  db.run('DELETE FROM users WHERE id = ?', ['staff']);
  expect((await reportMessagesRepo.findByReportId('report'))[0]).toMatchObject({
    userId: null,
    hiddenByUserId: null,
    authorName: 'Original name',
  });
  db.run('DELETE FROM reporters WHERE id = ?', ['reporter']);
  expect(await filesRepo.findById(file.id)).toMatchObject({ uploadedByReporterId: null });
  db.run('DELETE FROM reports WHERE id = ?', ['report']);
  expect(await filesRepo.findById(file.id)).toBeNull();
  expect(await reportMessagesRepo.findByReportId('report')).toEqual([]);
  expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('backfills a missing staff author and recognizes already satisfied message and file migrations', async () => {
  await initSchema();
  await runMigrations();
  seedReport();
  const db = getDb();
  db.exec(readFileSync(join(config.migrationsDir, '001_add_reporter_messages.sql'), 'utf8'));
  db.exec(`PRAGMA foreign_keys = OFF;
    INSERT INTO reporter_messages (id, report_id, user_id, message, sent_at)
      VALUES ('orphan', 'report', 'missing', 'A past reply', '2026-01-01');
    PRAGMA foreign_keys = ON;
    DELETE FROM migrations WHERE name IN ('021_add_report_messages.sql', '022_add_file_message_links.sql');`);
  await runMigrations();
  expect((await reportMessagesRepo.findByReportId('report'))[0]).toMatchObject({
    id: 'orphan',
    authorName: 'Former team member',
    userId: null,
    createdAt: '2026-01-01',
  });
  db.exec(
    "DELETE FROM migrations WHERE name IN ('021_add_report_messages.sql', '022_add_file_message_links.sql');"
  );
  await runMigrations();
  expect(await reportMessagesRepo.findByReportId('report')).toHaveLength(1);
  expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('rolls back a failed message backfill and retains a restorable legacy snapshot', async () => {
  await initSchema();
  await runMigrations();
  seedReport();
  const db = getDb();
  db.exec(readFileSync(join(config.migrationsDir, '001_add_reporter_messages.sql'), 'utf8'));
  db.exec(`INSERT INTO reporter_messages (id, report_id, user_id, message) VALUES ('duplicate', 'report', 'staff', 'Legacy reply');
    INSERT INTO report_messages (id, report_id, author_kind, user_id, author_name, body) VALUES ('duplicate', 'report', 'staff', 'staff', 'Original name', 'Existing reply');
    DELETE FROM migrations WHERE name = '021_add_report_messages.sql';`);
  const migrationDirectory = join(directory, 'migrations');
  mkdirSync(migrationDirectory);
  writeFileSync(
    join(migrationDirectory, '021_add_report_messages.sql'),
    readFileSync(join(config.migrationsDir, '021_add_report_messages.sql'))
  );
  const legacy = db.query('SELECT * FROM reporter_messages').all();
  const current = db.query('SELECT * FROM report_messages').all();
  expect(() => new MigrationRunner(db, migrationDirectory).run()).toThrow();
  expect(db.query('SELECT * FROM reporter_messages').all()).toEqual(legacy);
  expect(db.query('SELECT * FROM report_messages').all()).toEqual(current);
  const snapshots = readdirSync(directory).filter((name) => name.endsWith('.bak'));
  expect(snapshots.length).toBeGreaterThan(0);
  const restoredPath = join(directory, 'restored.db');
  copyFileSync(join(directory, snapshots[snapshots.length - 1]), restoredPath);
  const restored = new Database(restoredPath);
  try {
    expect(restored.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(restored.query('SELECT * FROM reporter_messages').all()).toEqual(legacy);
    expect(restored.query('SELECT * FROM report_messages').all()).toEqual(current);
  } finally {
    restored.close();
  }
});
