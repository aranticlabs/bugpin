import { randomBytes } from 'node:crypto';
import { usersRepo } from '../database/repositories/users.repo.js';
import { passwordResetTokensRepo } from '../database/repositories/password-reset-tokens.repo.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { emailService } from './email.service.js';
import { usersService } from './users.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { sha256Hex } from '../utils/crypto.js';

const PASSWORD_RESET_EXPIRY_HOURS = 24;

export interface PasswordResetTarget {
  email: string;
  name: string;
}

export const passwordResetService = {
  async sendResetEmail(userId: string): Promise<Result<void>> {
    const user = await usersRepo.findById(userId);
    if (!user) return Result.fail('User not found', 'NOT_FOUND');
    if (!user.isActive) return Result.fail('User account is disabled', 'USER_DISABLED');
    if (user.invitationSentAt && !user.invitationAcceptedAt) {
      return Result.fail('User has not accepted the invitation yet', 'INVITATION_PENDING');
    }

    const settings = await settingsRepo.getAll();
    if (!settings.appUrl) {
      return Result.fail(
        'Set the Application URL in Settings > General before sending reset links',
        'APP_URL_MISSING'
      );
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    await passwordResetTokensRepo.deleteByUserId(userId);
    await passwordResetTokensRepo.create(userId, sha256Hex(token), expiresAt);

    const sent = await emailService.sendPasswordResetEmail(
      { email: user.email, name: user.name },
      {
        resetUrl: `${settings.appUrl}/admin/reset-password?token=${token}`,
        expiresInHours: PASSWORD_RESET_EXPIRY_HOURS,
      }
    );
    if (!sent.success) {
      await passwordResetTokensRepo.deleteByUserId(userId);
      return Result.fail(sent.error || 'Failed to send the reset email', 'EMAIL_FAILED');
    }

    logger.info('Password reset email sent', { userId });
    return Result.ok(undefined);
  },

  async validateToken(token: string): Promise<Result<PasswordResetTarget>> {
    const reset = await passwordResetTokensRepo.findValidByHash(sha256Hex(token));
    if (!reset) return Result.fail('This reset link is invalid or has expired', 'INVALID_TOKEN');

    const user = await usersRepo.findById(reset.userId);
    if (!user || !user.isActive) {
      return Result.fail('This reset link is invalid or has expired', 'INVALID_TOKEN');
    }

    return Result.ok({ email: user.email, name: user.name });
  },

  async completeReset(token: string, password: string): Promise<Result<void>> {
    const target = await this.validateToken(token);
    if (!target.success) return target;
    const reset = await passwordResetTokensRepo.findValidByHash(sha256Hex(token));
    if (!reset) return Result.fail('This reset link is invalid or has expired', 'INVALID_TOKEN');

    const updated = await usersService.resetPassword(reset.userId, password);
    if (!updated.success) return updated;

    await passwordResetTokensRepo.markUsed(reset.id);
    await passwordResetTokensRepo.deleteByUserId(reset.userId);
    logger.info('Password reset completed', { userId: reset.userId });
    return Result.ok(undefined);
  },
};
