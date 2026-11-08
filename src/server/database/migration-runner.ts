import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../utils/logger.js';
import {
  REPORTERS_SCHEMA,
  REPORTS_SCHEMA,
  REPORT_HISTORY_SCHEMA,
  REPORT_PORTAL_INDEXES,
} from './portal-schema.js';
import { rebuildTable } from './table-rebuild.js';

// SQLite retains this formatting in sqlite_schema, so keep it stable across upgrades.
const MIGRATIONS_SCHEMA = `
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now')) NOT NULL
    )
  `;

interface Migration {
  isSatisfied(db: Database): boolean;
  apply(db: Database, sql: string): void;
}

export function hasColumn(db: Database, table: string, column: string): boolean {
  return db.query('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, column) !== null;
}

function hasObjects(db: Database, names: string[]): boolean {
  return names.every((name) => db.query('SELECT 1 FROM sqlite_schema WHERE name = ?').get(name));
}

function addMissingColumns(db: Database, sql: string): void {
  db.exec(
    sql.replace(
      /ALTER TABLE (\w+) ADD COLUMN (\w+) [^;]+;/g,
      (statement, table: string, column: string) => (hasColumn(db, table, column) ? '' : statement)
    )
  );
}

function schemaMatches(db: Database, sql: string): boolean {
  return sql
    .split(';')
    .filter((statement) => statement.trim())
    .every((statement) => {
      const canonical = statement.trim().replace(' IF NOT EXISTS', '');
      const name = /^CREATE (?:TABLE|INDEX) (\w+)/.exec(canonical)?.[1];
      if (!name) throw new Error('Expected a CREATE TABLE or CREATE INDEX definition');
      return (
        db
          .query<{ sql: string }, [string]>('SELECT sql FROM sqlite_schema WHERE name = ?')
          .get(name)?.sql === canonical
      );
    });
}

function copyColumns(db: Database, table: string): Record<string, string> {
  return Object.fromEntries(
    db
      .query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)')
      .all(table)
      .map(({ name }) => [name, `"${name.replaceAll('"', '""')}"`])
  );
}

const migrations: Record<string, Migration> = {
  '003_add_reporter_locale.sql': {
    isSatisfied: (db) => hasColumn(db, 'reports', 'reporter_locale'),
    apply: addMissingColumns,
  },
  '004_add_report_history.sql': {
    isSatisfied: (db) =>
      ['id', 'report_id', 'user_id', 'action', 'old_value', 'new_value', 'created_at'].every(
        (column) => hasColumn(db, 'report_history', column)
      ) && hasObjects(db, ['idx_report_history_report_id', 'idx_report_history_created_at']),
    apply: (db, sql) =>
      db.exec(
        sql
          .replace('CREATE TABLE report_history', 'CREATE TABLE IF NOT EXISTS report_history')
          .replaceAll('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')
      ),
  },
  '006_add_user_password_fields.sql': {
    isSatisfied: (db) =>
      hasColumn(db, 'users', 'must_change_password') &&
      hasColumn(db, 'users', 'password_changed_at'),
    apply: addMissingColumns,
  },
  '008_add_user_api_access.sql': {
    isSatisfied: (db) =>
      hasColumn(db, 'users', 'api_access_enabled') &&
      hasObjects(db, ['api_tokens']) &&
      db
        .query(
          `SELECT 1 FROM users JOIN api_tokens ON api_tokens.user_id = users.id
           WHERE users.api_access_enabled = 0 AND api_tokens.revoked_at IS NULL
             AND (api_tokens.expires_at IS NULL OR api_tokens.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           LIMIT 1`
        )
        .get() === null,
    apply: addMissingColumns,
  },
  '014_add_report_board_position.sql': {
    isSatisfied: (db) =>
      hasColumn(db, 'reports', 'board_position') &&
      hasObjects(db, ['idx_reports_status_board_position']),
    apply: (db, sql) => {
      if (!hasColumn(db, 'reports', 'board_position')) db.exec(sql);
      else
        db.exec(
          'CREATE INDEX IF NOT EXISTS idx_reports_status_board_position ON reports(status, board_position)'
        );
    },
  },
  '018_add_reporters.sql': {
    isSatisfied: (db) => schemaMatches(db, REPORTERS_SCHEMA),
    apply: (db, sql) => db.exec(sql),
  },
  '019_rebuild_reports_for_portal.sql': {
    isSatisfied: (db) =>
      schemaMatches(db, REPORTS_SCHEMA) && schemaMatches(db, REPORT_PORTAL_INDEXES),
    apply: (db, sql) => {
      if (!schemaMatches(db, REPORTS_SCHEMA)) {
        rebuildTable(
          db,
          'reports',
          sql,
          {
            reporter_id: 'NULL',
            claimable_email: 'NULL',
            original_description: 'description',
            original_description_backfilled: '1',
            owner_seen_at: 'NULL',
            last_reporter_activity_at: 'NULL',
            reporter_activity_seen_at: 'NULL',
            ...copyColumns(db, 'reports'),
          },
          'reports_fts'
        );
      }
      db.exec(REPORT_PORTAL_INDEXES);
    },
  },
  '020_rebuild_report_history_actions.sql': {
    isSatisfied: (db) => schemaMatches(db, REPORT_HISTORY_SCHEMA),
    apply: (db, sql) => rebuildTable(db, 'report_history', sql, copyColumns(db, 'report_history')),
  },
};

