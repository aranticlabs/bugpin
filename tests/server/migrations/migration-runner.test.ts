import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { MigrationRunner } from '../../../src/server/database/migration-runner';

let directory: string;
let sqlDirectory: string;
let databasePath: string;
let db: Database;
let runner: MigrationRunner;
const sourceDirectory = path.resolve(import.meta.dir, '../../../src/server/database/migrations');

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-migrations-'));
  sqlDirectory = path.join(directory, 'migrations');
  fs.mkdirSync(sqlDirectory);
  databasePath = path.join(directory, 'bugpin.db');
  db = new Database(databasePath);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE existing (id INTEGER PRIMARY KEY, value TEXT);
    INSERT INTO existing VALUES (17, 'before');`);
  runner = new MigrationRunner(db, sqlDirectory);
});

afterEach(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function writeMigration(name: string, sql: string): void {
  fs.writeFileSync(path.join(sqlDirectory, name), sql);
}

function backups(): string[] {
  return fs.readdirSync(directory).filter((name) => name.endsWith('.bak'));
}

describe('migration runner', () => {
  it('takes no backup without pending migrations, including a missing directory', () => {
    runner.run();
    fs.rmdirSync(sqlDirectory);
    runner.run();
    expect(backups()).toEqual([]);
  });

  it('backs up committed WAL content once before any upgrade writes', () => {
    writeMigration('001_test.sql', 'CREATE TABLE first_change (id INTEGER);');
    writeMigration('002_test.sql', "UPDATE existing SET value = 'after';");
    runner.prepare();
    const [backupName] = backups();
    expect(backupName).toContain('.pre-upgrade-000-');
    const backupPath = path.join(directory, backupName);
    expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);

    runner.run();
    runner.run();
    expect(backups()).toEqual([backupName]);
    const backup = new Database(backupPath, { readonly: true });
    try {
      expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(backup.query('SELECT * FROM existing').all()).toEqual([{ id: 17, value: 'before' }]);
      expect(
        backup
          .query("SELECT name FROM sqlite_schema WHERE name IN ('migrations', 'first_change')")
          .all()
      ).toEqual([]);
    } finally {
      backup.close();
    }
    expect(db.query('SELECT value FROM existing').get()).toEqual({ value: 'after' });
  });

  it('rolls back a failing file and its ledger entry and restores the pre-run snapshot', () => {
    writeMigration('001_test.sql', 'CREATE TABLE committed (id INTEGER);');
    writeMigration(
      '002_test.sql',
      "UPDATE existing SET value = 'lost'; CREATE TABLE rolled_back (id INTEGER); INVALID SQL;"
    );
    expect(() => runner.run()).toThrow();
    expect(db.inTransaction).toBe(false);
    expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(db.query('SELECT value FROM existing').get()).toEqual({ value: 'before' });
    expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'rolled_back'").get()).toBeNull();
    expect(db.query('SELECT name FROM migrations').all()).toEqual([{ name: '001_test.sql' }]);
    expect(backups()).toHaveLength(1);

    const restoredPath = path.join(directory, 'restored.db');
    fs.copyFileSync(path.join(directory, backups()[0]), restoredPath);
    const restored = new Database(restoredPath);
    try {
      expect(restored.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(restored.query('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(restored.query('SELECT * FROM existing').all()).toEqual([{ id: 17, value: 'before' }]);
      expect(
        restored
          .query(
            "SELECT name FROM sqlite_schema WHERE name IN ('committed', 'rolled_back', 'migrations')"
          )
          .all()
      ).toEqual([]);
    } finally {
      restored.close();
    }
  });

  it('keeps old backups during failure and rotates to two only after successful validation', () => {
    for (const version of ['001', '002', '003']) {
      const old = `${databasePath}.pre-upgrade-${version}-old.bak`;
      db.query('VACUUM INTO ?').run(old);
      fs.utimesSync(old, Number(version), Number(version));
    }
    writeMigration('001_test.sql', 'INVALID SQL;');
    expect(() => runner.run()).toThrow();
    expect(backups()).toHaveLength(4);
    const current = backups().find((name) => !name.endsWith('-old.bak'))!;

    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    runner.run();
    expect(backups().sort()).toEqual([current, 'bugpin.db.pre-upgrade-003-old.bak'].sort());
  });

  it('rejects insufficient space before writing the backup or migration ledger', () => {
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    const space = fs.statfsSync(directory);
    const statfs = spyOn(fs, 'statfsSync').mockReturnValue({ ...space, bavail: 0 });
    try {
      expect(() => runner.run()).toThrow('Insufficient disk space');
      expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'migrations'").get()).toBeNull();
      expect(backups()).toEqual([]);
    } finally {
      statfs.mockRestore();
    }
  });

  it('aborts on backup write failure without changing the database', () => {
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    const open = spyOn(fs, 'mkdtempSync').mockImplementation(() => {
      throw new Error('write denied');
    });
    try {
      expect(() => runner.run()).toThrow('write denied');
      expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'migrations'").get()).toBeNull();
      expect(backups()).toEqual([]);
    } finally {
      open.mockRestore();
    }
  });

  it('aborts when the backup fails integrity verification and removes the incomplete copy', () => {
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    const query = Database.prototype.query;
    const verification = spyOn(Database.prototype, 'query').mockImplementation(function (
      this: Database,
      sql: string
    ) {
      return query.call(
        this,
        this.filename.endsWith('snapshot.db') && sql === 'PRAGMA integrity_check'
          ? "SELECT 'corrupt' AS integrity_check"
          : sql
      );
    } as Database['query']);
    try {
      expect(() => runner.run()).toThrow('Database integrity check failed');
      expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'migrations'").get()).toBeNull();
      expect(backups()).toEqual([]);
    } finally {
      verification.mockRestore();
    }
  });

  it('rolls back foreign key violations and retains the backup', () => {
    writeMigration(
      '001_test.sql',
      'CREATE TABLE children (parent INTEGER REFERENCES existing(id)); INSERT INTO children VALUES (99);'
    );
    expect(() => runner.run()).toThrow('foreign key check failed');
    expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'children'").get()).toBeNull();
    expect(db.query('SELECT * FROM migrations').all()).toEqual([]);
    expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(backups()).toHaveLength(1);
  });

  it('does not rotate backups when final validation fails', () => {
    for (const version of ['001', '002', '003']) {
      db.query('VACUUM INTO ?').run(`${databasePath}.pre-upgrade-${version}-old.bak`);
    }
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    const query = db.query;
    const validation = spyOn(db, 'query').mockImplementation(function (
      this: Database,
      sql: string
    ) {
      return query.call(
        this,
        sql === 'PRAGMA integrity_check' ? "SELECT 'corrupt' AS integrity_check" : sql
      );
    } as Database['query']);
    try {
      expect(() => runner.run()).toThrow('integrity check failed');
      expect(backups()).toHaveLength(4);
    } finally {
      validation.mockRestore();
    }
  });

  it('retains the current snapshot even when its filesystem timestamp is older', () => {
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    runner.prepare();
    const current = backups()[0];
    fs.utimesSync(path.join(directory, current), 1, 1);
    for (const version of ['001', '002']) {
      db.query('VACUUM INTO ?').run(`${databasePath}.pre-upgrade-${version}-old.bak`);
    }
    runner.run();
    expect(backups()).toHaveLength(2);
    expect(backups()).toContain(current);
  });

  it('rolls back schema changes if recording the migration fails', () => {
    runner.run();
    db.exec(
      `CREATE TRIGGER reject_migration BEFORE INSERT ON migrations BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END;`
    );
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    expect(() => runner.run()).toThrow('ledger unavailable');
    expect(db.query("SELECT name FROM sqlite_schema WHERE name = 'upgraded'").get()).toBeNull();
    expect(db.query('SELECT * FROM migrations').all()).toEqual([]);
    expect(backups()).toHaveLength(1);
  });

  it('rejects nested transactions without rolling back the caller', () => {
    db.exec('BEGIN');
    expect(() => runner.run()).toThrow('cannot run inside a transaction');
    expect(db.inTransaction).toBe(true);
    db.exec('ROLLBACK');
  });

  it('completes partially bootstrapped columns and preserves API access for usable tokens', () => {
    db.exec(`CREATE TABLE reports (id TEXT PRIMARY KEY, reporter_locale TEXT NOT NULL DEFAULT 'en');
      CREATE TABLE users (id TEXT PRIMARY KEY, must_change_password INTEGER NOT NULL DEFAULT 0,
        api_access_enabled INTEGER NOT NULL DEFAULT 0);
      INSERT INTO users (id) VALUES ('staff');
      CREATE TABLE api_tokens (user_id TEXT, revoked_at TEXT, expires_at TEXT);
      INSERT INTO api_tokens VALUES ('staff', NULL, NULL);`);
    for (const name of [
      '003_add_reporter_locale.sql',
      '004_add_report_history.sql',
      '006_add_user_password_fields.sql',
      '008_add_user_api_access.sql',
    ]) {
      writeMigration(name, fs.readFileSync(path.join(sourceDirectory, name), 'utf8'));
    }
    runner.run();
    expect(
      db
        .query("SELECT name FROM pragma_table_info('users') WHERE name = 'password_changed_at'")
        .get()
    ).not.toBeNull();
    expect(db.query('SELECT api_access_enabled FROM users').get()).toEqual({
      api_access_enabled: 1,
    });
    expect(db.query('SELECT COUNT(*) AS count FROM migrations').get()).toEqual({ count: 4 });
    db.run('UPDATE users SET api_access_enabled = 0');
    runner.run();
    expect(db.query('SELECT api_access_enabled FROM users').get()).toEqual({
      api_access_enabled: 0,
    });
  });
});
