import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { twoFactorRepo } from '../../src/server/database/repositories/two-factor.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { authService } from '../../src/server/services/auth.service';
import { twoFactorService } from '../../src/server/services/two-factor.service';
import { loginChallengeService } from '../../src/server/services/login-challenge.service';
import { invitationsService } from '../../src/server/services/invitations.service';
import { generateTotpCode, timeStep } from '../../src/server/utils/totp';
import { logger } from '../../src/server/utils/logger';
import type { User } from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const password = 'initial-password-1';
let tempDir = '';
let user: User;

async function setPolicy(twoFactorPolicy: 'off' | 'admins' | 'everyone') {
  await settingsRepo.updateAll({ twoFactorPolicy });
  settingsCacheService.invalidate();
}

async function enableTotp(target: User): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await twoFactorService.startTotpSetup(target, 'BugPin', password);
  if (!setup.success) throw new Error(setup.error);
  // Confirm with the previous step so the next login can use the current one
  const code = generateTotpCode(setup.value.secret, timeStep(Date.now()) - 1);
  const confirmed = await twoFactorService.confirmTotpSetup(target.id, code);
  if (!confirmed.success) throw new Error(confirmed.error);
  return { secret: setup.value.secret, recoveryCodes: confirmed.value.recoveryCodes ?? [] };
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-2fa-'));
  Object.assign(config, { dataDir: tempDir, dbPath: path.join(tempDir, 'bugpin.db') });
  await initDatabase();
  await initSchema();
  await runMigrations();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
});

beforeEach(async () => {
  loginChallengeService.clear();
  await setPolicy('off');
  user = await usersRepo.create({
    email: `user-${crypto.randomUUID()}@example.test`,
    passwordHash: await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 4 }),
    name: 'User',
    role: 'admin',
  });
});

