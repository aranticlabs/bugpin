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
  transaction,
} from '../../src/server/database/database';

const originalConfig = { ...config };
let tempDir = '';
const migrationsDir = path.resolve(import.meta.dir, '../../src/server/database/migrations');

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-db-'));
  Object.assign(config, {
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'bugpin.db'),
    uploadsDir: path.join(tempDir, 'uploads'),
    screenshotsDir: path.join(tempDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(tempDir, 'uploads', 'attachments'),
    brandingDir: path.join(tempDir, 'uploads', 'branding'),
    avatarsDir: path.join(tempDir, 'uploads', 'avatars'),
  });
});

afterAll(() => {
  closeDatabase();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  Object.assign(config, originalConfig);
});

beforeEach(() => {
  closeDatabase();
});

describe('database lifecycle', () => {
  it('throws when accessing db before initialization', () => {
    expect(() => getDb()).toThrow('Database not initialized. Call initDatabase() first.');
  });

  it('throws when initializing schema without a database', async () => {
    await expect(initSchema()).rejects.toThrow('Database not initialized');
  });

  it('creates missing data directory on init', async () => {
    const snapshot = { ...config };
    const baseDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-db-missing-'));
    const dataDir = path.join(baseDir, 'data');

    Object.assign(config, {
      dataDir,
      dbPath: path.join(dataDir, 'bugpin.db'),
      uploadsDir: path.join(dataDir, 'uploads'),
      screenshotsDir: path.join(dataDir, 'uploads', 'screenshots'),
      attachmentsDir: path.join(dataDir, 'uploads', 'attachments'),
      brandingDir: path.join(dataDir, 'uploads', 'branding'),
      avatarsDir: path.join(dataDir, 'uploads', 'avatars'),
    });

    try {
      await initDatabase();
      expect(fs.existsSync(dataDir)).toBe(true);
    } finally {
      closeDatabase();
      fs.rmSync(baseDir, { recursive: true, force: true });
      Object.assign(config, snapshot);
    }
  });

  it('initializes database and schema', async () => {
    await initDatabase();
    await initSchema();

    const db = getDb();
    const table = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
      .get() as { name?: string } | undefined;

    expect(table?.name).toBe('projects');
    expect(fs.existsSync(config.screenshotsDir)).toBe(true);
  });

  it('adds missing report source column before creating source indexes', async () => {
    const snapshot = { ...config };
    const baseDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-db-legacy-reports-'));

    Object.assign(config, {
      dataDir: baseDir,
      dbPath: path.join(baseDir, 'bugpin.db'),
      uploadsDir: path.join(baseDir, 'uploads'),
      screenshotsDir: path.join(baseDir, 'uploads', 'screenshots'),
      attachmentsDir: path.join(baseDir, 'uploads', 'attachments'),
      brandingDir: path.join(baseDir, 'uploads', 'branding'),
      avatarsDir: path.join(baseDir, 'uploads', 'avatars'),
    });

    try {
      await initDatabase();

      const db = getDb();
      db.exec(`
        CREATE TABLE reports (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'open' NOT NULL,
          priority TEXT DEFAULT 'medium' NOT NULL,
          annotations JSON,
          metadata JSON NOT NULL,
          reporter_email TEXT,
          reporter_name TEXT,
          assigned_to TEXT,
          custom_fields JSON DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')) NOT NULL,
          updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
          resolved_at TEXT,
          resolved_by TEXT,
          closed_at TEXT,
          forwarded_to JSON DEFAULT '[]',
          github_sync_status TEXT NULL,
          github_sync_error TEXT NULL,
          github_issue_number INTEGER NULL,
          github_issue_url TEXT NULL,
          github_synced_at TEXT NULL
        )
      `);

      await initSchema();

      const sourceColumn = db
        .query("SELECT name FROM pragma_table_info('reports') WHERE name = 'source'")
        .get() as { name?: string } | undefined;
      const sourceIndex = db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_reports_source'"
        )
        .get() as { name?: string } | undefined;

      expect(sourceColumn?.name).toBe('source');
      expect(sourceIndex?.name).toBe('idx_reports_source');
    } finally {
      closeDatabase();
      fs.rmSync(baseDir, { recursive: true, force: true });
      Object.assign(config, snapshot);
    }
  });

  it('runs migrations when none exist', async () => {
    await initDatabase();
    await initSchema();
    await runMigrations();

    const table = getDb()
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widget_version_observations'"
      )
      .get() as { name?: string } | undefined;
    expect(table?.name).toBe('widget_version_observations');
  });

  it('adds widget observations to an existing pre-migration database', async () => {
    const snapshot = { ...config };
    const baseDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-db-widget-migration-'));

    Object.assign(config, {
      dataDir: baseDir,
      dbPath: path.join(baseDir, 'bugpin.db'),
      uploadsDir: path.join(baseDir, 'uploads'),
      screenshotsDir: path.join(baseDir, 'uploads', 'screenshots'),
      attachmentsDir: path.join(baseDir, 'uploads', 'attachments'),
      brandingDir: path.join(baseDir, 'uploads', 'branding'),
      avatarsDir: path.join(baseDir, 'uploads', 'avatars'),
    });

    try {
      await initDatabase();
      const db = getDb();
      db.exec(`
        CREATE TABLE projects (id TEXT PRIMARY KEY);
        CREATE TABLE migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          applied_at TEXT DEFAULT (datetime('now')) NOT NULL
        );
      `);
      for (const name of [
        '001_add_reporter_messages.sql',
        '002_add_report_source.sql',
        '003_add_reporter_locale.sql',
        '004_add_report_history.sql',
      ]) {
        db.run('INSERT INTO migrations (name) VALUES (?)', [name]);
      }

      await runMigrations();

      const table = db
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'widget_version_observations'"
        )
        .get() as { name?: string } | undefined;
      expect(table?.name).toBe('widget_version_observations');
    } finally {
      closeDatabase();
      fs.rmSync(baseDir, { recursive: true, force: true });
      Object.assign(config, snapshot);
    }
  });

  it('skips migrations when directory is missing', async () => {
    await initDatabase();
    await initSchema();

    // Only run this test if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      // Directory already doesn't exist, just verify migrations run without error
      await runMigrations();
      return;
    }

    const backupDir = `${migrationsDir}-bak`;
    fs.renameSync(migrationsDir, backupDir);

    try {
      await runMigrations();
    } finally {
      fs.renameSync(backupDir, migrationsDir);
    }
  });

  it('applies pending migrations', async () => {
    // Skip test if migrations directory doesn't exist
    if (!fs.existsSync(migrationsDir)) {
      return;
    }

    await initDatabase();
    await initSchema();

    const db = getDb();
    const migrationName = `999-test-${Date.now()}.sql`;
    const migrationPath = path.join(migrationsDir, migrationName);

    fs.writeFileSync(migrationPath, 'CREATE TABLE IF NOT EXISTS test_migration (id INTEGER);');

    try {
      await runMigrations();
      const applied = db.query('SELECT name FROM migrations WHERE name = ?').get(migrationName) as
        { name?: string } | undefined;
      expect(applied?.name).toBe(migrationName);
    } finally {
      fs.rmSync(migrationPath, { force: true });
      db.run('DELETE FROM migrations WHERE name = ?', [migrationName]);
    }
  });

  it('throws when migration SQL fails', async () => {
    // Skip test if migrations directory doesn't exist
    if (!fs.existsSync(migrationsDir)) {
      return;
    }

    await initDatabase();
    await initSchema();

    const migrationName = `999-bad-${Date.now()}.sql`;
    const migrationPath = path.join(migrationsDir, migrationName);
    fs.writeFileSync(migrationPath, 'INVALID SQL;');

    try {
      await expect(runMigrations()).rejects.toThrow();
    } finally {
      fs.rmSync(migrationPath, { force: true });
    }
  });

  it('rolls back transactions on errors', async () => {
    await initDatabase();
    await initSchema();
    const db = getDb();
    expect(() =>
      transaction(() => {
        db.run(
          'INSERT INTO projects (id, name, api_key, settings, reports_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            'proj_tx',
            'Tx Project',
            'proj_tx_key',
            '{}',
            0,
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );
        throw new Error('boom');
      })
    ).toThrow();

    const count = db.query('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    expect(count.count).toBe(0);
  });
});
