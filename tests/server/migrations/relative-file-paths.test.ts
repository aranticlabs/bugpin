import { afterEach, beforeEach, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MigrationRunner } from '../../../src/server/database/migration-runner';

const migration = '021_store_relative_file_paths.sql';
const source = resolve(import.meta.dir, '../../../src/server/database/migrations', migration);

let directory: string;
let db: Database;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'bugpin-relative-paths-'));
  mkdirSync(join(directory, 'migrations'));
  copyFileSync(source, join(directory, 'migrations', migration));
  db = new Database(join(directory, 'bugpin.db'));
  db.exec(`CREATE TABLE files (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    type TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL
  )`);
});

afterEach(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

function insert(id: string, type: string, reportId: string, filename: string, path: string) {
  db.run('INSERT INTO files (id, report_id, type, filename, path) VALUES (?, ?, ?, ?, ?)', [
    id,
    reportId,
    type,
    filename,
    path,
  ]);
}

function paths(): Record<string, string> {
  return Object.fromEntries(
    db
      .query<{ id: string; path: string }, []>('SELECT id, path FROM files')
      .all()
      .map((row) => [row.id, row.path])
  );
}

it('rewrites local file paths relative to the data directory', () => {
  insert(
    'host',
    'screenshot',
    'rpt_a',
    'a.png',
    '/Users/me/app/data/uploads/screenshots/rpt_a/a.png'
  );
  insert('container', 'video', 'rpt_b', 'b.webm', '/data/uploads/screenshots/rpt_b/b.webm');
  insert(
    'attachment',
    'attachment',
    'rpt_c',
    'c.txt',
    '/srv/bugpin/uploads/attachments/rpt_c/c.txt'
  );
  insert('cwd', 'screenshot', 'rpt_d', 'd.png', 'data/uploads/screenshots/rpt_d/d.png');
  insert(
    'windows',
    'attachment',
    'rpt_e',
    'e.pdf',
    'C:\\bugpin\\data\\uploads\\attachments\\rpt_e\\e.pdf'
  );
  insert('done', 'screenshot', 'rpt_f', 'f.png', 'uploads/screenshots/rpt_f/f.png');
  insert('s3', 'screenshot', 'rpt_g', 'g.png', 's3://bucket/screenshot/rpt_g/g.png');
  insert(
    'https',
    'screenshot',
    'rpt_h',
    'h.png',
    'https://cdn.example.com/uploads/screenshots/rpt_h/h.png'
  );
  insert('foreign', 'screenshot', 'rpt_i', 'i.png', '/elsewhere/i.png');
  insert('suffix', 'screenshot', 'rpt_j', 'j.png', '/data/xuploads/screenshots/rpt_j/j.png');
  insert('mismatch', 'attachment', 'rpt_k', 'k.txt', '/data/uploads/screenshots/rpt_k/k.txt');

  new MigrationRunner(db, join(directory, 'migrations')).run();

  expect(paths()).toEqual({
    host: 'uploads/screenshots/rpt_a/a.png',
    container: 'uploads/screenshots/rpt_b/b.webm',
    attachment: 'uploads/attachments/rpt_c/c.txt',
    cwd: 'uploads/screenshots/rpt_d/d.png',
    windows: 'C:\\bugpin\\data\\uploads\\attachments\\rpt_e\\e.pdf',
    done: 'uploads/screenshots/rpt_f/f.png',
    s3: 's3://bucket/screenshot/rpt_g/g.png',
    https: 'https://cdn.example.com/uploads/screenshots/rpt_h/h.png',
    foreign: '/elsewhere/i.png',
    suffix: '/data/xuploads/screenshots/rpt_j/j.png',
    mismatch: '/data/uploads/screenshots/rpt_k/k.txt',
  });
  expect(db.query('SELECT 1 FROM migrations WHERE name = ?').get(migration)).not.toBeNull();
});
