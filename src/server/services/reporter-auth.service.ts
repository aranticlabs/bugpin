import { reporterAuthTokensRepo } from '../database/repositories/reporter-auth-tokens.repo.js';
import { reporterSessionsRepo } from '../database/repositories/reporter-sessions.repo.js';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { reporterSuppressionsRepo } from '../database/repositories/reporter-suppressions.repo.js';
import { reporterOwnershipRepo } from '../database/repositories/reporter-ownership.repo.js';
import { reporterOwnershipService } from './reporter-ownership.service.js';
import { settingsCacheService } from './settings-cache.service.js';
import { emailService } from './email.service.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { normalizeLocale } from '../utils/locale.js';
import { maskEmail } from '../utils/mask-email.js';
import { generateSecureToken, hashToken } from '../utils/secure-token.js';
import { isValidEmail } from '../utils/validators.js';
import { isSecurePortalUrl } from '../utils/portal-url.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { Reporter, ReporterAuthTokenSource, LocaleCode } from '@shared/types';
import type { PortalMe } from '@shared/portal-types';

function toPortalMe(reporter: Reporter): PortalMe {
  return {
    id: reporter.id,
    email: reporter.email,
    displayName: reporter.displayName,
    locale: reporter.locale,
    emailUpdates: !reporterSuppressionsRepo.has(reporter.email),
  };
}

const invalidToken = () => Result.fail<never>('This link is not valid', 'INVALID_TOKEN');
const sessionLifetime = 30 * 86400000;
const absoluteSessionLifetime = 90 * 86400000;