function checkIntegrity(db: Database): void {
  const rows = db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').all();
  if (rows.length !== 1 || rows[0].integrity_check !== 'ok') {
    throw new Error('Database integrity check failed');
  }
}

function checkForeignKeys(db: Database): void {
  if (db.query('PRAGMA foreign_key_check').all().length > 0) {
    throw new Error('Database foreign key check failed');
  }
}

function verifyBackup(filename: string): void {
  const backup = new Database(filename, { readonly: true });
  try {
    checkIntegrity(backup);
  } finally {
    backup.close();
  }
}

export class MigrationRunner {
  private backupPath: string | undefined;
  private freshInstall: boolean | undefined;

  constructor(
    private readonly db: Database,
    private readonly directory: string
  ) {}

  private appliedNames(): Set<string> {
    if (!hasObjects(this.db, ['migrations'])) return new Set();
    return new Set(
      this.db
        .query<{ name: string }, []>('SELECT name FROM migrations')
        .all()
        .map((row) => row.name)
    );
  }

  private pendingFiles(): string[] {
    if (!fs.existsSync(this.directory)) return [];
    const applied = this.appliedNames();
    return fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.sql') && !applied.has(file))
      .sort();
  }

  prepare(): void {
    if (this.db.inTransaction) throw new Error('Migrations cannot run inside a transaction');
    if (this.backupPath || this.pendingFiles().length === 0) return;

    let stagingDirectory: string | undefined;
    try {
      const databasePath = path.resolve(this.db.filename);
      const parent = path.dirname(databasePath);
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith('.bugpin-upgrade-')) {
          fs.rmSync(path.join(parent, entry.name), { recursive: true });
        }
      }
      // Bootstrap creates user tables before run(), so retain the state seen before bootstrap.
      this.freshInstall ??=
        this.db
          .query(
            "SELECT 1 FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND tbl_name != 'migrations' LIMIT 1"
          )
          .get() === null;
      if (this.freshInstall) return;

