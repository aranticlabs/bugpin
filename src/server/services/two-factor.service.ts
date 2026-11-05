import { randomBytes } from 'node:crypto';
import { twoFactorRepo } from '../database/repositories/two-factor.repo.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { decryptSecret, encryptSecret, sha256Hex } from '../utils/crypto.js';
import {
  base32Encode,
  buildOtpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
} from '../utils/totp.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { TwoFactorPolicy, TwoFactorStatus, User, UserRole } from '@shared/types';

const TOTP_SECRET_PURPOSE = 'totp-secret';
const RECOVERY_CODE_COUNT = 10;

export interface TotpSetup {
  secret: string;
  otpauthUri: string;
}

function policyApplies(policy: TwoFactorPolicy, role: UserRole): boolean {
  return policy === 'everyone' || (policy === 'admins' && role === 'admin');
}

// Recovery codes look like `k4tq7-mz2pw`; input is accepted in any case, with or
// without the dash or spaces.
function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z2-7]/g, '');
}

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(randomBytes(7)).toLowerCase().slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const user = await usersRepo.findById(userId);
  if (!user) return false;
  const withPassword = await usersRepo.findByEmailWithPassword(user.email);
  if (!withPassword) return false;
  return Bun.password.verify(password, withPassword.passwordHash);
}

async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await twoFactorRepo.replaceRecoveryCodes(
    userId,
    codes.map((code) => sha256Hex(normalizeRecoveryCode(code)))
  );
  return codes;
}

