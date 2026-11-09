import { expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function snapshot(directory: string) {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .sort()
    .map((name) => [
      name,
      lstatSync(join(directory, name)).isDirectory()
        ? 'directory'
        : readFileSync(join(directory, name)).toString('hex'),
    ]);
}

function recover(directory: string, target: string | undefined) {
  return Bun.spawnSync(
    [process.execPath, resolve(import.meta.dir, '../../src/server/scripts/reset-portal-origin.ts')],
    {
      cwd: directory,
      env: { ...process.env, NODE_ENV: 'production', DATA_DIR: target },
    }
  );
}

it.each([
  'unset',
  'empty',
  'relative',
  'missing',
  'empty-directory',
  'database-directory',
  'corrupt',
  'other-database',
] as const)(
  'creates and changes no files when production portal origin recovery fails for %s',
  (kind) => {
    const directory = mkdtempSync(join(tmpdir(), 'bugpin-origin-recovery-'));
    try {
      const databasePath = join(directory, 'bugpin.db');
      if (kind === 'database-directory') mkdirSync(databasePath);
      if (kind === 'corrupt') writeFileSync(databasePath, 'Not a database');
      if (kind === 'other-database') {
        const db = new Database(databasePath);
        db.exec('CREATE TABLE unrelated (value TEXT)');
        db.close();
      }
      const target =
        kind === 'unset'
          ? undefined
          : kind === 'empty'
            ? ''
            : kind === 'relative'
              ? './relative-data'
              : kind === 'missing'
                ? join(directory, 'missing', 'data')
                : directory;
      const before = snapshot(directory);
      const result = recover(directory, target);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain('Could not clear the Portal Base URL');
      expect(result.stdout.toString()).not.toContain('Generated new secret');
      expect(snapshot(directory)).toEqual(before);
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
);

it('clears only the portal origin in production without initializing configuration or storage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin-origin-recovery-'));
  try {
    const databasePath = join(directory, 'bugpin.db');
    const db = new Database(databasePath);
    db.exec(
      'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)'
    );
    db.run('INSERT INTO settings VALUES (?, ?, ?)', [
      'portal_base_url',
      JSON.stringify('https://portal.example.test'),
      'before',
    ]);
    db.run('INSERT INTO settings VALUES (?, ?, ?)', [
      'app_name',
      JSON.stringify('Recovery fixture'),
      'before',
    ]);
    const schema = db.query('SELECT sql FROM sqlite_schema ORDER BY name').all();
    db.close();
    expect(recover(directory, directory).exitCode).toBe(0);
    expect(readdirSync(directory)).toEqual(['bugpin.db']);
    const after = new Database(databasePath, { readonly: true });
    expect(after.query('SELECT sql FROM sqlite_schema ORDER BY name').all()).toEqual(schema);
    expect(after.query('SELECT value FROM settings WHERE key = ?').get('portal_base_url')).toEqual({
      value: JSON.stringify(''),
    });
    expect(
      after.query('SELECT value, updated_at FROM settings WHERE key = ?').get('app_name')
    ).toEqual({ value: JSON.stringify('Recovery fixture'), updated_at: 'before' });
    after.close();
  } finally {
    rmSync(directory, { recursive: true });
  }
});
