import { usersRepo } from '../database/repositories/users.repo.js';
import { sessionsRepo } from '../database/repositories/sessions.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { twoFactorService } from './two-factor.service.js';
import { passwordPolicyService } from './password-policy.service.js';
import { loginChallengeService } from './login-challenge.service.js';
import { passkeyService } from './passkey.service.js';
import { twoFactorRepo } from '../database/repositories/two-factor.repo.js';
import { config } from '../config.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { RelyingParty } from '../utils/relying-party.js';
import type { User, Session } from '@shared/types';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';

// Types

export interface LoginResult {
  user: User;
  session: Session;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  methods: { totp: boolean; passkey: boolean; recoveryCode: boolean };
}

export type LoginOutcome = LoginResult | TwoFactorChallenge;

export type SecondFactorInput = { code: string } | { recoveryCode: string };

async function createSessionForUser(
  user: User,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult> {
  const settings = await settingsCacheService.getAll();
  const sessionMaxAgeSeconds = settings.sessionMaxAgeDays * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();
  const session = await sessionsRepo.create({
    userId: user.id,
    expiresAt,
    ipAddress,
    userAgent,
  });
  await usersRepo.updateLastLogin(user.id);
  return { user: await twoFactorService.describeUser(user), session };
}

// Password Hashing (using Bun's built-in password API)

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: BCRYPT_ROUNDS,
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// Service

export const authService = {
  /**
   * Login with email and password
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<LoginOutcome>> {
    // Find user by email
    const userWithPassword = await usersRepo.findByEmailWithPassword(email);

    if (!userWithPassword) {
      logger.warn('Login failed: user not found', { email });
      return Result.fail('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Check if user is active
    if (!userWithPassword.isActive) {
      logger.warn('Login failed: user inactive', { email });
      return Result.fail('Account is disabled', 'ACCOUNT_DISABLED');
    }

    // Verify password
    const isValid = await verifyPassword(password, userWithPassword.passwordHash);

    if (!isValid) {
      logger.warn('Login failed: invalid password', { email });
      return Result.fail('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Remove password hash from user object
    const { passwordHash: _, ...user } = userWithPassword;

    // With a second factor, the password only opens a short-lived challenge
    if (await twoFactorService.hasSecondFactor(user.id)) {
      const challengeToken = loginChallengeService.create(user.id, { ipAddress, userAgent });
      logger.info('Password accepted, second factor required', { userId: user.id });
      return Result.ok({
        twoFactorRequired: true,
        challengeToken,
        methods: {
          totp: await twoFactorService.hasTotp(user.id),
          passkey: (await twoFactorRepo.countPasskeys(user.id)) > 0,
          recoveryCode: true,
        },
      });
    }

    const result = await createSessionForUser(user, ipAddress, userAgent);
    logger.info('User logged in', { userId: user.id, email: user.email });
    return Result.ok(result);
  },

  /**
   * Second login step: an authenticator code or a recovery code for a pending challenge
   */
  async completeTwoFactorLogin(
    challengeToken: string,
    input: SecondFactorInput
  ): Promise<Result<LoginResult>> {
    const pending = loginChallengeService.get(challengeToken);
    if (!pending) {
      return Result.fail('The sign-in attempt expired. Sign in again.', 'CHALLENGE_EXPIRED');
    }
    const valid =
      'code' in input
        ? await twoFactorService.verifyLoginCode(pending.userId, input.code)
        : await twoFactorService.verifyRecoveryCode(pending.userId, input.recoveryCode);
    if (!valid) {
      loginChallengeService.recordFailure(challengeToken);
      logger.warn('Second factor rejected', { userId: pending.userId });
      return Result.fail('The code is not valid', 'INVALID_CODE');
    }
    return this.finishPendingLogin(challengeToken);
  },

  /**
   * Turn a verified pending challenge into a session
   */
  async finishPendingLogin(challengeToken: string): Promise<Result<LoginResult>> {
    const pending = loginChallengeService.get(challengeToken);
    if (!pending) {
      return Result.fail('The sign-in attempt expired. Sign in again.', 'CHALLENGE_EXPIRED');
    }
    loginChallengeService.consume(challengeToken);
    const user = await usersRepo.findById(pending.userId);
    if (!user || !user.isActive) {
      return Result.fail('Account is disabled', 'ACCOUNT_DISABLED');
    }
    const result = await createSessionForUser(user, pending.ipAddress, pending.userAgent);
    logger.info('User logged in with a second factor', { userId: user.id });
    return Result.ok(result);
  },

  /**
   * Passkey options for the second login step, limited to the pending user's passkeys
   */
  async passkeySecondFactorOptions(
    rp: RelyingParty,
    challengeToken: string
  ): Promise<Result<PublicKeyCredentialRequestOptionsJSON>> {
    const pending = loginChallengeService.get(challengeToken);
    if (!pending) {
      return Result.fail('The sign-in attempt expired. Sign in again.', 'CHALLENGE_EXPIRED');
    }
    if ((await twoFactorRepo.countPasskeys(pending.userId)) === 0) {
      return Result.fail('No passkey is registered for this account', 'NO_PASSKEY');
    }
    return Result.ok(await passkeyService.secondFactorOptions(rp, challengeToken, pending.userId));
  },

  async completePasskeySecondFactor(
    rp: RelyingParty,
    challengeToken: string,
    response: AuthenticationResponseJSON
  ): Promise<Result<LoginResult>> {
    const pending = loginChallengeService.get(challengeToken);
    if (!pending) {
      return Result.fail('The sign-in attempt expired. Sign in again.', 'CHALLENGE_EXPIRED');
    }
    if (!(await passkeyService.verifySecondFactor(rp, challengeToken, response))) {
      loginChallengeService.recordFailure(challengeToken);
      logger.warn('Passkey second factor rejected', { userId: pending.userId });
      return Result.fail('The passkey could not be verified', 'PASSKEY_INVALID');
    }
    return this.finishPendingLogin(challengeToken);
  },

  /**
   * Passwordless sign-in: a verified passkey replaces both password and second factor
   */
  async loginWithPasskey(
    rp: RelyingParty,
    challengeId: string,
    response: AuthenticationResponseJSON,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Result<LoginResult>> {
    const verified = await passkeyService.login(rp, challengeId, response);
    if (!verified.success) return verified;
    const result = await createSessionForUser(verified.value, ipAddress, userAgent);
    logger.info('User logged in with a passkey', { userId: verified.value.id });
    return Result.ok(result);
  },

  /**
   * Logout (invalidate session)
   */
  async logout(sessionId: string): Promise<Result<void>> {
    const deleted = await sessionsRepo.delete(sessionId);

    if (!deleted) {
      return Result.fail('Session not found', 'SESSION_NOT_FOUND');
    }

    logger.info('User logged out', { sessionId });
    return Result.ok(undefined);
  },

  /**
   * Validate session and get user
   */
  async validateSession(sessionId: string): Promise<Result<{ user: User; session: Session }>> {
    const session = await sessionsRepo.findValidById(sessionId);

    if (!session) {
      return Result.fail('Invalid or expired session', 'INVALID_SESSION');
    }

    const user = await usersRepo.findById(session.userId);

    if (!user) {
      // Session exists but user doesn't - clean up
      await sessionsRepo.delete(sessionId);
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      return Result.fail('Account is disabled', 'ACCOUNT_DISABLED');
    }

    // Update session activity
    await sessionsRepo.updateActivity(sessionId);

    return Result.ok({ user: await twoFactorService.describeUser(user), session });
  },

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string
  ): Promise<Result<void>> {
    // Get user with password
    const user = await usersRepo.findById(userId);
    if (!user) {
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    const userWithPassword = await usersRepo.findByEmailWithPassword(user.email);
    if (!userWithPassword) {
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, userWithPassword.passwordHash);
    if (!isValid) {
      return Result.fail('Current password is incorrect', 'INVALID_PASSWORD');
    }

    // Validate new password
    const policyCheck = await passwordPolicyService.validate(newPassword);
    if (!policyCheck.success) return policyCheck;

    if (newPassword === currentPassword) {
      return Result.fail(
        'New password must be different from the current password',
        'PASSWORD_UNCHANGED'
      );
    }

    // Hash and update password (also clears any pending forced change)
    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(userId, newHash);

    // Invalidate all other sessions, keep the current one active
    if (currentSessionId) {
      await sessionsRepo.deleteByUserIdExcept(userId, currentSessionId);
    } else {
      await sessionsRepo.deleteByUserId(userId);
    }

    logger.info('Password changed', { userId });
    return Result.ok(undefined);
  },

  /**
   * Bootstrap first admin user
   * Called during application startup. Creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD
   * (defaults: admin@example.com / changeme123) when no users exist. Outside development the
   * initial password only works for one login: the account must set a new password before
   * using the API. Development keeps the initial password usable for local hot-reload work.
   */
  async bootstrapAdmin(): Promise<Result<User | null>> {
    const userCount = await usersRepo.count();

    if (userCount > 0) {
      await this.requirePasswordChangeIfInitialPassword();
      logger.info('Users already exist, skipping bootstrap');
      return Result.ok(null);
    }

    const passwordHash = await hashPassword(config.adminPassword);
    const user = await usersRepo.create({
      email: config.adminEmail,
      passwordHash,
      name: 'Admin',
      role: 'admin',
      mustChangePassword: !config.isDev,
    });

    logger.info('First admin user created', { email: config.adminEmail });
    return Result.ok(user);
  },

  /**
   * Flag the bootstrap admin when it still uses the initial password, which covers
   * installs created before a password change was enforced. In development the flag is
   * cleared instead, so a data directory shared with a production-mode run stays usable.
   */
  async requirePasswordChangeIfInitialPassword(): Promise<void> {
    const admin = await usersRepo.findByEmailWithPassword(config.adminEmail);
    if (!admin) return;

    if (config.isDev) {
      if (admin.mustChangePassword) await usersRepo.setMustChangePassword(admin.id, false);
      return;
    }

    if (admin.mustChangePassword) return;

    if (await verifyPassword(config.adminPassword, admin.passwordHash)) {
      await usersRepo.setMustChangePassword(admin.id, true);
      logger.warn('Admin account still uses the initial password; a change is now required', {
        email: admin.email,
      });
    }
  },

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const count = await sessionsRepo.deleteExpired();
    if (count > 0) {
      logger.info('Cleaned up expired sessions', { count });
    }
    return count;
  },
};