export const reporterAuthService = {
  mintLoginToken(
    email: string,
    source: ReporterAuthTokenSource,
    reportId?: string
  ): Result<{ email: string; secret: string; expiresAt: string }> {
    email = normalizeEmail(email);
    if (!isValidEmail(email)) return Result.fail('Invalid email address', 'INVALID_EMAIL');
    if (reportersRepo.findByEmail(email)?.suspendedAt)
      return Result.fail('Reporter is suspended', 'REPORTER_SUSPENDED');
    const secret = generateSecureToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.parse(now) + (source === 'request' ? 15 * 60000 : 24 * 3600000)
    ).toISOString();
    reporterAuthTokensRepo.create({
      email,
      tokenHash: hashToken(secret),
      source,
      reportId,
      now,
      expiresAt,
    });
    return Result.ok({ email, secret, expiresAt });
  },

  async requestLogin(email: string, locale: LocaleCode = 'en'): Promise<Result<void>> {
    try {
      const settings = await settingsCacheService.getAll();
      if (
        !isSecurePortalUrl(settings.appUrl) ||
        (settings.portalBaseUrl && !isSecurePortalUrl(settings.portalBaseUrl)) ||
        !settings.smtpEnabled ||
        !settings.smtpConfig.host ||
        !settings.smtpConfig.from
      )
        return Result.ok(undefined);
      // SMTP latency and delivery failures must not reveal whether an account exists.
      void this.sendLoginLink(email, locale)
        .then((sent) => {
          if (!sent.success && sent.code === 'EMAIL_DELIVERY_FAILED')
            logger.warn('Reporter login email delivery failed');
        })
        .catch(() => logger.warn('Reporter login request failed'));
    } catch {
      logger.warn('Reporter login request failed');
    }
    return Result.ok(undefined);
  },

  async sendLoginLink(email: string, locale: LocaleCode = 'en'): Promise<Result<void>> {
    const minted = this.mintLoginToken(email, 'request');
    if (!minted.success) return minted;
    try {
      const settings = await settingsCacheService.getAll();
      const loginUrl = new URL('/reporter-portal/login', settings.portalBaseUrl || settings.appUrl);
      loginUrl.hash = minted.value.secret;
      const sent = await emailService.sendReporterLoginEmail(minted.value.email, {
        loginUrl: loginUrl.href,
        loginToken: minted.value,
        locale: normalizeLocale(reportersRepo.findByEmail(minted.value.email)?.locale) ?? locale,
      });
      if (sent.success) return Result.ok(undefined);
    } catch {
      // Transport errors are returned without exposing SMTP details.
    }
    return Result.fail('Could not send the login email', 'EMAIL_DELIVERY_FAILED');
  },

  preview(
    secret: string
  ): Result<{ state: 'valid' | 'expired' | 'invalid'; maskedEmail?: string }> {
    const token = reporterAuthTokensRepo.findByHash(hashToken(secret));
    if (
      !token ||
      token.consumedAt ||
      token.revokedAt ||
      reportersRepo.findByEmail(token.email)?.suspendedAt
    ) {
      return Result.ok({ state: 'invalid' });
    }
    return Result.ok({
      state: Date.parse(token.expiresAt) <= Date.now() ? 'expired' : 'valid',
      maskedEmail: maskEmail(token.email),
    });
  },

  resendTarget(secret: string): Result<string | null> {
    const token = reporterAuthTokensRepo.findByHash(hashToken(secret));
    if (
      !token ||
      token.source === 'request' ||
      token.consumedAt ||
      token.revokedAt ||
      Date.parse(token.expiresAt) > Date.now() ||
      reportersRepo.findByEmail(token.email)?.suspendedAt
    )
      return Result.ok(null);
    return Result.ok(token.email);
  },

  async resend(secret: string): Promise<Result<void>> {
    const target = this.resendTarget(secret);
    if (target.success && target.value) await this.requestLogin(target.value);
    return Result.ok(undefined);
  },

  exchange(
    secret: string,
    previousSessionSecret?: string
  ): Result<{
    reporter: PortalMe;
    attachedReportCount: number;
    targetReportId?: string;
    sessionSecret: string;
    expiresAt: string;
  }> {
    const sessionSecret = generateSecureToken();
    const sessionHash = hashToken(sessionSecret);
    const tokenHash = hashToken(secret);
    const previousHash = previousSessionSecret ? hashToken(previousSessionSecret) : null;
    const now = new Date().toISOString();
    return reportersRepo.transaction(() => {
      const token = reporterAuthTokensRepo.findByHash(tokenHash);
      if (
        !token ||
        token.consumedAt ||
        token.revokedAt ||
        Date.parse(token.expiresAt) <= Date.parse(now) ||
        reportersRepo.findByEmail(token.email)?.suspendedAt
      )
        return invalidToken();
      if (!reporterAuthTokensRepo.consume(token.id, now)) return invalidToken();
      const displayName = token.email
        .split('@')[0]
        .replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 80);
      const reporter = reportersRepo.resolve(token.email, displayName, now);
      const attachedReportCount = Result.unwrap(
        reporterOwnershipService.attachClaimable(reporter.id, reporter.email)
      );
      const session = reporterSessionsRepo.create({
        tokenHash: sessionHash,
        reporterId: reporter.id,
        now,
        expiresAt: new Date(Date.parse(now) + sessionLifetime).toISOString(),
        absoluteExpiresAt: new Date(Date.parse(now) + absoluteSessionLifetime).toISOString(),
      });
      if (previousHash) {
        const previous = reporterSessionsRepo.findByHash(previousHash);
        if (previous) reporterSessionsRepo.revoke(previous.id, now);
      }
      const updated = reportersRepo.recordLogin(reporter.id, now);
      return Result.ok({
        reporter: toPortalMe(updated),
        attachedReportCount,
        sessionSecret,
        expiresAt: session.expiresAt,
        ...(token.reportId && reporterOwnershipRepo.canAccess(token.reportId, reporter.id)
          ? { targetReportId: token.reportId }
          : {}),
      });
    });
  },

  validateSession(
    secret: string
  ): Result<{ reporter: PortalMe; sessionId: string; expiresAt: string }> {
    const session = reporterSessionsRepo.findByHash(hashToken(secret));
    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      Date.parse(session.expiresAt) <= now ||
      Date.parse(session.absoluteExpiresAt) <= now
    )
      return Result.fail('Authentication required', 'UNAUTHORIZED');
    const reporter = reportersRepo.findById(session.reporterId);
    if (!reporter || reporter.suspendedAt)
      return Result.fail('Authentication required', 'UNAUTHORIZED');
    if (now - Date.parse(session.lastUsedAt) >= 3600000) {
      session.expiresAt = new Date(
        Math.min(now + sessionLifetime, Date.parse(session.absoluteExpiresAt))
      ).toISOString();
      reporterSessionsRepo.renew(session.id, new Date(now).toISOString(), session.expiresAt);
    }
    return Result.ok({
      reporter: toPortalMe(reporter),
      sessionId: session.id,
      expiresAt: session.expiresAt,
    });
  },

  logout(sessionId: string): Result<void> {
    reporterSessionsRepo.revoke(sessionId, new Date().toISOString());
    return Result.ok(undefined);
  },
};
