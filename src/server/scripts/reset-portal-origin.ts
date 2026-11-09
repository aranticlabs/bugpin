import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { initDatabase, closeDatabase } from '../database/database.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';

async function main(): Promise<void> {
  if (!existsSync(config.dbPath)) throw new Error('No existing BugPin database found');
  await initDatabase();
  try {
    await settingsRepo.updateAll({ portalBaseUrl: '' });
  } finally {
    closeDatabase();
  }
  console.log('Portal Base URL cleared. Restart BugPin, then correct the Application URL.');
}

main().catch((error: unknown) => {
  console.error('Could not clear the Portal Base URL:', error);
  process.exitCode = 1;
});
