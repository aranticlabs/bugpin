import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { rebuildTable } from '../../../src/server/database/table-rebuild';

let db: Database;
const columnDefinitions =
  'id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, board_position REAL NOT NULL DEFAULT 0';
const definition = `CREATE TABLE reports (${columnDefinitions})`;
const columns = {
  id: 'id',
  title: 'title',
  description: 'description',
  board_position: 'board_position',
};

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`PRAGMA foreign_keys = ON;
    ${definition};
    INSERT INTO reports (rowid, id, title, description, board_position) VALUES
      (7, 'first', 'Searchable first', 'original', 2.5), (42, 'second', 'Second report', NULL, -1.5);
    CREATE TABLE files (report_id TEXT REFERENCES reports(id) ON DELETE CASCADE);
    INSERT INTO files VALUES ('first');
    CREATE TABLE counts (value INTEGER);
    INSERT INTO counts VALUES (2);
    CREATE TABLE unrelated (id INTEGER);
    CREATE INDEX idx_reports_position ON reports(board_position);
    CREATE VIEW report_view AS SELECT id, title FROM reports;
    CREATE VIEW nested_view AS SELECT * FROM report_view;
    CREATE TRIGGER unrelated_ai AFTER INSERT ON unrelated BEGIN UPDATE reports SET title = title WHERE id = 'first'; END;
    CREATE TRIGGER view_insert INSTEAD OF INSERT ON report_view BEGIN INSERT INTO reports (id, title) VALUES (new.id, new.title); END;
    CREATE VIRTUAL TABLE reports_fts USING fts5(title, description, content='reports', content_rowid='rowid');
    INSERT INTO reports_fts(reports_fts) VALUES ('rebuild');
    CREATE TRIGGER reports_ai AFTER INSERT ON reports BEGIN
      INSERT INTO reports_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
      UPDATE counts SET value = value + 1;
    END;
    CREATE TRIGGER reports_ad AFTER DELETE ON reports BEGIN
      INSERT INTO reports_fts(reports_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      UPDATE counts SET value = value - 1;
    END;
    CREATE TRIGGER reports_au AFTER UPDATE OF title, description ON reports BEGIN
      INSERT INTO reports_fts(reports_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
      INSERT INTO reports_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
    END;`);
});

afterEach(() => db.close());

function rebuild(targetDefinition: string, targetColumns: Record<string, string> = columns): void {
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
  try {
    rebuildTable(db, 'reports', targetDefinition, targetColumns, 'reports_fts');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

describe('table rebuild', () => {
  it.each(['reports', '"reports"'])('preserves the canonical complete table SQL for %s', (name) => {
    const canonical = `CREATE TABLE IF NOT EXISTS ${name} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      board_position REAL NOT NULL DEFAULT 0
    )`;
    const bootstrap = new Database(':memory:');
    try {
      bootstrap.exec(canonical);
      const expected = bootstrap
        .query("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'reports'")
        .get();
      rebuild(canonical);
      expect(
        db.query("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'reports'").get()
      ).toEqual(expected);
      expect(db.query('SELECT rowid, id FROM reports ORDER BY rowid').all()).toEqual([
        { rowid: 7, id: 'first' },
        { rowid: 42, id: 'second' },
      ]);
    } finally {
      bootstrap.close();
    }
  });

  it('preserves rowids, data, counts, indexes, views, external triggers and cascading references', () => {
    const before = db.query('SELECT rowid, * FROM reports ORDER BY rowid').all();
    const dependents = db
      .query(
        "SELECT type, name, sql FROM sqlite_schema WHERE type IN ('view', 'trigger', 'index') ORDER BY name"
      )
      .all();
    rebuild(`CREATE TABLE reports (${columnDefinitions}, original_description TEXT)`, {
      ...columns,
      original_description: 'description',
    });
    expect(
      db
        .query('SELECT rowid, id, title, description, board_position FROM reports ORDER BY rowid')
        .all()
    ).toEqual(before);
    expect(db.query('SELECT original_description FROM reports ORDER BY rowid').all()).toEqual([
      { original_description: 'original' },
      { original_description: null },
    ]);
    expect(
      db
        .query(
          "SELECT type, name, sql FROM sqlite_schema WHERE type IN ('view', 'trigger', 'index') ORDER BY name"
        )
        .all()
    ).toEqual(dependents);
    expect(db.query('SELECT value FROM counts').get()).toEqual({ value: 2 });
    expect(db.query('SELECT * FROM nested_view').all()).toHaveLength(2);
    expect(db.query('SELECT * FROM files').all()).toEqual([{ report_id: 'first' }]);
    expect(
      db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
    ).toEqual([{ rowid: 7 }]);

    db.exec(
      "INSERT INTO unrelated VALUES (1); INSERT INTO report_view VALUES ('third', 'Third report');"
    );
    expect(db.query('SELECT value FROM counts').get()).toEqual({ value: 3 });
    db.exec("UPDATE reports SET title = 'Renamed' WHERE id = 'first';");
    expect(
      db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Renamed'").all()
    ).toEqual([{ rowid: 7 }]);
    expect(
      db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
    ).toEqual([]);
    db.exec("DELETE FROM reports WHERE id = 'first';");
    expect(db.query('SELECT * FROM files').all()).toEqual([]);
    expect(db.query('SELECT value FROM counts').get()).toEqual({ value: 2 });
    expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('rolls back the original schema, rowids, FTS and views when dependent recreation fails', () => {
    const schema = db.query('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all();
    const rows = db.query('SELECT rowid, * FROM reports ORDER BY rowid').all();
    expect(() =>
      rebuild('CREATE TABLE reports (id TEXT PRIMARY KEY, title TEXT, description TEXT)', {
        id: 'id',
        title: 'title',
        description: 'description',
      })
    ).toThrow();
    expect(db.query('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all()).toEqual(
      schema
    );
    expect(db.query('SELECT rowid, * FROM reports ORDER BY rowid').all()).toEqual(rows);
    expect(
      db.query("SELECT rowid FROM reports_fts WHERE reports_fts MATCH 'Searchable'").all()
    ).toEqual([{ rowid: 7 }]);
    expect(db.query('SELECT * FROM nested_view').all()).toHaveLength(2);
    expect(db.query('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });

  it('rejects a rebuild that would invalidate referencing rows', () => {
    expect(() => rebuild(definition, { ...columns, id: "'new-' || id" })).toThrow(
      'Foreign key check failed'
    );
    expect(db.query('SELECT id FROM reports ORDER BY rowid').all()).toEqual([
      { id: 'first' },
      { id: 'second' },
    ]);
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('requires the caller to disable foreign keys before opening its transaction', () => {
    expect(() => rebuildTable(db, 'reports', definition, columns)).toThrow(
      'requires a transaction'
    );
    db.exec('BEGIN');
    expect(() => rebuildTable(db, 'reports', definition, columns)).toThrow('foreign keys disabled');
    db.exec('ROLLBACK');
  });
});
