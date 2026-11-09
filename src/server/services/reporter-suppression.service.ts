import { reporterSuppressionsRepo } from '../database/repositories/reporter-suppressions.repo.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { signToken, verifySignedToken } from '../utils/signed-token.js';
import { isValidEmail } from '../utils/validators.js';
import { Result } from '../utils/result.js';

export const reporterSuppressionService = {
  isSuppressed(email: string): boolean {
    return reporterSuppressionsRepo.has(normalizeEmail(email));
  },

  unsubscribeToken(email: string): string {
    const normalized = normalizeEmail(email);
    return `${Buffer.from(normalized).toString('base64url')}.${signToken('unsubscribe', normalized)}`;
  },

  verify(token: string): Result<string> {
    if (token.length > 2048)
      return Result.fail('This unsubscribe link is not valid', 'INVALID_TOKEN');
    const [encoded, signature, extra] = token.split('.');
    const email = Buffer.from(encoded ?? '', 'base64url').toString('utf8');
    if (
      !encoded ||
      !signature ||
      extra !== undefined ||
      email !== normalizeEmail(email) ||
      !isValidEmail(email) ||
      !verifySignedToken('unsubscribe', email, signature)
    )
      return Result.fail('This unsubscribe link is not valid', 'INVALID_TOKEN');
    return Result.ok(email);
  },

  unsubscribe(token: string): Result<void> {
    const verified = this.verify(token);
    if (!verified.success) return verified;
    reporterSuppressionsRepo.insert(verified.value, 'unsubscribe');
    return Result.ok(undefined);
  },
};
