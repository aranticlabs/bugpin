import { portalOperatorsRepo } from '../database/repositories/portal-operators.repo.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { authService, type SecondFactorInput } from './auth.service.js';
import { twoFactorService } from './two-factor.service.js';
import { loginChallengeService } from './login-challenge.service.js';
import { settingsCacheService } from './settings-cache.service.js';
import { emailService } from './email.service.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { maskEmail } from '../utils/mask-email.js';
import { generateSecureToken, hashToken } from '../utils/secure-token.js';
import { securePortalBaseUrl } from '../utils/portal-url.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { LocaleCode, User } from '@shared/types';
import type { PortalOperator, PortalTeamLoginResult } from '@shared/portal-types';

const VERIFICATION_LIFETIME_MS = 15 * 60000;
// Staff work in the English-only Admin Console, so team sign-in email uses the same language.
const TEAM_EMAIL_LOCALE: LocaleCode = 'en';
const SESSION_TOUCH_INTERVAL_MS = 3600000;

export interface PortalOperatorSessionGrant {
  secret: string;
  expiresAt: string;
}

export interface TeamLoginOutcome {
  result: PortalTeamLoginResult;
  session?: PortalOperatorSessionGrant;
}

function toOperator(user: User): PortalOperator {
  return { id: user.id, email: user.email, name: user.name };
}

const invalidCredentials = () =>
  Result.fail<never>('Invalid email or password', 'INVALID_CREDENTIALS');
const invalidLink = () => Result.fail<never>('This link is not valid', 'INVALID_TOKEN');

async function accountGate(user: User): Promise<Result<void>> {
  if (!user.isActive) return invalidCredentials();
  if (user.mustChangePassword)
    return Result.fail(
      'Change your password in the Admin Console before signing in here',
      'PASSWORD_CHANGE_REQUIRED'
    );
  if ((await twoFactorService.describeUser(user)).twoFactorSetupRequired)
    return Result.fail(
      'Set up two-factor authentication in the Admin Console before signing in here',
      'TWO_FACTOR_SETUP_REQUIRED'
    );
  return Result.ok(undefined);
}

function sessionStillValid(user: User, createdAt: string): boolean {
  if (!user.passwordChangedAt) return true;
  return Date.parse(user.passwordChangedAt) <= Date.parse(createdAt);
}

