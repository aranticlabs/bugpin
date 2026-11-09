import type { Database } from 'bun:sqlite';

interface SchemaObject {
  type: 'index' | 'trigger' | 'view';
  name: string;
  sql: string;
}

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

// The caller owns the migration transaction and disables foreign keys before BEGIN.
export function rebuildTable(
  db: Database,
  table: string,
  createTableSql: string,
  columns: Record<string, string>,
  ftsTable?: string
): void {
  const foreignKeys = db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()!;
  if (!db.inTransaction || foreignKeys.foreign_keys !== 0) {
    throw new Error('Table rebuild requires a transaction with foreign keys disabled');
  }

  // Views and triggers can reference the table indirectly, so preserve the complete set.
  const objects = db
    .query<SchemaObject, [string]>(
      `
    SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL
      AND (type IN ('view', 'trigger') OR (type = 'index' AND tbl_name = ?))
    ORDER BY CASE type WHEN 'view' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name
  `
    )
    .all(table);
  const replacement = identifier(`new_${table}`);
  db.exec(`CREATE TABLE ${replacement} AS SELECT rowid,
    ${Object.entries(columns)
      .map(([name, expression]) => `${expression} AS ${identifier(name)}`)
      .join(', ')}
    FROM ${identifier(table)}`);

  for (const object of [...objects].reverse()) {
    if (object.type !== 'index') db.exec(`DROP ${object.type} ${identifier(object.name)}`);
  }
  db.exec(`DROP TABLE ${identifier(table)}`);
  // Creating the final table directly preserves the canonical SQL text and identifier quoting.
  db.exec(createTableSql);
  const names = Object.keys(columns).map(identifier).join(', ');
  db.exec(
    `INSERT INTO ${identifier(table)} (rowid, ${names}) SELECT rowid, ${names} FROM ${replacement}`
  );
  db.exec(`DROP TABLE ${replacement}`);
  for (const object of objects) db.exec(object.sql);
  if (ftsTable) {
    db.run(`INSERT INTO ${identifier(ftsTable)} (${identifier(ftsTable)}) VALUES ('rebuild')`);
  }
  if (db.query('PRAGMA foreign_key_check').all().length > 0) {
    throw new Error(`Foreign key check failed after rebuilding ${table}`);
  }
}
