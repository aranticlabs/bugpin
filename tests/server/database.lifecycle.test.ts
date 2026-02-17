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

  it('runs migrations when none exist', async () => {
    await initDatabase();
    await initSchema();
    await runMigrations();
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
        | { name?: string }
        | undefined;
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
          ],
        );
        throw new Error('boom');
      }),
    ).toThrow();

    const count = db.query('SELECT COUNT(*) as count FROM projects').get() as { count: number };
    expect(count.count).toBe(0);
  });
});
