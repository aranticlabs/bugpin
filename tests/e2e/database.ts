import { Database } from 'bun:sqlite';
import { join } from 'node:path';

const directory = process.env.E2E_DATA_DIR;
if (!directory || !process.argv[2])
  throw new Error('A test database directory and email are required');
const db = new Database(join(directory, 'bugpin.db'), { create: false });
const source = process.argv[3];
if (source === 'suppression') {
  process.stdout.write(
    JSON.stringify(
      db.query('SELECT 1 FROM reporter_email_suppressions WHERE email = ?').get(process.argv[2]) !==
        null
    )
  );
} else {
  if (source !== 'request' && source !== 'confirmation')
    throw new Error('Expected token source is required');
  const tokens = db
    .query<{ source: string; created_at: string; expires_at: string }, [string]>(
      'SELECT source, created_at, expires_at FROM reporter_auth_tokens WHERE email = ? AND consumed_at IS NULL'
    )
    .all(process.argv[2]);
  const lifetime = source === 'confirmation' ? 24 * 3600000 : 15 * 60000;
  if (
    tokens.length !== 1 ||
    tokens[0].source !== source ||
    Date.parse(tokens[0].expires_at) - Date.parse(tokens[0].created_at) !== lifetime
  )
    throw new Error('Expected an unmodified token issued with its production lifetime');
  db.run('UPDATE reporter_auth_tokens SET expires_at = ? WHERE email = ?', [
    new Date(Date.now() - 60000).toISOString(),
    process.argv[2],
  ]);
}
db.close();
