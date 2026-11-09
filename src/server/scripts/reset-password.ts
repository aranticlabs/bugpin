import { initDatabase, initSchema, runMigrations, closeDatabase } from '../database/database.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { usersService } from '../services/users.service.js';
import { isValidEmail } from '../utils/validators.js';
import { passwordPolicyService } from '../services/password-policy.service.js';
import { describePasswordPolicyViolation, type PasswordPolicy } from '@shared/password-policy';

// Unambiguous alphabet (no 0/O/1/I/l) so a temporary password can be read
// aloud or copied from a terminal without transcription errors.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const GROUP_LENGTH = 6;

function randomGroup(): string {
  const bytes = new Uint8Array(GROUP_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

// Dash-separated groups satisfy every rule of the password policy: the dashes are
// special characters, and groups are drawn until upper, lower and digits all appear.
function generateTemporaryPassword(policy: PasswordPolicy): string {
  for (;;) {
    const groups: string[] = [];
    while (groups.length < 3 || groups.join('-').length < policy.minLength) {
      groups.push(randomGroup());
    }
    const password = groups.join('-');
    if (!describePasswordPolicyViolation(password, { ...policy, requireSymbol: true })) {
      return password;
    }
  }
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim();

  if (!email || !isValidEmail(email)) {
    console.error('Usage: bun run reset-password <email>');
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

  const temporaryPassword = generateTemporaryPassword(await passwordPolicyService.getPolicy());
  const result = await usersService.resetPassword(user.id, temporaryPassword);
  if (result.success) await usersRepo.setMustChangePassword(user.id, true);

  closeDatabase();

  if (!result.success) {
    console.error(`Failed to reset password: ${result.error}`);
    process.exit(1);
  }

  console.log('Password reset successful.');
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${temporaryPassword}`);
  console.log('The temporary password works once: BugPin asks for a new one after login.');
}

main().catch((error) => {
  console.error('Unexpected error resetting password:', error);
  process.exit(1);
});