describe('two-factor login flow', () => {
  it('logs in directly without a second factor', async () => {
    const result = await authService.login(user.email, password);
    expect(result.success && 'session' in result.value).toBe(true);
  });

  it('stores the authenticator secret encrypted', async () => {
    const { secret } = await enableTotp(user);
    const stored = await twoFactorRepo.getTotp(user.id);
    expect(stored?.confirmedAt).toBeTruthy();
    expect(stored?.secretEncrypted).not.toContain(secret);
  });

  it('requires the authenticator code after the password and rejects reuse', async () => {
    const { secret } = await enableTotp(user);

    const login = await authService.login(user.email, password);
    if (!login.success || !('twoFactorRequired' in login.value)) throw new Error('no challenge');
    expect(login.value.methods).toEqual({ totp: true, passkey: false, recoveryCode: true });

    const wrong = await authService.completeTwoFactorLogin(login.value.challengeToken, {
      code: '000000',
    });
    expect(wrong.success).toBe(false);

    const code = generateTotpCode(secret, timeStep(Date.now()));
    const ok = await authService.completeTwoFactorLogin(login.value.challengeToken, { code });
    expect(ok.success).toBe(true);

    // The challenge is single-use, and the same code cannot open a second login
    const again = await authService.completeTwoFactorLogin(login.value.challengeToken, { code });
    expect(again.success).toBe(false);
    const second = await authService.login(user.email, password);
    if (!second.success || !('twoFactorRequired' in second.value)) throw new Error('no challenge');
    const replay = await authService.completeTwoFactorLogin(second.value.challengeToken, { code });
    expect(replay.success).toBe(false);
  });

  it('discards the challenge after five wrong codes', async () => {
    await enableTotp(user);
    const login = await authService.login(user.email, password);
    if (!login.success || !('twoFactorRequired' in login.value)) throw new Error('no challenge');
    for (let i = 0; i < 5; i++) {
      await authService.completeTwoFactorLogin(login.value.challengeToken, { code: '000000' });
    }
    const result = await authService.completeTwoFactorLogin(login.value.challengeToken, {
      code: '000000',
    });
    expect(result.success ? undefined : result.code).toBe('CHALLENGE_EXPIRED');
  });

  it('locks second-factor sign-in for the account after repeated failures', async () => {
    const { secret } = await enableTotp(user);
    const failures: Array<string | undefined> = [];
    for (let challenge = 0; challenge < 3; challenge++) {
      const login = await authService.login(user.email, password);
      if (!login.success || !('twoFactorRequired' in login.value)) throw new Error('no challenge');
      for (let attempt = 0; attempt < 4; attempt++) {
        const result = await authService.completeTwoFactorLogin(login.value.challengeToken, {
          code: '000000',
        });
        failures.push(result.success ? undefined : result.code);
      }
    }
    expect(failures.slice(0, 10).every((code) => code === 'INVALID_CODE')).toBe(true);
    expect(failures.slice(10)).toEqual(['TOO_MANY_ATTEMPTS', 'TOO_MANY_ATTEMPTS']);

    // Even the correct code is refused while the account is locked
    const login = await authService.login(user.email, password);
    if (!login.success || !('twoFactorRequired' in login.value)) throw new Error('no challenge');
    const locked = await authService.completeTwoFactorLogin(login.value.challengeToken, {
      code: generateTotpCode(secret, timeStep(Date.now())),
    });
    expect(locked.success ? undefined : locked.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('counts parallel attempts on one challenge before verifying them', async () => {
    await enableTotp(user);
    const login = await authService.login(user.email, password);
    if (!login.success || !('twoFactorRequired' in login.value)) throw new Error('no challenge');
    const challengeToken = login.value.challengeToken;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        authService.completeTwoFactorLogin(challengeToken, { code: '000000' })
      )
    );
    const codes = results.map((result) => (result.success ? undefined : result.code));
    expect(codes.filter((code) => code === 'INVALID_CODE')).toHaveLength(5);
    expect(codes.filter((code) => code === 'CHALLENGE_EXPIRED')).toHaveLength(3);
  });

  it('accepts each recovery code once, in any format', async () => {
    const { recoveryCodes } = await enableTotp(user);
    expect(recoveryCodes).toHaveLength(10);

    const first = await authService.login(user.email, password);
    if (!first.success || !('twoFactorRequired' in first.value)) throw new Error('no challenge');
    const formatted = ` ${recoveryCodes[0].toUpperCase().replace('-', ' ')} `;
    const used = await authService.completeTwoFactorLogin(first.value.challengeToken, {
      recoveryCode: formatted,
    });
    expect(used.success).toBe(true);

    const second = await authService.login(user.email, password);
    if (!second.success || !('twoFactorRequired' in second.value)) throw new Error('no challenge');
    const reused = await authService.completeTwoFactorLogin(second.value.challengeToken, {
      recoveryCode: recoveryCodes[0],
    });
    expect(reused.success).toBe(false);
    expect(await twoFactorRepo.countUnusedRecoveryCodes(user.id)).toBe(9);
  });
});

describe('two-factor policy', () => {
  it('flags users the policy covers until they set up a second factor', async () => {
    await setPolicy('admins');
    expect((await twoFactorService.describeUser(user)).twoFactorSetupRequired).toBe(true);
    const viewer = { ...user, role: 'viewer' as const };
    expect((await twoFactorService.describeUser(viewer)).twoFactorSetupRequired).toBe(false);

    await enableTotp(user);
    const described = await twoFactorService.describeUser(user);
    expect(described.twoFactorEnabled).toBe(true);
    expect(described.twoFactorSetupRequired).toBe(false);
  });

  it('refuses to remove the last factor while the policy applies', async () => {
    await enableTotp(user);
    await setPolicy('everyone');
    const blocked = await twoFactorService.disableTotp(user, password);
    expect(blocked.success ? undefined : blocked.code).toBe('TWO_FACTOR_REQUIRED');

    await setPolicy('off');
    const wrongPassword = await twoFactorService.disableTotp(user, 'wrong-password');
    expect(wrongPassword.success ? undefined : wrongPassword.code).toBe('INVALID_PASSWORD');
    const disabled = await twoFactorService.disableTotp(user, password);
    expect(disabled.success).toBe(true);
    expect(await twoFactorRepo.countUnusedRecoveryCodes(user.id)).toBe(0);
  });

  it('lets an admin reset every second factor of a user and signs them out', async () => {
    await enableTotp(user);
    await sessionsRepo.create({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await twoFactorService.resetForUser(user.id);
    expect(await twoFactorService.hasSecondFactor(user.id)).toBe(false);
    expect(await twoFactorRepo.countUnusedRecoveryCodes(user.id)).toBe(0);
    expect(await sessionsRepo.deleteByUserId(user.id)).toBe(0);
  });

  it('requires the current password to start authenticator setup', async () => {
    const result = await twoFactorService.startTotpSetup(user, 'BugPin', 'wrong-password');
    expect(result.success ? undefined : result.code).toBe('INVALID_PASSWORD');
    expect(await twoFactorRepo.getTotp(user.id)).toBeNull();
  });

  it('refuses to send an invitation that would replace the password of an existing account', async () => {
    await enableTotp(user);

    const result = await invitationsService.resendInvitation(user.id, 'Another Admin');

    expect(result.success ? undefined : result.code).toBe('NOT_INVITED');
    const reloaded = await usersRepo.findById(user.id);
    expect(reloaded?.invitationSentAt ?? null).toBeNull();
  });
});