export const portalOperatorAuthService = {
  /** Whether team sessions stay valid: the setting is on and the portal has a secure address */
  async enabled(): Promise<boolean> {
    const settings = await settingsCacheService.getAll();
    return settings.portalTeamSignIn && securePortalBaseUrl(settings) !== null;
  },

  /**
   * The team sign-in page while new sign-ins are open, or null. Signing in also needs the
   * Reporter Portal in use, as the instance default or in a project, so an instance without it
   * offers no second staff password form.
   */
  async signInUrl(): Promise<string | null> {
    const settings = await settingsCacheService.getAll();
    const baseUrl = securePortalBaseUrl(settings);
    if (!settings.portalTeamSignIn || !baseUrl) return null;
    if (!settings.reporterPortal.enabled && !projectsRepo.hasEnabledReporterPortal()) return null;
    return new URL('/reporter-portal/team-login', baseUrl).href;
  },

  async login(
    email: string,
    password: string,
    meta: { ipAddress?: string; userAgent?: string }
  ): Promise<Result<TeamLoginOutcome>> {
    const verified = await authService.verifyCredentials(email, password);
    // A disabled account answers like a wrong password, so the public portal does not reveal staff accounts.
    if (!verified.success) return invalidCredentials();
    const user = verified.value;
    const gate = await accountGate(user);
    if (!gate.success) return gate;
    if (await twoFactorService.hasSecondFactor(user.id)) {
      return Result.ok({
        result: {
          status: 'twoFactorRequired',
          challengeToken: loginChallengeService.create(user.id, meta, 'portal'),
          methods: { totp: await twoFactorService.hasTotp(user.id), recoveryCode: true },
        },
      });
    }
    return this.complete(user);
  },

  async completeTwoFactor(
    challengeToken: string,
    input: SecondFactorInput
  ): Promise<Result<TeamLoginOutcome>> {
    const attempt = loginChallengeService.beginAttempt(challengeToken, Date.now(), 'portal');
    if (!attempt.ok)
      return attempt.reason === 'locked'
        ? Result.fail(
            'Too many failed attempts. Wait 15 minutes, then sign in again.',
            'TOO_MANY_ATTEMPTS'
          )
        : Result.fail('The sign-in attempt expired. Sign in again.', 'CHALLENGE_EXPIRED');
    const { userId } = attempt.pending;
    const valid =
      'code' in input
        ? await twoFactorService.verifyLoginCode(userId, input.code)
        : await twoFactorService.verifyRecoveryCode(userId, input.recoveryCode);
    if (!valid) {
      loginChallengeService.recordFailure(challengeToken);
      logger.warn('Portal team sign-in second factor rejected', { userId });
      return Result.fail('The code is not valid', 'INVALID_CODE');
    }
    loginChallengeService.consume(challengeToken);
    loginChallengeService.recordSuccess(userId);
    const user = await usersRepo.findById(userId);
    if (!user) return invalidCredentials();
    const gate = await accountGate(user);
    if (!gate.success) return gate;
    return this.complete(user);
  },

  /**
   * Password and second factor are verified. A confirmed mailbox signs in directly; otherwise a
   * one-time link goes to the account's email, and only that link can create the first session.
   */
  async complete(user: User): Promise<Result<TeamLoginOutcome>> {
    const email = normalizeEmail(user.email);
    if (portalOperatorsRepo.verifiedEmail(user.id) === email) {
      logger.info('Portal team sign-in', { userId: user.id });
      return Result.ok({
        result: { status: 'signedIn', operator: toOperator(user) },
        session: await this.createSession(user.id),
      });
    }
    const sent = await this.sendVerification(user.id, email);
    if (!sent.success) return sent;
    return Result.ok({ result: { status: 'verificationSent', maskedEmail: maskEmail(email) } });
  },

  async sendVerification(userId: string, email: string): Promise<Result<void>> {
    try {
      const settings = await settingsCacheService.getAll();
      const baseUrl = securePortalBaseUrl(settings);
      if (baseUrl && settings.smtpEnabled && settings.smtpConfig.host && settings.smtpConfig.from) {
        const secret = generateSecureToken();
        const now = new Date().toISOString();
        portalOperatorsRepo.createToken({
          tokenHash: hashToken(secret),
          userId,
          email,
          now,
          expiresAt: new Date(Date.parse(now) + VERIFICATION_LIFETIME_MS).toISOString(),
        });
        const verifyUrl = new URL('/reporter-portal/team-login/verify', baseUrl);
        verifyUrl.hash = secret;
        const delivered = await emailService.sendReporterLoginEmail(email, {
          loginUrl: verifyUrl.href,
          loginToken: { email, secret },
          locale: TEAM_EMAIL_LOCALE,
        });
        if (delivered.success) return Result.ok(undefined);
      }
    } catch {
      // Transport errors are returned without exposing SMTP details.
    }
    logger.warn('Portal team sign-in confirmation email failed', { userId });
    return Result.fail('Could not send the confirmation email', 'EMAIL_DELIVERY_FAILED');
  },

  async preview(
    secret: string
  ): Promise<Result<{ state: 'valid' | 'expired' | 'invalid'; maskedEmail?: string }>> {
    const token = portalOperatorsRepo.findTokenByHash(hashToken(secret));
    if (!token || token.consumedAt) return Result.ok({ state: 'invalid' });
    const user = await usersRepo.findById(token.userId);
    if (!user?.isActive || normalizeEmail(user.email) !== token.email)
      return Result.ok({ state: 'invalid' });
    return Result.ok({
      state: Date.parse(token.expiresAt) <= Date.now() ? 'expired' : 'valid',
      maskedEmail: maskEmail(token.email),
    });
  },

  async exchange(
    secret: string
  ): Promise<Result<{ operator: PortalOperator; session: PortalOperatorSessionGrant }>> {
    const token = portalOperatorsRepo.findTokenByHash(hashToken(secret));
    if (!token) return invalidLink();
    const user = await usersRepo.findById(token.userId);
    if (!user?.isActive || normalizeEmail(user.email) !== token.email) return invalidLink();
    const gate = await accountGate(user);
    if (!gate.success) return gate;
    const settings = await settingsCacheService.getAll();
    const sessionSecret = generateSecureToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.parse(now) + settings.sessionMaxAgeDays * 86400000
    ).toISOString();
    const consumed = portalOperatorsRepo.transaction(() => {
      if (!portalOperatorsRepo.consumeToken(token.id, now)) return false;
      portalOperatorsRepo.setVerifiedEmail(user.id, token.email);
      portalOperatorsRepo.createSession({
        tokenHash: hashToken(sessionSecret),
        userId: user.id,
        now,
        expiresAt,
      });
      return true;
    });
    if (!consumed) return invalidLink();
    logger.info('Portal team sign-in confirmed', { userId: user.id });
    return Result.ok({
      operator: toOperator(user),
      session: { secret: sessionSecret, expiresAt },
    });
  },

  async createSession(userId: string): Promise<PortalOperatorSessionGrant> {
    const settings = await settingsCacheService.getAll();
    const secret = generateSecureToken();
    const now = new Date().toISOString();
    const { expiresAt } = portalOperatorsRepo.createSession({
      tokenHash: hashToken(secret),
      userId,
      now,
      expiresAt: new Date(Date.parse(now) + settings.sessionMaxAgeDays * 86400000).toISOString(),
    });
    return { secret, expiresAt };
  },

  /**
   * A team session lasts only while the feature is on, the account stays active and unchanged
   * in email and password, and the account needs no setup step in the Admin Console.
   */
  async validateSession(
    secret: string
  ): Promise<Result<{ operator: PortalOperator; sessionId: string; expiresAt: string }>> {
    const unauthorized = Result.fail<never>('Authentication required', 'UNAUTHORIZED');
    const session = portalOperatorsRepo.findSessionByHash(hashToken(secret));
    const now = Date.now();
    if (!session || session.revokedAt || Date.parse(session.expiresAt) <= now) return unauthorized;
    if (!(await this.enabled())) return unauthorized;
    const user = await usersRepo.findById(session.userId);
    if (
      !user ||
      portalOperatorsRepo.verifiedEmail(user.id) !== normalizeEmail(user.email) ||
      !sessionStillValid(user, session.createdAt) ||
      !(await accountGate(user)).success
    )
      return unauthorized;
    if (now - Date.parse(session.lastUsedAt) >= SESSION_TOUCH_INTERVAL_MS)
      portalOperatorsRepo.touchSession(session.id, new Date(now).toISOString());
    return Result.ok({
      operator: toOperator(user),
      sessionId: session.id,
      expiresAt: session.expiresAt,
    });
  },

  /** Revokes the session behind a cookie even when it no longer validates */
  logoutBySecret(secret: string): void {
    const session = portalOperatorsRepo.findSessionByHash(hashToken(secret));
    if (session) portalOperatorsRepo.revokeSession(session.id, new Date().toISOString());
  },
};
