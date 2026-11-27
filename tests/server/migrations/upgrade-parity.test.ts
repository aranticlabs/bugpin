import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../../../src/server/config';
import {
  closeDatabase,
  getDb,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../../src/server/database/database';
import { MigrationRunner } from '../../../src/server/database/migration-runner';
import { REPORTERS_SCHEMA } from '../../../src/server/database/portal-schema';
import { gamificationRepo } from '../../../src/server/database/repositories/gamification.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { gamificationService } from '../../../src/server/services/gamification.service';
import { DEFAULT_REPORTER_PORTAL_LIMITS } from '../../../src/shared/types';

const originalConfig = { ...config };
let directory: string;
const fixture = fs.readFileSync(
  path.resolve(import.meta.dir, '../../fixtures/pre-portal-schema.sql'),
  'utf8'
);

beforeEach(() => {
  closeDatabase();
  directory = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-upgrade-parity-'));
  Object.assign(config, {
    dataDir: directory,
    dbPath: path.join(directory, 'bugpin.db'),
    screenshotsDir: path.join(directory, 'screenshots'),
    attachmentsDir: path.join(directory, 'attachments'),
    brandingDir: path.join(directory, 'branding'),
    avatarsDir: path.join(directory, 'avatars'),
  });
});

afterEach(() => {
  closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
  Object.assign(config, originalConfig);
});

function schema(db: Database): unknown[] {
  return db.query('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name').all();
}

it('bootstraps a fresh installation without retaining an empty upgrade snapshot', async () => {
  await initDatabase();
  await initSchema();
  expect(fs.readdirSync(directory).filter((name) => name.endsWith('.bak'))).toEqual([]);
  await runMigrations();
  expect(fs.readdirSync(directory).filter((name) => name.endsWith('.bak'))).toEqual([]);
  const files = fs
    .readdirSync(config.migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  expect(getDb().query('SELECT name FROM migrations ORDER BY name').all()).toEqual(
    files.map((name) => ({ name }))
  );
  closeDatabase();
  await initDatabase();
  await initSchema();
  await runMigrations();
  expect(fs.readdirSync(directory).filter((name) => name.endsWith('.bak'))).toEqual([]);
});

it('produces identical sqlite_schema for a fresh bootstrap and an existing installation', async () => {
  await initDatabase();
  await initSchema();
  await runMigrations();
  const fresh = schema(getDb());
  closeDatabase();

  config.dbPath = path.join(directory, 'upgraded.db');
  await initDatabase();
  getDb().exec(fixture);
  await initSchema();
  await runMigrations();
  expect(schema(getDb())).toEqual(fresh);
});

it('repairs a missing board-position index without reranking existing positions', async () => {
  await initDatabase();
  const db = getDb();
  db.exec(fixture);
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO reports (rowid, id, project_id, title, metadata, board_position) VALUES
      (7, 'first', 'project', 'First report', '{}', 44.5), (42, 'second', 'project', 'Second report', '{}', -3.25);
    DROP INDEX idx_reports_status_board_position;
    DELETE FROM migrations WHERE name = '012_add_report_board_position.sql';`);
  const rows = db.query('SELECT rowid, * FROM reports ORDER BY rowid').all();
  const before = schema(db);
  const custom = path.join(directory, 'migrations');
  fs.mkdirSync(custom);
  const name = '012_add_report_board_position.sql';
  fs.copyFileSync(path.join(config.migrationsDir, name), path.join(custom, name));
  const statements = spyOn(db, 'exec');
  try {
    new MigrationRunner(db, custom).run();
    expect(db.query('SELECT rowid, * FROM reports ORDER BY rowid').all()).toEqual(rows);
    expect(
      db
        .query(
          "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name != 'idx_reports_status_board_position' ORDER BY type, name"
        )
        .all()
    ).toEqual(before);
    expect(
      db
        .query("SELECT sql FROM sqlite_schema WHERE name = 'idx_reports_status_board_position'")
        .get()
    ).toEqual({
      sql: 'CREATE INDEX idx_reports_status_board_position ON reports(status, board_position)',
    });
    expect(
      statements.mock.calls.some(([sql]) => /(?:ALTER|DROP)\s+TABLE|UPDATE\s+reports/i.test(sql))
    ).toBe(false);
    expect(db.query('SELECT name FROM migrations WHERE name = ?').get(name)).toEqual({ name });
  } finally {
    statements.mockRestore();
  }
});

it('repairs missing portal indexes without rebuilding an already matching reports table', async () => {
  await initDatabase();
  await initSchema();
  await runMigrations();
  const db = getDb();
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO reports (rowid, id, project_id, source, title, description, original_description, board_position, claimable_email, metadata)
      VALUES (37, 'report', 'project', 'portal', 'Portal report', 'Staff edit', 'As submitted', 42.5, 'reporter@example.com', '{}');
    DROP INDEX idx_reports_reporter;
    DROP INDEX idx_reports_claimable;
    DROP INDEX idx_reports_reporter_activity;
    DELETE FROM migrations WHERE name = '015_rebuild_reports_for_portal.sql';`);
  const rows = db.query('SELECT rowid, * FROM reports ORDER BY rowid').all();
  const before = schema(db);
  const search = db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Portal'").all();
  const custom = path.join(directory, 'migrations');
  fs.mkdirSync(custom);
  const name = '015_rebuild_reports_for_portal.sql';
  fs.copyFileSync(path.join(config.migrationsDir, name), path.join(custom, name));
  const statements = spyOn(db, 'exec');
  try {
    new MigrationRunner(db, custom).run();
    expect(db.query('SELECT rowid, * FROM reports ORDER BY rowid').all()).toEqual(rows);
    expect(
      db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Portal'").all()
    ).toEqual(search);
    expect(
      db
        .query(
          "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT IN ('idx_reports_reporter', 'idx_reports_claimable', 'idx_reports_reporter_activity') ORDER BY type, name"
        )
        .all()
    ).toEqual(before);
    expect(
      db
        .query(
          "SELECT name FROM sqlite_schema WHERE name IN ('idx_reports_reporter', 'idx_reports_claimable', 'idx_reports_reporter_activity') ORDER BY name"
        )
        .all()
    ).toEqual([
      { name: 'idx_reports_claimable' },
      { name: 'idx_reports_reporter' },
      { name: 'idx_reports_reporter_activity' },
    ]);
    expect(
      statements.mock.calls.some(([sql]) => /(?:ALTER|DROP)\s+TABLE|UPDATE\s+reports/i.test(sql))
    ).toBe(false);
    expect(db.query('SELECT name FROM migrations WHERE name = ?').get(name)).toEqual({ name });
  } finally {
    statements.mockRestore();
  }
});

it('takes its snapshot before bootstrap writes and leaves existing rows and FTS results unchanged', async () => {
  await initDatabase();
  const db = getDb();
  db.exec(fixture);
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO users (id, email, password_hash, name, role) VALUES ('staff', 'staff@example.com', 'hash', 'Staff', 'editor');
    INSERT INTO reports (rowid, id, project_id, title, description, metadata, board_position, resolved_by, resolved_at)
      VALUES (7, 'first', 'project', 'Searchable report', 'Original text', '{}', 2.5, 'staff', '2026-01-02');
    INSERT INTO reports (rowid, id, project_id, title, metadata, board_position)
      VALUES (42, 'second', 'project', 'Another report', '{}', -1.5);
    INSERT INTO report_history (id, report_id, user_id, action) VALUES ('history', 'first', 'staff', 'created');
    INSERT INTO reporter_messages (id, report_id, user_id, message) VALUES ('message', 'first', 'staff', 'A reply');
    INSERT INTO files (id, report_id, type, filename, path, mime_type, size_bytes)
      VALUES ('file', 'first', 'attachment', 'image.png', 'image.png', 'image/png', 123);
    INSERT INTO user_recent_reports VALUES ('staff', 'first', '2026-01-02');
    INSERT INTO user_pinned_projects (user_id, project_id, position) VALUES ('staff', 'project', 3);
    DELETE FROM migrations WHERE name = '004_add_report_history.sql';
    DROP INDEX idx_report_history_report_id;`);
  db.exec(`UPDATE reports SET created_at = '2026-01-01', updated_at = '2026-01-02';
    INSERT INTO settings (key, value) VALUES ('gamification_enabled', 'true');
    CREATE VIEW report_view AS SELECT id, title FROM reports;
    CREATE VIEW history_view AS SELECT report_id, action FROM report_history;`);
  const tables = [
    'reports',
    'report_history',
    'files',
    'user_recent_reports',
    'user_pinned_projects',
    'projects',
    'users',
  ];
  const queries = tables.map((table) => {
    const columns = db
      .query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)')
      .all(table)
      .map(({ name }) => `"${name}"`);
    return `SELECT rowid, ${columns.join(', ')} FROM ${table} ORDER BY rowid`;
  });
  const rows = queries.map((sql) => db.query(sql).all());
  const staff = await usersRepo.findById('staff');
  if (!staff) throw new Error('Staff fixture missing');
  const now = Date.parse('2026-02-01');
  const legacyMessageTimes = db
    .query<{ userId: string; at: string }, []>(
      'SELECT user_id AS userId, sent_at AS at FROM reporter_messages'
    )
    .all();
  const messageTimes = spyOn(gamificationRepo, 'listReporterMessageTimes').mockReturnValue(
    legacyMessageTimes
  );
  let xp: Awaited<ReturnType<typeof gamificationService.getPersonal>>;
  try {
    xp = await gamificationService.getPersonal(
      staff,
      gamificationRepo.listUserResolutions(['staff']),
      now
    );
  } finally {
    messageTimes.mockRestore();
  }
  if (!xp.success || !xp.value) throw new Error('XP fixture must be active');
  expect(xp.value.progress.xp).toBeGreaterThan(0);
  const search = db
    .query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'")
    .all();

  await initSchema();
  await runMigrations();
  expect(queries.map((sql) => db.query(sql).all())).toEqual(rows);
  expect(
    db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
  ).toEqual(search);
  expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(
    await gamificationService.getPersonal(
      staff,
      gamificationRepo.listUserResolutions(['staff']),
      now
    )
  ).toEqual(xp);
  expect(db.query('SELECT * FROM report_view').all()).toHaveLength(2);
  expect(db.query('SELECT * FROM history_view').all()).toHaveLength(1);
  expect(
    db
      .query(
        'SELECT original_description, original_description_backfilled, reporter_id, claimable_email FROM reports ORDER BY rowid'
      )
      .all()
  ).toEqual([
    {
      original_description: 'Original text',
      original_description_backfilled: 1,
      reporter_id: null,
      claimable_email: null,
    },
    {
      original_description: null,
      original_description_backfilled: 1,
      reporter_id: null,
      claimable_email: null,
    },
  ]);
  for (const table of [
    'reporters',
    'reporter_sessions',
    'reporter_auth_tokens',
    'reporter_email_suppressions',
  ]) {
    expect(db.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  }
  expect((await reportsRepo.findById('first'))?.originalDescriptionBackfilled).toBe(true);
  const upgraded = schema(db);
  await initSchema();
  await runMigrations();
  expect(schema(db)).toEqual(upgraded);
  db.exec(
    "UPDATE reports SET title = 'Updated search', description = 'Staff edit' WHERE id = 'first';"
  );
  expect(db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Updated'").all()).toEqual(
    [{ rowid: 7 }]
  );
  expect(
    db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
  ).toEqual([]);
  expect((await reportsRepo.findById('first'))?.originalDescription).toBe('Original text');

  const [name] = fs.readdirSync(directory).filter((name) => name.endsWith('.bak'));
  const backup = new Database(path.join(directory, name), { readonly: true });
  try {
    expect(
      backup
        .query("SELECT name FROM sqlite_schema WHERE name = 'idx_report_history_report_id'")
        .get()
    ).toBeNull();
    expect(
      backup.query("SELECT name FROM migrations WHERE name = '004_add_report_history.sql'").get()
    ).toBeNull();
    expect(
      backup.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
    ).toEqual(search);
    expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  } finally {
    backup.close();
  }
  closeDatabase();
  config.dbPath = path.join(directory, 'fresh.db');
  await initDatabase();
  await initSchema();
  await runMigrations();
  getDb().exec(`CREATE VIEW report_view AS SELECT id, title FROM reports;
    CREATE VIEW history_view AS SELECT report_id, action FROM report_history;`);
  expect(schema(getDb())).toEqual(upgraded);
});

it('rolls back a failing reports rebuild and leaves a verified restorable backup', async () => {
  await initDatabase();
  const db = getDb();
  db.exec(fixture);
  db.exec(REPORTERS_SCHEMA);
  db.exec("INSERT INTO migrations (name) VALUES ('014_add_reporters.sql');");
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO reports (rowid, id, project_id, title, description, metadata) VALUES (13, 'report', 'project', 'Searchable report', 'Original', '{}');`);
  const before = schema(db);
  const custom = path.join(directory, 'migrations');
  fs.mkdirSync(custom);
  const name = '015_rebuild_reports_for_portal.sql';
  fs.writeFileSync(
    path.join(custom, name),
    fs.readFileSync(path.join(config.migrationsDir, name), 'utf8') + '\nINVALID SQL;'
  );
  expect(() => new MigrationRunner(db, custom).run()).toThrow();
  expect(schema(db)).toEqual(before);
  expect(
    db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
  ).toEqual([{ rowid: 13 }]);
  expect(db.query('SELECT name FROM migrations WHERE name = ?').get(name)).toBeNull();
  const [backupName] = fs.readdirSync(directory).filter((name) => name.endsWith('.bak'));
  const restored = path.join(directory, 'restored.db');
  fs.copyFileSync(path.join(directory, backupName), restored);
  const backup = new Database(restored);
  try {
    expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(backup.query('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(schema(backup)).toEqual(before);
    expect(backup.query('SELECT rowid, description FROM reports').all()).toEqual([
      { rowid: 13, description: 'Original' },
    ]);
    expect(
      backup.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
    ).toEqual([{ rowid: 13 }]);
  } finally {
    backup.close();
  }
});

it('preserves a newly submitted original description through staff edits', async () => {
  await initDatabase();
  await initSchema();
  await runMigrations();
  getDb().exec(
    "INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');"
  );
  const report = await reportsRepo.create({
    projectId: 'project',
    title: 'New report',
    description: 'As submitted',
    metadata: { timestamp: '2026-01-01' },
  });
  expect(report.originalDescription).toBe('As submitted');
  expect(report.originalDescriptionBackfilled).toBe(false);
  expect(report.reporterId).toBeUndefined();
  expect(report.claimableEmail).toBeUndefined();
  await reportsRepo.update(report.id, { description: 'Staff edit' });
  expect((await reportsRepo.findById(report.id))?.originalDescription).toBe('As submitted');
  const settings = await settingsRepo.getAll();
  expect(settings.portalBaseUrl).toBe('');
  expect(settings.reporterPortalLimits).toEqual(DEFAULT_REPORTER_PORTAL_LIMITS);
  const limits = { ...DEFAULT_REPORTER_PORTAL_LIMITS, uploadMbPerReporterPerDay: 500 };
  const saved = await settingsRepo.updateAll({
    portalBaseUrl: 'https://portal.example.com',
    reporterPortalLimits: limits,
  });
  expect(saved.portalBaseUrl).toBe('https://portal.example.com');
  expect(saved.reporterPortalLimits).toEqual(limits);
  expect(await settingsRepo.get('portal_base_url')).toBe('https://portal.example.com');
});

it('enforces reporter identity, token, and session constraints and deletion relationships', async () => {
  await initDatabase();
  await initSchema();
  await runMigrations();
  const db = getDb();
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO users (id, email, name, password_hash) VALUES ('staff', 'staff@example.com', 'Staff', 'hash');
    INSERT INTO reporters (id, email, display_name, suspended_by_user_id, sessions_revoked_by_user_id)
      VALUES ('reporter', 'reporter@example.com', 'Reporter', 'staff', 'staff');
    INSERT INTO reports (id, project_id, source, title, metadata, reporter_id)
      VALUES ('report', 'project', 'portal', 'Portal report', '{}', 'reporter');
    INSERT INTO reporter_sessions (id, token_hash, reporter_id, expires_at, absolute_expires_at)
      VALUES ('session', 'session-hash', 'reporter', '2030-01-01', '2030-03-01');
    INSERT INTO reporter_auth_tokens (id, token_hash, email, purpose, source, report_id, expires_at)
      VALUES ('token', 'token-hash', 'reporter@example.com', 'login', 'request', 'report', '2030-01-01');
    INSERT INTO reporter_email_suppressions (email, source) VALUES ('reporter@example.com', 'unsubscribe');`);
  expect(() =>
    db.run(
      "INSERT INTO reporters (id, email, display_name) VALUES ('other', 'reporter@example.com', 'Other')"
    )
  ).toThrow();
  expect(() =>
    db.run(
      "INSERT INTO reporter_sessions (id, token_hash, reporter_id, expires_at, absolute_expires_at) VALUES ('other', 'session-hash', 'reporter', '2030-01-01', '2030-03-01')"
    )
  ).toThrow();
  expect(() => db.run("UPDATE reporter_auth_tokens SET purpose = 'update'")).toThrow();
  expect(() => db.run("UPDATE reporter_auth_tokens SET source = 'staff'")).toThrow();
  expect(() => db.run("UPDATE reporter_email_suppressions SET source = 'staff'")).toThrow();
  expect(() => db.run("UPDATE reports SET source = 'unknown'")).toThrow();
  expect(() => db.run('UPDATE reports SET original_description_backfilled = 2')).toThrow();
  db.run("DELETE FROM users WHERE id = 'staff'");
  expect(
    db.query('SELECT suspended_by_user_id, sessions_revoked_by_user_id FROM reporters').get()
  ).toEqual({ suspended_by_user_id: null, sessions_revoked_by_user_id: null });
  db.run("DELETE FROM reporters WHERE id = 'reporter'");
  expect(db.query('SELECT reporter_id FROM reports').get()).toEqual({ reporter_id: null });
  expect(db.query('SELECT * FROM reporter_sessions').all()).toEqual([]);
  expect(db.query('SELECT email FROM reporter_email_suppressions').all()).toEqual([
    { email: 'reporter@example.com' },
  ]);
  db.run("DELETE FROM reports WHERE id = 'report'");
  expect(db.query('SELECT report_id FROM reporter_auth_tokens').get()).toEqual({ report_id: null });
  expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('accepts ownership and moderation history with a nullable staff author', async () => {
  await initDatabase();
  await initSchema();
  await runMigrations();
  const db = getDb();
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO reports (id, project_id, title, metadata) VALUES ('report', 'project', 'Report', '{}');`);
  const actions = [
    'owner_assigned',
    'owner_removed',
    'claimable_set',
    'message_hidden',
    'message_unhidden',
  ];
  for (const action of actions) {
    db.run('INSERT INTO report_history (id, report_id, action, user_id) VALUES (?, ?, ?, NULL)', [
      action,
      'report',
      action,
    ]);
  }
  expect(db.query('SELECT action FROM report_history ORDER BY action').all()).toEqual(
    [...actions].sort().map((action) => ({ action }))
  );
  expect(() =>
    db.run(
      "INSERT INTO report_history (id, report_id, action) VALUES ('invalid', 'report', 'invalid')"
    )
  ).toThrow();
});