      const applied = [...this.appliedNames()].sort();
      const state = createHash('sha256').update(JSON.stringify(applied)).digest('hex');
      const prefix = `${path.basename(databasePath)}.pre-upgrade-`;
      const previous = fs
        .readdirSync(parent)
        .filter((name) => name.startsWith(prefix) && name.endsWith(`-${state}-first.bak`));
      if (previous.length > 0) {
        const retainedPath = path.join(parent, previous[0]);
        try {
          verifyBackup(retainedPath);
        } catch (error) {
          throw new Error(
            `Retained pre-upgrade snapshot failed verification: ${retainedPath}. Preserve other recovery snapshots and restore or move this file before retrying.`,
            { cause: error }
          );
        }
        // Keep the original recovery point while replacing snapshots from failed retries.
        for (const name of fs.readdirSync(parent)) {
          if (name.startsWith(prefix) && name.endsWith(`-${state}-retry.bak`)) {
            fs.unlinkSync(path.join(parent, name));
          }
        }
      }
      const space = fs.statfsSync(parent);
      const { page_count: pageCount } = this.db
        .query<{ page_count: number }, []>('PRAGMA page_count')
        .get()!;
      const { page_size: pageSize } = this.db
        .query<{ page_size: number }, []>('PRAGMA page_size')
        .get()!;
      const required = Math.ceil(
        Math.max(fs.statSync(databasePath).size, pageCount * pageSize) * 1.2
      );
      if (space.bavail * space.bsize < required) {
        throw new Error(`Insufficient disk space for database backup: ${required} bytes required`);
      }

      const version = applied.at(-1)?.split('_')[0] ?? '000';
      const timestamp = `${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}`;
      const kind = previous.length === 0 ? 'first' : 'retry';
      const backupPath = `${databasePath}.pre-upgrade-${version}-${timestamp}-${state}-${kind}.bak`;
      stagingDirectory = fs.mkdtempSync(path.join(parent, '.bugpin-upgrade-'));
      const stagingPath = path.join(stagingDirectory, 'snapshot.db');
      this.db.query('VACUUM INTO ?').run(stagingPath);
      fs.chmodSync(stagingPath, 0o600);
      verifyBackup(stagingPath);
      fs.renameSync(stagingPath, backupPath);
      this.backupPath = backupPath;
      logger.info('Verified pre-upgrade database backup', { path: backupPath });
    } catch (error) {
      logger.error('Cannot create a verified pre-upgrade database backup; startup aborted', error);
      throw error;
    } finally {
      if (stagingDirectory) fs.rmSync(stagingDirectory, { recursive: true, force: true });
    }
  }

  run(): void {
    this.prepare();
    this.db.exec(MIGRATIONS_SCHEMA);

    let migrated = false;
    for (const file of this.pendingFiles()) {
      logger.info('Applying migration', { file });
      const migration = migrations[file];
      const sql = fs.readFileSync(path.join(this.directory, file), 'utf8');
      this.db.exec('PRAGMA foreign_keys = OFF');
      try {
        this.db.exec('BEGIN IMMEDIATE');
        if (!migration?.isSatisfied(this.db)) {
          if (migration) migration.apply(this.db, sql);
          else this.db.exec(sql);
        }
        if (migration && !migration.isSatisfied(this.db)) {
          throw new Error(`Migration did not produce the expected schema: ${file}`);
        }
        checkForeignKeys(this.db);
        this.db.run('INSERT INTO migrations (name) VALUES (?)', [file]);
        this.db.exec('COMMIT');
        migrated = true;
      } catch (error) {
        if (this.db.inTransaction) this.db.exec('ROLLBACK');
        logger.error('Migration failed; pre-upgrade backup retained', error, {
          file,
          backupPath: this.backupPath,
        });
        throw error;
      } finally {
        this.db.exec('PRAGMA foreign_keys = ON');
      }
    }

    if (migrated) {
      checkIntegrity(this.db);
      checkForeignKeys(this.db);
      if (this.backupPath) {
        this.rotateBackups();
        this.backupPath = undefined;
      }
      this.freshInstall = undefined;
    }
    logger.info('All migrations applied');
  }

  private rotateBackups(): void {
    const databasePath = path.resolve(this.db.filename);
    const directory = path.dirname(databasePath);
    const prefix = `${path.basename(databasePath)}.pre-upgrade-`;
    const backups = fs
      .readdirSync(directory)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
      .map((name) => ({ name, modified: fs.statSync(path.join(directory, name)).mtimeMs }))
      .sort(
        (a, b) =>
          Number(path.join(directory, b.name) === this.backupPath) -
            Number(path.join(directory, a.name) === this.backupPath) ||
          b.modified - a.modified ||
          b.name.localeCompare(a.name)
      );
    for (const backup of backups.slice(2)) fs.unlinkSync(path.join(directory, backup.name));
  }
}