export const twoFactorService = {
  async hasSecondFactor(userId: string): Promise<boolean> {
    const totp = await twoFactorRepo.getTotp(userId);
    if (totp?.confirmedAt) return true;
    return (await twoFactorRepo.countPasskeys(userId)) > 0;
  },

  async hasTotp(userId: string): Promise<boolean> {
    const totp = await twoFactorRepo.getTotp(userId);
    return !!totp?.confirmedAt;
  },

  /** Add the two-factor flags the Admin Console and the auth middleware rely on */
  async describeUser(user: User): Promise<User> {
    const settings = await settingsCacheService.getAll();
    const twoFactorEnabled = await this.hasSecondFactor(user.id);
    return {
      ...user,
      twoFactorEnabled,
      twoFactorSetupRequired:
        !twoFactorEnabled && policyApplies(settings.twoFactorPolicy, user.role),
    };
  },

  async getStatus(user: User): Promise<TwoFactorStatus> {
    const settings = await settingsCacheService.getAll();
    const passkeys = await twoFactorRepo.listPasskeys(user.id);
    const totpEnabled = await this.hasTotp(user.id);
    return {
      totpEnabled,
      passkeys: passkeys.map(({ id, name, backedUp, createdAt, lastUsedAt }) => ({
        id,
        name,
        backedUp,
        createdAt,
        lastUsedAt,
      })),
      recoveryCodesRemaining: await twoFactorRepo.countUnusedRecoveryCodes(user.id),
      policy: settings.twoFactorPolicy,
      setupRequired:
        !totpEnabled && passkeys.length === 0 && policyApplies(settings.twoFactorPolicy, user.role),
    };
  },

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    return verifyPassword(userId, password);
  },

  // Authenticator app

  async startTotpSetup(user: User, issuer: string): Promise<Result<TotpSetup>> {
    if (await this.hasTotp(user.id)) {
      return Result.fail('An authenticator app is already set up', 'TOTP_ALREADY_ENABLED');
    }
    const secret = generateTotpSecret();
    await twoFactorRepo.savePendingTotp(user.id, encryptSecret(secret, TOTP_SECRET_PURPOSE));
    return Result.ok({ secret, otpauthUri: buildOtpAuthUri(secret, issuer, user.email) });
  },

  /**
   * Confirm the pending authenticator secret with a current code. Returns new recovery
   * codes when the user had none, so they are shown exactly once.
   */
  async confirmTotpSetup(
    userId: string,
    code: string
  ): Promise<Result<{ recoveryCodes: string[] | null }>> {
    const totp = await twoFactorRepo.getTotp(userId);
    if (!totp || totp.confirmedAt) {
      return Result.fail('Start the authenticator setup first', 'TOTP_SETUP_NOT_STARTED');
    }
    const secret = decryptSecret(totp.secretEncrypted, TOTP_SECRET_PURPOSE);
    const step = secret ? verifyTotpCode(secret, code) : null;
    if (step === null) {
      return Result.fail('The code is not valid. Check the time on your device.', 'INVALID_CODE');
    }
    if (!(await twoFactorRepo.confirmTotp(userId, step))) {
      return Result.fail('Start the authenticator setup first', 'TOTP_SETUP_NOT_STARTED');
    }
    const hasCodes = (await twoFactorRepo.countUnusedRecoveryCodes(userId)) > 0;
    logger.info('Authenticator app enabled', { userId });
    return Result.ok({ recoveryCodes: hasCodes ? null : await issueRecoveryCodes(userId) });
  },

  async disableTotp(user: User, password: string): Promise<Result<void>> {
    if (!(await verifyPassword(user.id, password))) {
      return Result.fail('Password is incorrect', 'INVALID_PASSWORD');
    }
    if (!(await this.hasTotp(user.id))) {
      return Result.fail('No authenticator app is set up', 'TOTP_NOT_ENABLED');
    }
    const remaining = await this.ensureFactorCanBeRemoved(user, 'totp');
    if (!remaining.success) return remaining;
    await twoFactorRepo.deleteTotp(user.id);
    await this.dropRecoveryCodesIfUnused(user.id);
    logger.info('Authenticator app disabled', { userId: user.id });
    return Result.ok(undefined);
  },

  // Recovery codes

  async regenerateRecoveryCodes(user: User, password: string): Promise<Result<string[]>> {
    if (!(await verifyPassword(user.id, password))) {
      return Result.fail('Password is incorrect', 'INVALID_PASSWORD');
    }
    if (!(await this.hasSecondFactor(user.id))) {
      return Result.fail('Set up two-factor authentication first', 'TWO_FACTOR_NOT_ENABLED');
    }
    logger.info('Recovery codes regenerated', { userId: user.id });
    return Result.ok(await issueRecoveryCodes(user.id));
  },

  /** Recovery codes are only issued together with a second factor */
  async issueRecoveryCodesIfMissing(userId: string): Promise<string[] | null> {
    if ((await twoFactorRepo.countUnusedRecoveryCodes(userId)) > 0) return null;
    return issueRecoveryCodes(userId);
  },

  async dropRecoveryCodesIfUnused(userId: string): Promise<void> {
    if (!(await this.hasSecondFactor(userId))) await twoFactorRepo.deleteRecoveryCodes(userId);
  },

  /**
   * Refuse to remove the last second factor while the two-factor policy covers the user.
   */
  async ensureFactorCanBeRemoved(user: User, factor: 'totp' | 'passkey'): Promise<Result<void>> {
    const settings = await settingsCacheService.getAll();
    if (!policyApplies(settings.twoFactorPolicy, user.role)) return Result.ok(undefined);
    const hasTotp = await this.hasTotp(user.id);
    const passkeys = await twoFactorRepo.countPasskeys(user.id);
    const remainingFactors =
      (factor === 'totp' ? 0 : hasTotp ? 1 : 0) + (factor === 'passkey' ? passkeys - 1 : passkeys);
    if (remainingFactors < 1) {
      return Result.fail(
        'Two-factor authentication is required for your account. Add another method first.',
        'TWO_FACTOR_REQUIRED'
      );
    }
    return Result.ok(undefined);
  },

  // Login verification

  async verifyLoginCode(userId: string, code: string): Promise<boolean> {
    const totp = await twoFactorRepo.getTotp(userId);
    if (!totp?.confirmedAt) return false;
    const secret = decryptSecret(totp.secretEncrypted, TOTP_SECRET_PURPOSE);
    const step = secret ? verifyTotpCode(secret, code) : null;
    if (step === null) return false;
    return twoFactorRepo.markTotpStepUsed(userId, step);
  },

  async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 10) return false;
    const used = await twoFactorRepo.consumeRecoveryCode(userId, sha256Hex(normalized));
    if (used) logger.warn('Recovery code used for login', { userId });
    return used;
  },

  // Administration

  async resetForUser(userId: string): Promise<Result<void>> {
    const user = await usersRepo.findById(userId);
    if (!user) return Result.fail('User not found', 'USER_NOT_FOUND');
    await twoFactorRepo.resetUser(userId);
    logger.warn('Two-factor authentication reset', { userId });
    return Result.ok(undefined);
  },
};
