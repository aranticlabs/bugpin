import { initDatabase, initSchema, runMigrations, closeDatabase } from '../database/database.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { twoFactorService } from '../services/two-factor.service.js';
import { isValidEmail } from '../utils/validators.js';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();

  if (!email || !isValidEmail(email)) {
    console.error('Usage: bun run reset-two-factor <email>');
    process.exit(1);
  }

  initDatabase();
  await initSchema();
  await runMigrations();

  const user = await usersRepo.findByEmail(email);

  if (!user) {
    console.error(`No user found with email: ${email}`);
    closeDatabase();
    process.exit(1);
  }

  const result = await twoFactorService.resetForUser(user.id);

  closeDatabase();

  if (!result.success) {
    console.error(`Failed to reset two-factor authentication: ${result.error}`);
    process.exit(1);
  }

  console.log('Two-factor authentication reset.');
  console.log(`  Email: ${user.email}`);
  console.log('The authenticator app, passkeys and recovery codes were removed.');
  console.log('If a two-factor policy applies, the user sets up a new method at the next login.');
}

main().catch((error) => {
  console.error('Unexpected error resetting two-factor authentication:', error);
  process.exit(1);
});
