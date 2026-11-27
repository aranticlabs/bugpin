import { Database } from 'bun:sqlite';

export function resetPortalOrigin(databasePath: string): void {
  const db = new Database(databasePath, { create: false });
  try {
    db.run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [
      JSON.stringify(''),
      new Date().toISOString(),
      'portal_base_url',
    ]);
  } finally {
    db.close();
  }
}
