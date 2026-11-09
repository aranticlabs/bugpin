import { Database } from 'bun:sqlite';
import { join } from 'node:path';

const directory = process.env.E2E_DATA_DIR;
if (!directory || !process.argv[2])
  throw new Error('A test database directory and email are required');
const db = new Database(join(directory, 'bugpin.db'), { create: false });
db.run("UPDATE reporter_auth_tokens SET source = 'confirmation', expires_at = ? WHERE email = ?", [
  new Date(Date.now() - 60000).toISOString(),
  process.argv[2],
]);
db.close();
