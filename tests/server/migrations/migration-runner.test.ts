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
  it('does not validate a database when no migration is pending', () => {
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    runner.run();
    db.exec(`PRAGMA foreign_keys = OFF;
      CREATE TABLE children (parent INTEGER REFERENCES existing(id));
      INSERT INTO children VALUES (99);
      PRAGMA foreign_keys = ON;`);
    const query = db.query;
    const validation = spyOn(db, 'query').mockImplementation(function (
      this: Database,
      sql: string
    ) {
      if (sql === 'PRAGMA integrity_check' || sql === 'PRAGMA foreign_key_check') {
        throw new Error('Unexpected migration validation');
      }
      return query.call(this, sql);
    } as Database['query']);
    try {
      expect(() => runner.run()).not.toThrow();
      expect(() => new MigrationRunner(db, sqlDirectory).run()).not.toThrow();
      expect(
        validation.mock.calls.some(
          ([sql]) => sql === 'PRAGMA integrity_check' || sql === 'PRAGMA foreign_key_check'
        )
      ).toBe(false);
    } finally {
      validation.mockRestore();
    }
    expect(db.query('PRAGMA foreign_key_check').all()).toHaveLength(1);
  });

  it('validates a run that only records an already satisfied migration', () => {
    db.exec("CREATE TABLE reports (reporter_locale TEXT NOT NULL DEFAULT 'en');");
    writeMigration(
      '003_add_reporter_locale.sql',
      fs.readFileSync(path.join(sourceDirectory, '003_add_reporter_locale.sql'), 'utf8')
    );
    const validation = spyOn(db, 'query');
    try {
      runner.run();
      expect(validation.mock.calls.some(([sql]) => sql === 'PRAGMA integrity_check')).toBe(true);
      expect(validation.mock.calls.some(([sql]) => sql === 'PRAGMA foreign_key_check')).toBe(true);
      expect(db.query('SELECT name FROM migrations').all()).toEqual([
        { name: '003_add_reporter_locale.sql' },
      ]);
    } finally {
      validation.mockRestore();
    }
  });

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

  it('skips a migration recorded by another runner between pending selection and the write lock', () => {
    const name = '001_test.sql';
    const sql =
      "CREATE TABLE applied_once (id INTEGER); INSERT INTO applied_once VALUES (1); UPDATE existing SET value = 'after';";
    writeMigration(name, sql);
    runner.prepare();
    const peer = new Database(databasePath);
    const peerRunner = new MigrationRunner(peer, sqlDirectory);
    const execute = db.exec;
    let peerRan = false;
    const validation = spyOn(db, 'query');
    const acquisition = spyOn(db, 'exec').mockImplementation(function (
      this: Database,
      statement: string
    ) {
      if (statement === 'BEGIN IMMEDIATE' && !peerRan) {
        peerRan = true;
        peerRunner.run();
        for (const version of ['001', '002']) {
          const old = `${databasePath}.pre-upgrade-${version}-old.bak`;
          peer.query('VACUUM INTO ?').run(old);
          fs.utimesSync(old, 1, 1);
        }
      }
      return execute.call(this, statement);
    });
    try {
      expect(() => runner.run()).not.toThrow();
      expect(peerRan).toBe(true);
      expect(acquisition.mock.calls.some(([statement]) => statement === sql)).toBe(false);
      expect(db.query('SELECT * FROM applied_once').all()).toEqual([{ id: 1 }]);
      expect(db.query('SELECT value FROM existing').get()).toEqual({ value: 'after' });
      expect(db.query('SELECT name FROM migrations').all()).toEqual([{ name }]);
      expect(
        validation.mock.calls.some(([statement]) => statement === 'PRAGMA integrity_check')
      ).toBe(true);
      expect(
        validation.mock.calls.some(([statement]) => statement === 'PRAGMA foreign_key_check')
      ).toBe(true);
      expect(backups()).toHaveLength(2);
      expect(backups().some((name) => name.endsWith('-old.bak'))).toBe(false);
      expect(db.inTransaction).toBe(false);
      expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    } finally {
      acquisition.mockRestore();
      validation.mockRestore();
      peer.close();
    }
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

  it('bounds snapshots across failing restarts while retaining the original and latest data', () => {
    writeMigration('001_test.sql', 'CREATE TABLE rolled_back (id INTEGER); INVALID SQL;');
    expect(() => runner.run()).toThrow();
    const original = backups()[0];
    for (let attempt = 1; attempt <= 5; attempt++) {
      db.close();
      db = new Database(databasePath);
      db.run('UPDATE existing SET value = ?', [`attempt-${attempt}`]);
      expect(() => new MigrationRunner(db, sqlDirectory).run()).toThrow();
      expect(backups()).toHaveLength(2);
      expect(backups()).toContain(original);
      const latest = backups().find((name) => name !== original)!;
      const backup = new Database(path.join(directory, latest), { readonly: true });
      try {
        expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
        expect(backup.query('SELECT value FROM existing').get()).toEqual({
          value: `attempt-${attempt}`,
        });
      } finally {
        backup.close();
      }
    }
    const backup = new Database(path.join(directory, original), { readonly: true });
    try {
      expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(backup.query('SELECT value FROM existing').get()).toEqual({ value: 'before' });
    } finally {
      backup.close();
    }
  });

  it('identifies a corrupt retained first snapshot and preserves valid retry recovery points', () => {
    writeMigration('001_test.sql', 'INVALID SQL;');
    expect(() => runner.run()).toThrow();
    const original = backups()[0];
    expect(() => new MigrationRunner(db, sqlDirectory).run()).toThrow();
    const retained = backups().sort();
    const retry = retained.find((name) => name !== original)!;
    const originalPath = path.join(directory, original);
    fs.writeFileSync(originalPath, 'corrupt');
    const restarted = new MigrationRunner(db, sqlDirectory);
    expect(() => restarted.run()).toThrow(
      `Retained pre-upgrade snapshot failed verification: ${originalPath}`
    );
    expect(backups().sort()).toEqual(retained);
    const backup = new Database(path.join(directory, retry), { readonly: true });
    try {
      expect(backup.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
      expect(backup.query('SELECT value FROM existing').get()).toEqual({ value: 'before' });
    } finally {
      backup.close();
    }
  });

  it('cleans abandoned staging directories before checking available disk space', () => {
    writeMigration('001_test.sql', 'CREATE TABLE upgraded (id INTEGER);');
    const stale = path.join(directory, '.bugpin-upgrade-abandoned');
    const recent = path.join(directory, '.bugpin-upgrade-active');
    const unrelated = path.join(directory, 'unrelated');
    fs.mkdirSync(stale);
    fs.writeFileSync(path.join(stale, 'snapshot.db'), new Uint8Array(1024 * 1024));
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(stale, oldTime, oldTime);
    fs.mkdirSync(recent);
    fs.writeFileSync(path.join(recent, 'snapshot.db'), 'in progress');
    const recentTime = new Date(Date.now() - 23 * 60 * 60 * 1000);
    fs.utimesSync(recent, recentTime, recentTime);
    fs.mkdirSync(unrelated);
    fs.writeFileSync(path.join(unrelated, 'keep'), 'keep');
    fs.symlinkSync(unrelated, path.join(directory, '.bugpin-upgrade-link'));
    fs.writeFileSync(path.join(directory, '.bugpin-upgrade-file'), 'keep');
    const statfs = fs.statfsSync;
    const spaceCheck = spyOn(fs, 'statfsSync').mockImplementation(((
      ...args: Parameters<typeof fs.statfsSync>
    ) => {
      expect(fs.existsSync(stale)).toBe(false);
      expect(fs.readFileSync(path.join(recent, 'snapshot.db'), 'utf8')).toBe('in progress');
      return statfs(...args);
    }) as typeof fs.statfsSync);
    try {
      runner.run();
      expect(spaceCheck).toHaveBeenCalled();
      expect(fs.readFileSync(path.join(recent, 'snapshot.db'), 'utf8')).toBe('in progress');
      expect(fs.readFileSync(path.join(unrelated, 'keep'), 'utf8')).toBe('keep');
      expect(fs.lstatSync(path.join(directory, '.bugpin-upgrade-link')).isSymbolicLink()).toBe(
        true
      );
      expect(fs.readFileSync(path.join(directory, '.bugpin-upgrade-file'), 'utf8')).toBe('keep');
    } finally {
      spaceCheck.mockRestore();
    }
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
      '009_add_account_access.sql',
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
