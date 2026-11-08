import { afterEach, beforeEach, expect, it } from 'bun:test';
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

it('takes its snapshot before bootstrap writes and leaves existing rows and FTS results unchanged', async () => {
  await initDatabase();
  const db = getDb();
  db.exec(fixture);
  db.exec(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('project', 'Project', 'hash', 'prefix');
    INSERT INTO users (id, email, password_hash, name) VALUES ('staff', 'staff@example.com', 'hash', 'Staff');
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
  const tables = [
    'reports',
    'report_history',
    'reporter_messages',
    'files',
    'user_recent_reports',
    'user_pinned_projects',
    'projects',
    'users',
  ];
  const rows = tables.map((table) =>
    db.query(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all()
  );
  const search = db
    .query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'")
    .all();

  await initSchema();
  await runMigrations();
  expect(
    tables.map((table) => db.query(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all())
  ).toEqual(rows);
  expect(
    db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
  ).toEqual(search);
  expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);

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
});
