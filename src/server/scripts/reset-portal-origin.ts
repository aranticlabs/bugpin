import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { resetPortalOrigin } from '../database/repositories/portal-origin-recovery.repo.js';

async function main(): Promise<void> {
  const directory = process.env.DATA_DIR;
  if (!directory || !isAbsolute(directory))
    throw new Error('Set DATA_DIR to the absolute path of the existing BugPin data directory');
  const databasePath = join(directory, 'bugpin.db');
  if (!existsSync(databasePath) || !statSync(databasePath).isFile())
    throw new Error('No existing BugPin database found');
  resetPortalOrigin(databasePath);
  console.log('Portal Base URL cleared. Restart BugPin, then correct the Application URL.');
}

main().catch((error: unknown) => {
  console.error('Could not clear the Portal Base URL:', error);
  process.exitCode = 1;
});
