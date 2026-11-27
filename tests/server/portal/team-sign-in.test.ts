import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { authRoutes } from '../../../src/server/routes/api/auth';
import { getDb } from '../../../src/server/database/database';
import { config } from '../../../src/server/config';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { reportMessagesRepo } from '../../../src/server/database/repositories/report-messages.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { emailService } from '../../../src/server/services/email.service';
import { authService } from '../../../src/server/services/auth.service';
import { twoFactorService } from '../../../src/server/services/two-factor.service';
import { loginChallengeService } from '../../../src/server/services/login-challenge.service';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { portalOperatorAuthService } from '../../../src/server/services/portal-operator-auth.service';
import { settingsService } from '../../../src/server/services/settings.service';
import { usersService } from '../../../src/server/services/users.service';
import { userAccessService } from '../../../src/server/services/user-access.service';
import { clearAllRateLimits } from '../../../src/server/middleware/rate-limit';
import { reporterCopy } from '../../../src/server/i18n/reporter-copy';
import { generateTotpCode, timeStep } from '../../../src/server/utils/totp';
import { logger } from '../../../src/server/utils/logger';
import { Result } from '../../../src/server/utils/result';
import type { User } from '../../../src/shared/types';
import type {
  PortalProject,
  PortalReportDetail,
  PortalReportList,
} from '../../../src/shared/portal-types';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';

const OPERATOR_COOKIE = 'bugpin_portal_operator_session';
const REPORTER_COOKIE = 'bugpin_reporter_session';
const password = 'correct-horse-battery-1';
const past = '2026-01-01T00:00:00.000Z';
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

let portalInUse: ReturnType<typeof spyOn>;
let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let sent: Parameters<typeof emailService.sendEmail>[0][];
let restoreLogger: () => void;

interface ErrorBody {
  success: false;
  error: string;
  message: string;
}
interface LoginBody {
  success: true;
  status: 'signedIn' | 'twoFactorRequired' | 'verificationSent';
  operator?: { id: string; email: string; name: string };
  challengeToken?: string;
  methods?: { totp: boolean; recoveryCode: boolean };
  maskedEmail?: string;
}

beforeEach(async () => {
  const originalInfo = logger.info;
  const originalWarn = logger.warn;
  logger.info = () => undefined;
  logger.warn = () => undefined;
  restoreLogger = () => {
    logger.info = originalInfo;
    logger.warn = originalWarn;
  };
  close = await openPortalDatabase();
  await settingsRepo.updateAll({ portalTeamSignIn: true, twoFactorPolicy: 'off' });
  settingsCacheService.invalidate();
  loginChallengeService.clear();
  app = createPortalTestApp();
  app.route('/api/auth', authRoutes);
  // Signing in needs the Reporter Portal in use; the availability tests cover that rule.
  portalInUse = spyOn(projectsRepo, 'hasEnabledReporterPortal').mockReturnValue(true);
  sent = [];
  spyOn(emailService, 'sendEmail').mockImplementation(async (options) => {
    sent.push(options);
    return { success: true };
  });
});
afterEach(() => {
  mock.restore();
  loginChallengeService.clear();
  close();
  restoreLogger();
});

async function createStaff(
  options: {
    role?: 'admin' | 'editor' | 'viewer';
    email?: string;
    mustChangePassword?: boolean;
  } = {}
): Promise<User> {
  return usersRepo.create({
    email: options.email ?? `staff-${crypto.randomUUID()}@example.test`,
    passwordHash: await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 4 }),
    name: 'Staff Member',
    role: options.role ?? 'editor',
    mustChangePassword: options.mustChangePassword,
  });
}

async function enableTotp(user: User): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await twoFactorService.startTotpSetup(user, 'BugPin', password);
  if (!setup.success) throw new Error(setup.error);
  const code = generateTotpCode(setup.value.secret, timeStep(Date.now()) - 1);
  const confirmed = await twoFactorService.confirmTotpSetup(user.id, code);
  if (!confirmed.success) throw new Error(confirmed.error);
  return { secret: setup.value.secret, recoveryCodes: confirmed.value.recoveryCodes ?? [] };
}

function teamLogin(email: string, pass = password, cookie?: string): Promise<Response> {
  clearAllRateLimits();
  return portalPost(app, '/auth/team/login', { email, password: pass }, cookie);
}

function teamTwoFactor(
  body: { challengeToken: string; code?: string; recoveryCode?: string },
  cookie?: string
): Promise<Response> {
  clearAllRateLimits();
  return portalPost(app, '/auth/team/two-factor', body, cookie);
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function cookieLine(response: Response, name: string): string | undefined {
  return setCookies(response).find((line) => line.startsWith(`${name}=`));
}

function cookieValue(response: Response, name: string): string {
  const line = cookieLine(response, name);
  if (!line) throw new Error(`Missing ${name} cookie`);
  return line.split(';')[0].slice(name.length + 1);
}

function isCleared(response: Response, name: string): boolean {
  return setCookies(response).some((line) => line.startsWith(`${name}=;`));
}

function verificationSecret(): string {
  const mail = sent.at(-1);
  const match = mail?.text?.match(/https:\/\/\S+#([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error('No verification link was sent');
  return match[1];
}

async function confirmOperator(user: User): Promise<string> {
  const login = await teamLogin(user.email);
  expect(((await login.json()) as LoginBody).status).toBe('verificationSent');
  clearAllRateLimits();
  const exchange = await portalPost(app, '/auth/team/verify/exchange', {
    token: verificationSecret(),
  });
  expect(exchange.status).toBe(200);
  return `${OPERATOR_COOKIE}=${cookieValue(exchange, OPERATOR_COOKIE)}`;
}

async function signedInOperator(user?: User): Promise<{ user: User; cookie: string }> {
  const account = user ?? (await createStaff());
  await confirmOperator(account);
  const direct = await teamLogin(account.email);
  expect(((await direct.json()) as LoginBody).status).toBe('signedIn');
  return { user: account, cookie: `${OPERATOR_COOKIE}=${cookieValue(direct, OPERATOR_COOKIE)}` };
}

function portalRequest(path: string, cookie?: string, init: RequestInit = {}): Promise<Response> {
  return Promise.resolve(
    app.request(`${portalOrigin}/api/portal${path}`, {
      ...init,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) },
    })
  );
}

function reporterSession(email = 'reporter@example.com') {
  const token = Result.unwrap(reporterAuthService.mintLoginToken(email, 'request'));
  const session = Result.unwrap(reporterAuthService.exchange(token.secret));
  return {
    id: session.reporter.id,
    secret: session.sessionSecret,
    cookie: `${REPORTER_COOKIE}=${session.sessionSecret}`,
  };
}

function sessionCount(table: 'sessions' | 'portal_operator_sessions'): number {
  return getDb().query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()!
    .count;
}

describe('availability', () => {
  const bodies: Record<string, unknown> = {
    '/auth/team/login': { email: 'someone@example.test', password },
    '/auth/team/two-factor': { challengeToken: 'unknown', code: '123456' },
    '/auth/team/verify/preview': { token: 'unknown' },
    '/auth/team/verify/exchange': { token: 'unknown' },
  };

  it('answers 404 NOT_FOUND on every team route and reports teamSignIn false while the setting is off', async () => {
    await settingsRepo.updateAll({ portalTeamSignIn: false });
    settingsCacheService.invalidate();
    for (const [path, body] of Object.entries(bodies)) {
      const response = await portalPost(app, path, body);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
      expect(((await response.json()) as ErrorBody).error).toBe('NOT_FOUND');
    }
    const config = await portalRequest('/config');
    expect(((await config.json()) as { config: { teamSignIn: boolean } }).config.teamSignIn).toBe(
      false
    );
  });

  it('is enabled only with the setting on and a secure portal base URL', async () => {
    expect(await portalOperatorAuthService.enabled()).toBe(true);
    const config = await portalRequest('/config');
    expect(((await config.json()) as { config: { teamSignIn: boolean } }).config.teamSignIn).toBe(
      true
    );

    await settingsRepo.updateAll({ appUrl: 'http://insecure.example.com' });
    settingsCacheService.invalidate();
    expect(await portalOperatorAuthService.enabled()).toBe(false);
    const insecure = await portalRequest('/config');
    expect(((await insecure.json()) as { config: { teamSignIn: boolean } }).config.teamSignIn).toBe(
      false
    );
  });

  it('is on by default', async () => {
    getDb().run("DELETE FROM settings WHERE key = 'portal_team_sign_in'");
    settingsCacheService.invalidate();
    expect((await settingsRepo.getAll()).portalTeamSignIn).toBe(true);
    expect(await portalOperatorAuthService.enabled()).toBe(true);
  });

  it('opens sign-in only while the Reporter Portal is in use, without ending sessions', async () => {
    portalInUse.mockRestore();
    const open = async () => {
      const response = await portalRequest('/config');
      const { config } = (await response.json()) as { config: { teamSignIn: boolean } };
      expect((await portalOperatorAuthService.signInUrl()) !== null).toBe(config.teamSignIn);
      return config.teamSignIn;
    };
    expect(await open()).toBe(false);
    expect(await portalOperatorAuthService.enabled()).toBe(true);
    const response = await portalPost(app, '/auth/team/login', {
      email: 'someone@example.test',
      password,
    });
    expect(response.status).toBe(404);
    await settingsRepo.updateAll({ reporterPortal: { enabled: true, allowNewReports: true } });
    settingsCacheService.invalidate();
    expect(await open()).toBe(true);
    await settingsRepo.updateAll({ reporterPortal: { enabled: false, allowNewReports: false } });
    settingsCacheService.invalidate();
    expect(await open()).toBe(false);
    await projectsRepo.create({
      name: 'Portal project',
      settings: { reporterPortal: { enabled: true, allowNewReports: true } },
    });
    expect(await open()).toBe(true);
  });

  it('gives every signed-in user the team sign-in address while it is available', async () => {
    const viewer = await createStaff({ role: 'viewer' });
    const session = await sessionsRepo.create({
      userId: viewer.id,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const signInUrl = async (cookie?: string) => {
      const response = await app.request(`${portalOrigin}/api/auth/portal-team-sign-in`, {
        headers: cookie ? { Cookie: cookie } : {},
      });
      return { status: response.status, body: (await response.json()) as { url?: string | null } };
    };
    expect((await signInUrl()).status).toBe(401);
    const available = await signInUrl(`session=${session.id}`);
    expect(available.status).toBe(200);
    expect(available.body.url).toBe(`${portalOrigin}/reporter-portal/team-login`);

    await settingsRepo.updateAll({ portalTeamSignIn: false });
    settingsCacheService.invalidate();
    expect((await signInUrl(`session=${session.id}`)).body.url).toBeNull();
  });

  it('rejects unknown fields and malformed bodies on the credential routes', async () => {
    clearAllRateLimits();
    const extra = await portalPost(app, '/auth/team/login', {
      email: 'a@example.test',
      password,
      role: 'admin',
    });
    expect(extra.status).toBe(400);
    const both = await portalPost(app, '/auth/team/two-factor', {
      challengeToken: 'token',
      code: '123456',
      recoveryCode: 'abcde-fghij',
    });
    expect(both.status).toBe(400);
    const neither = await portalPost(app, '/auth/team/two-factor', { challengeToken: 'token' });
    expect(neither.status).toBe(400);
  });

  it('rate limits team login to five attempts per minute', async () => {
    clearAllRateLimits();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push(
        (await portalPost(app, '/auth/team/login', { email: 'nobody@example.test', password }))
          .status
      );
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('shares one password attempt budget with the Admin Console sign-in', async () => {
    clearAllRateLimits();
    const adminLogin = () =>
      app.request(`${portalOrigin}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Origin: portalOrigin },
        body: JSON.stringify({ email: 'nobody@example.test', password }),
      });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) statuses.push((await adminLogin()).status);
    for (let attempt = 0; attempt < 3; attempt++) {
      statuses.push(
        (await portalPost(app, '/auth/team/login', { email: 'nobody@example.test', password }))
          .status
      );
    }
    expect(statuses.slice(-1)).toEqual([429]);
    expect(statuses.filter((status) => status === 429)).toHaveLength(1);
  });
});

describe('credentials', () => {
  it('answers a wrong password, an unknown email, and a disabled account identically', async () => {
    const active = await createStaff();
    const disabled = await createStaff();
    getDb().run('UPDATE users SET is_active = 0 WHERE id = ?', [disabled.id]);

    const wrong = await teamLogin(active.email, 'not-the-password');
    const unknown = await teamLogin('nobody@example.test');
    const inactive = await teamLogin(disabled.email);

    for (const response of [wrong, unknown, inactive]) {
      expect(response.status).toBe(401);
      expect(cookieLine(response, OPERATOR_COOKIE)).toBeUndefined();
    }
    const bodies = await Promise.all([wrong, unknown, inactive].map((r) => r.json()));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual(bodies[2]);
    expect((bodies[2] as ErrorBody).error).toBe('INVALID_CREDENTIALS');
    expect(sent).toHaveLength(0);
  });

  it('refuses accounts that must change their password before sending any email', async () => {
    const user = await createStaff({ mustChangePassword: true });
    const response = await teamLogin(user.email);
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(sent).toHaveLength(0);
    expect(cookieLine(response, OPERATOR_COOKIE)).toBeUndefined();
  });

  it('refuses accounts that the policy requires to set up two-factor first', async () => {
    await settingsRepo.updateAll({ twoFactorPolicy: 'everyone' });
    settingsCacheService.invalidate();
    const user = await createStaff({ role: 'viewer' });
    const response = await teamLogin(user.email);
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error).toBe('TWO_FACTOR_SETUP_REQUIRED');
    expect(sent).toHaveLength(0);
  });

  it('lets staff of every role start the verification flow', async () => {
    for (const role of ['admin', 'editor', 'viewer'] as const) {
      const user = await createStaff({ role });
      const response = await teamLogin(user.email);
      expect(response.status).toBe(200);
      expect(((await response.json()) as LoginBody).status).toBe('verificationSent');
    }
  });
});

describe('first sign-in verification', () => {
  it('sends a single-use link by email without creating any session or cookie', async () => {
    const user = await createStaff({ email: 'jane.doe@example.test' });
    const response = await teamLogin(user.email);
    const body = (await response.json()) as LoginBody;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: 'verificationSent',
      maskedEmail: 'j***@example.test',
    });
    expect(setCookies(response)).toEqual([]);
    expect(sessionCount('portal_operator_sessions')).toBe(0);
    expect(sessionCount('sessions')).toBe(0);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([{ email: 'jane.doe@example.test' }]);
    expect(sent[0].subject).toBe(reporterCopy.en.login);
    const link = sent[0].text?.match(/https:\/\/\S+/)?.[0] ?? '';
    const url = new URL(link);
    expect(url.origin).toBe(portalOrigin);
    expect(url.pathname).toBe('/reporter-portal/team-login/verify');
    expect(url.hash).toMatch(/^#[A-Za-z0-9_-]{43}$/);
    expect(url.search).toBe('');
  });

  it('uses the configured portal base URL for the link', async () => {
    await settingsRepo.updateAll({ portalBaseUrl: 'https://portal.example.test' });
    settingsCacheService.invalidate();
    const user = await createStaff();
    clearAllRateLimits();
    const response = await app.request('https://portal.example.test/api/portal/auth/team/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: 'https://portal.example.test',
        'X-BugPin-Portal': '1',
      },
      body: JSON.stringify({ email: user.email, password }),
    });
    expect(response.status).toBe(200);
    expect(sent[0].text).toContain(
      'https://portal.example.test/reporter-portal/team-login/verify#'
    );
  });

  it('stores only a hash of the token, valid for 15 minutes', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    const secret = verificationSecret();
    const row = getDb()
      .query<{ token_hash: string; created_at: string; expires_at: string; email: string }, []>(
        'SELECT token_hash, created_at, expires_at, email FROM portal_operator_tokens'
      )
      .get()!;
    expect(row.token_hash).not.toBe(secret);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row.email).toBe(user.email);
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(15 * 60000);
  });

  it('returns 503 EMAIL_DELIVERY_FAILED without a cookie when the email cannot be sent', async () => {
    const user = await createStaff();
    (emailService.sendEmail as ReturnType<typeof spyOn>).mockImplementation(async () => ({
      success: false,
      error: 'SMTP down',
    }));
    const response = await teamLogin(user.email);
    expect(response.status).toBe(503);
    const body = (await response.json()) as ErrorBody;
    expect(body.error).toBe('EMAIL_DELIVERY_FAILED');
    expect(JSON.stringify(body)).not.toContain('SMTP down');
    expect(setCookies(response)).toEqual([]);

    await settingsRepo.updateAll({ smtpEnabled: false });
    settingsCacheService.invalidate();
    expect((await teamLogin(user.email)).status).toBe(503);
  });

  it('previews valid, expired, consumed, and unknown links', async () => {
    const user = await createStaff({ email: 'jane@example.test' });
    await teamLogin(user.email);
    const secret = verificationSecret();
    const preview = async (token: string) =>
      (await portalPost(app, '/auth/team/verify/preview', { token })).json();

    expect(await preview(secret)).toEqual({
      success: true,
      state: 'valid',
      maskedEmail: 'j***@example.test',
    });
    expect(await preview('x'.repeat(43))).toEqual({ success: true, state: 'invalid' });

    getDb().run('UPDATE portal_operator_tokens SET expires_at = ?', [past]);
    expect(await preview(secret)).toMatchObject({ state: 'expired' });

    getDb().run('UPDATE portal_operator_tokens SET expires_at = ?', [
      new Date(Date.now() + 60000).toISOString(),
    ]);
    expect((await portalPost(app, '/auth/team/verify/exchange', { token: secret })).status).toBe(
      200
    );
    expect(await preview(secret)).toEqual({ success: true, state: 'invalid' });
  });

  it('does not consume the link when it is previewed', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    const secret = verificationSecret();
    await portalPost(app, '/auth/team/verify/preview', { token: secret });
    await portalPost(app, '/auth/team/verify/preview', { token: secret });
    expect((await portalPost(app, '/auth/team/verify/exchange', { token: secret })).status).toBe(
      200
    );
  });

  it('exchanges the link for an operator session cookie and never sets the staff cookie', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    const response = await portalPost(app, '/auth/team/verify/exchange', {
      token: verificationSecret(),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      operator: { id: user.id, email: user.email, name: 'Staff Member' },
    });

    const line = cookieLine(response, OPERATOR_COOKIE)!;
    expect(line).toMatch(new RegExp(`^${OPERATOR_COOKIE}=[A-Za-z0-9_-]{43};`));
    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Lax');
    expect(line).toContain('Path=/');
    expect(line).toContain('Secure');
    expect(line).toContain('Expires=');
    expect(cookieLine(response, 'session')).toBeUndefined();
    expect(setCookies(response)).toHaveLength(1);
    expect(sessionCount('sessions')).toBe(0);
    expect(
      getDb()
        .query<{ email: string }, [string]>(
          'SELECT portal_verified_email AS email FROM users WHERE id = ?'
        )
        .get(user.id)?.email
    ).toBe(user.email);
  });

  it('lasts for sessionMaxAgeDays', async () => {
    await settingsRepo.updateAll({ sessionMaxAgeDays: 3 });
    settingsCacheService.invalidate();
    const user = await createStaff();
    await teamLogin(user.email);
    const response = await portalPost(app, '/auth/team/verify/exchange', {
      token: verificationSecret(),
    });
    const row = getDb()
      .query<{ created_at: string; expires_at: string }, []>(
        'SELECT created_at, expires_at FROM portal_operator_sessions'
      )
      .get()!;
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(3 * 86400000);
    expect(cookieLine(response, OPERATOR_COOKIE)).toContain(
      `Expires=${new Date(row.expires_at).toUTCString()}`
    );
  });

  it('accepts a link only once', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    const secret = verificationSecret();
    const first = await portalPost(app, '/auth/team/verify/exchange', { token: secret });
    const second = await portalPost(app, '/auth/team/verify/exchange', { token: secret });
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(((await second.json()) as ErrorBody).error).toBe('INVALID_TOKEN');
    expect(setCookies(second)).toEqual([]);
    expect(sessionCount('portal_operator_sessions')).toBe(1);
  });

  it('refuses an expired link', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    getDb().run('UPDATE portal_operator_tokens SET expires_at = ?', [past]);
    const response = await portalPost(app, '/auth/team/verify/exchange', {
      token: verificationSecret(),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error).toBe('INVALID_TOKEN');
    expect(sessionCount('portal_operator_sessions')).toBe(0);
  });

  it('refuses an unknown link and a link whose account email changed', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    expect(
      (await portalPost(app, '/auth/team/verify/exchange', { token: 'y'.repeat(43) })).status
    ).toBe(400);
    getDb().run("UPDATE users SET email = 'changed@example.test' WHERE id = ?", [user.id]);
    const response = await portalPost(app, '/auth/team/verify/exchange', {
      token: verificationSecret(),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error).toBe('INVALID_TOKEN');
    const preview = await portalPost(app, '/auth/team/verify/preview', {
      token: verificationSecret(),
    });
    expect(((await preview.json()) as { state: string }).state).toBe('invalid');
  });

  it('refuses the exchange once the account is disabled or must change its password', async () => {
    const user = await createStaff();
    await teamLogin(user.email);
    const secret = verificationSecret();
    getDb().run('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
    const changeRequired = await portalPost(app, '/auth/team/verify/exchange', { token: secret });
    expect(changeRequired.status).toBe(403);
    expect(((await changeRequired.json()) as ErrorBody).error).toBe('PASSWORD_CHANGE_REQUIRED');
    getDb().run('UPDATE users SET must_change_password = 0, is_active = 0 WHERE id = ?', [user.id]);
    const disabled = await portalPost(app, '/auth/team/verify/exchange', { token: secret });
    expect(disabled.status).toBe(400);
    expect(((await disabled.json()) as ErrorBody).error).toBe('INVALID_TOKEN');
    expect(sessionCount('portal_operator_sessions')).toBe(0);
  });
});

describe('later sign-ins', () => {
  it('signs in directly once the email is verified', async () => {
    const user = await createStaff();
    await confirmOperator(user);
    sent.length = 0;

    const response = await teamLogin(user.email);
    const body = (await response.json()) as LoginBody;
    expect(body).toEqual({
      success: true,
      status: 'signedIn',
      operator: { id: user.id, email: user.email, name: 'Staff Member' },
    });
    expect(cookieValue(response, OPERATOR_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieLine(response, OPERATOR_COOKIE)).toContain('HttpOnly');
    expect(cookieLine(response, 'session')).toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(sessionCount('sessions')).toBe(0);
  });

  it('requires a new verification after the account email changed', async () => {
    const { user } = await signedInOperator();
    getDb().run("UPDATE users SET email = 'moved@example.test' WHERE id = ?", [user.id]);
    sent.length = 0;
    const response = await teamLogin('moved@example.test');
    const body = (await response.json()) as LoginBody;
    expect(body.status).toBe('verificationSent');
    expect(cookieLine(response, OPERATOR_COOKIE)).toBeUndefined();
    expect(sent[0].to).toEqual([{ email: 'moved@example.test' }]);
  });

  it('matches the verified email case-insensitively', async () => {
    const user = await createStaff({ email: 'Mixed.Case@Example.test' });
    await confirmOperator(user);
    const response = await teamLogin('MIXED.case@example.TEST');
    expect(((await response.json()) as LoginBody).status).toBe('signedIn');
  });
});

describe('second factor', () => {
  it('asks for a code, then signs in through the verification link on first use', async () => {
    const user = await createStaff();
    const { secret } = await enableTotp(user);

    const login = await teamLogin(user.email);
    const body = (await login.json()) as LoginBody;
    expect(body.status).toBe('twoFactorRequired');
    expect(body.methods).toEqual({ totp: true, recoveryCode: true });
    expect(body.challengeToken).toBeString();
    expect(setCookies(login)).toEqual([]);
    expect(sent).toHaveLength(0);

    const wrong = await teamTwoFactor({ challengeToken: body.challengeToken!, code: '000000' });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as ErrorBody).error).toBe('INVALID_CODE');
    expect(sent).toHaveLength(0);

    const ok = await teamTwoFactor({
      challengeToken: body.challengeToken!,
      code: generateTotpCode(secret, timeStep(Date.now())),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as LoginBody).status).toBe('verificationSent');
    expect(cookieLine(ok, OPERATOR_COOKIE)).toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it('signs in with a TOTP code after the email is verified and consumes the challenge', async () => {
    const user = await createStaff();
    const { secret } = await enableTotp(user);
    getDb().run('UPDATE users SET portal_verified_email = ? WHERE id = ?', [user.email, user.id]);

    const login = (await (await teamLogin(user.email)).json()) as LoginBody;
    const code = generateTotpCode(secret, timeStep(Date.now()));
    const ok = await teamTwoFactor({ challengeToken: login.challengeToken!, code });
    const body = (await ok.json()) as LoginBody;
    expect(body.status).toBe('signedIn');
    expect(body.operator?.id).toBe(user.id);
    expect(cookieValue(ok, OPERATOR_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieLine(ok, 'session')).toBeUndefined();

    const again = await teamTwoFactor({ challengeToken: login.challengeToken!, code });
    expect(again.status).toBe(401);
    expect(((await again.json()) as ErrorBody).error).toBe('CHALLENGE_EXPIRED');
  });

  it('accepts each recovery code once', async () => {
    const user = await createStaff();
    const { recoveryCodes } = await enableTotp(user);
    getDb().run('UPDATE users SET portal_verified_email = ? WHERE id = ?', [user.email, user.id]);

    const first = (await (await teamLogin(user.email)).json()) as LoginBody;
    const used = await teamTwoFactor({
      challengeToken: first.challengeToken!,
      recoveryCode: recoveryCodes[0],
    });
    expect(((await used.json()) as LoginBody).status).toBe('signedIn');

    const second = (await (await teamLogin(user.email)).json()) as LoginBody;
    const reused = await teamTwoFactor({
      challengeToken: second.challengeToken!,
      recoveryCode: recoveryCodes[0],
    });
    expect(reused.status).toBe(401);
    expect(((await reused.json()) as ErrorBody).error).toBe('INVALID_CODE');
  });

  it('discards the challenge after five wrong codes', async () => {
    const user = await createStaff();
    await enableTotp(user);
    const login = (await (await teamLogin(user.email)).json()) as LoginBody;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await teamTwoFactor({
        challengeToken: login.challengeToken!,
        code: '000000',
      });
      expect(((await response.json()) as ErrorBody).error).toBe('INVALID_CODE');
    }
    const sixth = await teamTwoFactor({ challengeToken: login.challengeToken!, code: '000000' });
    expect(sixth.status).toBe(401);
    expect(((await sixth.json()) as ErrorBody).error).toBe('CHALLENGE_EXPIRED');
  });

  it('answers an unknown challenge with CHALLENGE_EXPIRED', async () => {
    const response = await teamTwoFactor({ challengeToken: 'unknown', code: '123456' });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error).toBe('CHALLENGE_EXPIRED');
  });

  it('rechecks the account after the second factor', async () => {
    const user = await createStaff();
    const { secret } = await enableTotp(user);
    const login = (await (await teamLogin(user.email)).json()) as LoginBody;
    getDb().run('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
    const response = await teamTwoFactor({
      challengeToken: login.challengeToken!,
      code: generateTotpCode(secret, timeStep(Date.now())),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).error).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('rate limits the second step to ten attempts per minute', async () => {
    clearAllRateLimits();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      statuses.push(
        (
          await portalPost(app, '/auth/team/two-factor', {
            challengeToken: 'unknown',
            code: '123456',
          })
        ).status
      );
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('challenge purpose', () => {
  it('does not let a portal challenge complete a staff login', async () => {
    const user = await createStaff();
    const { secret } = await enableTotp(user);
    const login = (await (await teamLogin(user.email)).json()) as LoginBody;
    const code = generateTotpCode(secret, timeStep(Date.now()));

    const direct = await authService.completeTwoFactorLogin(login.challengeToken!, { code });
    expect(direct.success ? undefined : direct.code).toBe('CHALLENGE_EXPIRED');

    clearAllRateLimits();
    const route = await app.request(`${portalOrigin}/api/auth/login/two-factor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeToken: login.challengeToken, code }),
    });
    expect(route.status).toBe(401);
    expect(cookieLine(route, 'session')).toBeUndefined();
    expect(sessionCount('sessions')).toBe(0);

    // The refused staff attempt does not burn the portal challenge
    getDb().run('UPDATE users SET portal_verified_email = ? WHERE id = ?', [user.email, user.id]);
    const ok = await teamTwoFactor({ challengeToken: login.challengeToken!, code });
    expect(((await ok.json()) as LoginBody).status).toBe('signedIn');
  });

  it('does not let a staff challenge complete a team sign-in', async () => {
    const user = await createStaff();
    const { secret } = await enableTotp(user);
    const staffLogin = await authService.login(user.email, password);
    if (!staffLogin.success || !('twoFactorRequired' in staffLogin.value))
      throw new Error('Expected a staff challenge');

    const response = await teamTwoFactor({
      challengeToken: staffLogin.value.challengeToken,
      code: generateTotpCode(secret, timeStep(Date.now())),
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error).toBe('CHALLENGE_EXPIRED');
    expect(cookieLine(response, OPERATOR_COOKIE)).toBeUndefined();
  });

  it('shares the account lock between the portal and the staff sign-in', async () => {
    const user = await createStaff();
    const { secret } = await enableTotp(user);
    for (let challenge = 0; challenge < 2; challenge++) {
      const login = (await (await teamLogin(user.email)).json()) as LoginBody;
      for (let attempt = 0; attempt < 5; attempt++)
        await teamTwoFactor({ challengeToken: login.challengeToken!, code: '000000' });
    }

    const staffLogin = await authService.login(user.email, password);
    if (!staffLogin.success || !('twoFactorRequired' in staffLogin.value))
      throw new Error('Expected a staff challenge');
    const locked = await authService.completeTwoFactorLogin(staffLogin.value.challengeToken, {
      code: generateTotpCode(secret, timeStep(Date.now())),
    });
    expect(locked.success ? undefined : locked.code).toBe('TOO_MANY_ATTEMPTS');

    const portalLogin = (await (await teamLogin(user.email)).json()) as LoginBody;
    const portalLocked = await teamTwoFactor({
      challengeToken: portalLogin.challengeToken!,
      code: generateTotpCode(secret, timeStep(Date.now())),
    });
    expect(portalLocked.status).toBe(429);
    expect(((await portalLocked.json()) as ErrorBody).error).toBe('TOO_MANY_ATTEMPTS');
  });
});

describe('operator session', () => {
  it('identifies the operator on /me without reporter fields or secrets', async () => {
    const { user, cookie } = await signedInOperator();
    const response = await portalRequest('/me', cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      operator: { id: user.id, email: user.email, name: 'Staff Member' },
    });
  });

  it('works for every staff role', async () => {
    for (const role of ['admin', 'editor', 'viewer'] as const) {
      const { cookie } = await signedInOperator(await createStaff({ role }));
      expect((await portalRequest('/me', cookie)).status).toBe(200);
    }
  });

  it('does not accept the operator cookie on staff routes, nor a staff cookie in the portal', async () => {
    const { cookie } = await signedInOperator();
    const staffRoute = await app.request(`${portalOrigin}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    expect(await staffRoute.json()).toEqual({ success: true, authenticated: false });
    const staff = await createStaff();
    const login = await authService.login(staff.email, password);
    if (!login.success || !('session' in login.value)) throw new Error('Expected a staff session');
    const portal = await portalRequest('/me', `session=${login.value.session.id}`);
    expect(portal.status).toBe(401);
  });

  it('rejects a revoked, expired, or unknown session', async () => {
    const { cookie } = await signedInOperator();
    expect((await portalRequest('/me', `${OPERATOR_COOKIE}=${'z'.repeat(43)}`)).status).toBe(401);
    getDb().run('UPDATE portal_operator_sessions SET expires_at = ?', [past]);
    expect((await portalRequest('/me', cookie)).status).toBe(401);
  });

  describe('invalidation', () => {
    let operator: { user: User; cookie: string };

    beforeEach(async () => {
      operator = await signedInOperator();
      expect((await portalRequest('/me', operator.cookie)).status).toBe(200);
    });

    async function expectSignedOut(): Promise<void> {
      for (const path of ['/me', '/reports', '/projects']) {
        const response = await portalRequest(path, operator.cookie);
        expect({ path, status: response.status }).toEqual({ path, status: 401 });
      }
    }

    it('ends when the password changes', async () => {
      await Bun.sleep(5);
      await usersRepo.updatePassword(
        operator.user.id,
        await Bun.password.hash('another-password-2', { algorithm: 'bcrypt', cost: 4 })
      );
      await expectSignedOut();
    });

    it('survives a password change that predates the session', async () => {
      getDb().run('UPDATE users SET password_changed_at = ? WHERE id = ?', [
        past,
        operator.user.id,
      ]);
      expect((await portalRequest('/me', operator.cookie)).status).toBe(200);
    });

    it('ends when the account email changes', async () => {
      getDb().run("UPDATE users SET email = 'renamed@example.test' WHERE id = ?", [
        operator.user.id,
      ]);
      await expectSignedOut();
    });

    it('ends when the account is deactivated', async () => {
      getDb().run('UPDATE users SET is_active = 0 WHERE id = ?', [operator.user.id]);
      await expectSignedOut();
    });

    it('ends when the account is deleted', async () => {
      getDb().run('DELETE FROM users WHERE id = ?', [operator.user.id]);
      await expectSignedOut();
    });

    it('ends when a password change is demanded', async () => {
      await usersRepo.setMustChangePassword(operator.user.id, true);
      await expectSignedOut();
    });

    it('ends when the policy starts to require two-factor', async () => {
      await settingsRepo.updateAll({ twoFactorPolicy: 'everyone' });
      settingsCacheService.invalidate();
      await expectSignedOut();
    });

    it('stays ended after the portal URL becomes insecure and is fixed again', async () => {
      // An enabled Reporter Portal would refuse an insecure Application URL.
      portalInUse.mockReturnValue(false);
      expect((await settingsService.update({ appUrl: 'http://bugpin.example.com' })).success).toBe(
        true
      );
      await expectSignedOut();
      expect((await settingsService.update({ appUrl: portalOrigin })).success).toBe(true);
      await expectSignedOut();
    });

    it('stays ended after the setting is turned off and back on', async () => {
      expect((await settingsService.update({ portalTeamSignIn: false })).success).toBe(true);
      await expectSignedOut();
      expect((await settingsService.update({ portalTeamSignIn: true })).success).toBe(true);
      await expectSignedOut();
    });

    it('ends when an administrator signs the user out everywhere', async () => {
      expect((await userAccessService.signOutEverywhere(operator.user.id)).success).toBe(true);
      await expectSignedOut();
    });

    it('ends when the second factor is reset', async () => {
      expect((await twoFactorService.resetForUser(operator.user.id)).success).toBe(true);
      await expectSignedOut();
    });

    it('ends when an administrator resets the password', async () => {
      const reset = await usersService.resetPassword(operator.user.id, 'Another-Password-42!');
      expect(reset.success).toBe(true);
      await expectSignedOut();
    });

    it('stays ended after an email change is reverted', async () => {
      const original = operator.user.email;
      const changed = await usersService.updateProfile(operator.user.id, {
        email: 'renamed@example.test',
        currentPassword: password,
      });
      expect(changed.success).toBe(true);
      getDb().run('UPDATE users SET email = ? WHERE id = ?', [original, operator.user.id]);
      await expectSignedOut();
    });

    it('stays ended after a deactivated account is reactivated', async () => {
      expect((await usersService.update(operator.user.id, { isActive: false })).success).toBe(true);
      getDb().run('UPDATE users SET is_active = 1 WHERE id = ?', [operator.user.id]);
      await expectSignedOut();
    });
  });
});

describe('read scope', () => {
  let enabledId: string;
  let disabledId: string;
  let inactiveId: string;
  let owner: ReturnType<typeof reporterSession>;
  let previousReporter: ReturnType<typeof reporterSession>;
  let ids: Record<'owned' | 'claimable' | 'unowned' | 'disabled' | 'inactive', string>;
  let cookie: string;

  async function createReport(projectId: string, title: string): Promise<string> {
    const report = await reportsRepo.create({
      projectId,
      title,
      description: `${title} description`,
      metadata: { timestamp: past, url: 'https://example.test', consoleErrors: [] },
    });
    return report.id;
  }

  beforeEach(async () => {
    getDb().run(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES ('author', 'Author', 'author@example.test', 'unused', 'admin')"
    );
    enabledId = (
      await projectsRepo.create({
        name: 'Enabled project',
        settings: { reporterPortal: { enabled: true, allowNewReports: true } },
      })
    ).id;
    disabledId = (await projectsRepo.create({ name: 'Disabled project', settings: {} })).id;
    inactiveId = (
      await projectsRepo.create({
        name: 'Inactive project',
        settings: { reporterPortal: { enabled: true, allowNewReports: true } },
      })
    ).id;
    getDb().run('UPDATE projects SET is_active = 0 WHERE id = ?', [inactiveId]);

    owner = reporterSession('owner@example.com');
    previousReporter = reporterSession('previous@example.com');
    ids = {
      owned: await createReport(enabledId, 'Owned report'),
      claimable: await createReport(enabledId, 'Claimable report'),
      unowned: await createReport(enabledId, 'Unowned report'),
      disabled: await createReport(disabledId, 'Disabled project report'),
      inactive: await createReport(inactiveId, 'Inactive project report'),
    };
    reporterOwnershipRepo.setOwner(ids.owned, owner.id, null);
    reporterOwnershipRepo.setOwner(ids.claimable, null, 'claim@example.test');
    reporterOwnershipRepo.setOwner(ids.disabled, owner.id, null);
    reporterOwnershipRepo.setOwner(ids.inactive, owner.id, null);
    cookie = (await signedInOperator()).cookie;
  });

  it('lists reports of reporters and claimable reports in portal-enabled active projects only', async () => {
    const response = await portalRequest('/reports', cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as PortalReportList;
    expect(body.reports.map((report) => report.id).sort()).toEqual(
      [ids.owned, ids.claimable].sort()
    );
    expect(body.total).toBe(2);
    expect(body.reports.every((report) => report.project.id === enabledId)).toBe(true);
  });

  it('lists the same reports on the status board', async () => {
    const response = await portalRequest('/reports?groupByStatus=true', cookie);
    const board = (await response.json()) as {
      columns: Record<string, { reports: { id: string }[]; total: number }>;
    };
    const listed = Object.values(board.columns).flatMap((column) =>
      column.reports.map((report) => report.id)
    );
    expect(listed.sort()).toEqual([ids.owned, ids.claimable].sort());
  });

  it('shows the enabled project without new-report permission', async () => {
    const response = await portalRequest('/projects', cookie);
    const { projects } = (await response.json()) as { projects: PortalProject[] };
    expect(projects.map((project) => project.id)).toEqual([enabledId]);
    expect(projects[0].allowNewReports).toBe(false);
  });

  it('never reports unread state, even when the owner has unread staff replies', async () => {
    reportMessagesRepo.insert(ids.owned, { kind: 'staff', userId: 'author' }, 'Unseen reply');
    const reporterList = (await (
      await portalRequest('/reports', owner.cookie)
    ).json()) as PortalReportList;
    expect(reporterList.unreadCount).toBeGreaterThan(0);

    const operatorList = (await (
      await portalRequest('/reports', cookie)
    ).json()) as PortalReportList;
    expect(operatorList.unreadCount).toBe(0);
    expect(operatorList.reports.every((report) => !report.unread)).toBe(true);
    const board = (await (await portalRequest('/reports?groupByStatus=true', cookie)).json()) as {
      unreadCount: number;
    };
    expect(board.unreadCount).toBe(0);
  });

  it('summarizes the latest reply from the current owner perspective', async () => {
    const latest = async () =>
      ((await (await portalRequest('/reports', cookie)).json()) as PortalReportList).reports.find(
        (report) => report.id === ids.owned
      )?.latestReply;
    const earlier = reportMessagesRepo.insert(
      ids.owned,
      { kind: 'reporter', reporterId: previousReporter.id },
      'From a previous reporter'
    )!;
    getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [past, earlier.id]);
    expect(await latest()).toMatchObject({
      authorKind: 'reporter',
      authorName: '',
      isOwn: false,
      isPreviousReporter: true,
      body: 'From a previous reporter',
    });
    const own = reportMessagesRepo.insert(
      ids.owned,
      { kind: 'reporter', reporterId: owner.id },
      'From the owner'
    )!;
    expect(await latest()).toMatchObject({
      authorKind: 'reporter',
      authorName: own.authorName,
      isOwn: true,
      isPreviousReporter: false,
      body: 'From the owner',
    });
    expect(own.authorName).not.toBe('');
  });

  it('returns 404 for unowned reports and reports in disabled or inactive projects', async () => {
    for (const id of [ids.unowned, ids.disabled, ids.inactive, 'missing-report']) {
      const response = await portalRequest(`/reports/${id}`, cookie);
      expect({ id, status: response.status }).toEqual({ id, status: 404 });
    }
  });

  it('returns a read-only detail without changing owner_seen_at', async () => {
    reportMessagesRepo.insert(ids.owned, { kind: 'staff', userId: 'author' }, 'Unseen reply');
    const seen = () =>
      getDb()
        .query<{ seen: string | null }, [string]>(
          'SELECT owner_seen_at AS seen FROM reports WHERE id = ?'
        )
        .get(ids.owned)!.seen;
    expect(seen()).toBeNull();

    const response = await portalRequest(`/reports/${ids.owned}`, cookie);
    expect(response.status).toBe(200);
    const { report } = (await response.json()) as { report: PortalReportDetail };
    expect(report.canReply).toBe(false);
    expect(report.canSubmitNewReport).toBe(false);
    expect(report.messages.map((message) => message.body)).toEqual(['Unseen reply']);
    expect(seen()).toBeNull();

    const claimable = await portalRequest(`/reports/${ids.claimable}`, cookie);
    expect(claimable.status).toBe(200);
    expect(seen()).toBeNull();

    // The owner still sees the reply as unread, and reading it as the owner does mark it seen
    const unread = (await (
      await portalRequest('/reports', owner.cookie)
    ).json()) as PortalReportList;
    expect(unread.reports.find((r) => r.id === ids.owned)?.unread).toBe(true);
    await portalRequest(`/reports/${ids.owned}`, owner.cookie);
    expect(seen()).not.toBeNull();
  });

  it('renders messages from the current owner perspective and hides hidden messages with their files', async () => {
    const own = reportMessagesRepo.insert(
      ids.owned,
      { kind: 'reporter', reporterId: owner.id },
      'From the owner'
    )!;
    const earlier = reportMessagesRepo.insert(
      ids.owned,
      { kind: 'reporter', reporterId: previousReporter.id },
      'From a previous reporter'
    )!;
    const hidden = reportMessagesRepo.insert(
      ids.owned,
      { kind: 'staff', userId: 'author' },
      'Hidden staff note'
    )!;
    reportMessagesRepo.setHidden(ids.owned, hidden.id, 'author', true);
    const hiddenPath = join(config.dataDir, 'hidden.png');
    const visiblePath = join(config.dataDir, 'visible.png');
    writeFileSync(hiddenPath, bytes);
    writeFileSync(visiblePath, bytes);
    const attach = (messageId: string, path: string) =>
      filesRepo.create({
        reportId: ids.owned,
        messageId,
        type: 'screenshot',
        path,
        filename: 'file.png',
        mimeType: 'image/png',
        sizeBytes: bytes.length,
      });
    const hiddenFile = await attach(hidden.id, hiddenPath);
    const visibleFile = await attach(own.id, visiblePath);

    const response = await portalRequest(`/reports/${ids.owned}`, cookie);
    const { report } = (await response.json()) as { report: PortalReportDetail };
    const byBody = Object.fromEntries(report.messages.map((message) => [message.body, message]));
    expect(Object.keys(byBody).sort()).toEqual(['From a previous reporter', 'From the owner']);
    expect(byBody['From the owner'].isOwn).toBe(true);
    expect(byBody['From the owner'].isPreviousReporter).toBe(false);
    expect(byBody['From a previous reporter'].isOwn).toBe(false);
    expect(byBody['From a previous reporter'].isPreviousReporter).toBe(true);
    expect(byBody['From a previous reporter'].authorName).toBe('');
    expect(earlier.id).toBeString();

    const visible = await portalRequest(`/reports/${ids.owned}/files/${visibleFile.id}`, cookie);
    expect(visible.status).toBe(200);
    expect(visible.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await visible.arrayBuffer())).toEqual(bytes);
    const head = await portalRequest(`/reports/${ids.owned}/files/${visibleFile.id}`, cookie, {
      method: 'HEAD',
    });
    expect(head.status).toBe(200);
    expect(
      (await portalRequest(`/reports/${ids.owned}/files/${hiddenFile.id}`, cookie)).status
    ).toBe(404);
  });

  it('does not serve files of unowned reports or disabled projects', async () => {
    const path = join(config.dataDir, 'other.png');
    writeFileSync(path, bytes);
    for (const reportId of [ids.unowned, ids.disabled]) {
      const file = await filesRepo.create({
        reportId,
        type: 'screenshot',
        path,
        filename: 'other.png',
        mimeType: 'image/png',
        sizeBytes: bytes.length,
      });
      expect((await portalRequest(`/reports/${reportId}/files/${file.id}`, cookie)).status).toBe(
        404
      );
    }
  });
});

describe('read-only enforcement', () => {
  it('refuses every write route with 403 READ_ONLY for a valid operator session', async () => {
    const { cookie } = await signedInOperator();
    const form = new FormData();
    form.set('projectId', 'any');
    form.set('title', 'New feedback');
    const attempts: [string, string, RequestInit][] = [
      [
        'PATCH',
        '/me',
        {
          body: JSON.stringify({ displayName: 'New name' }),
          headers: { 'content-type': 'application/json' },
        },
      ],
      [
        'POST',
        '/reports/any/messages',
        {
          body: JSON.stringify({ body: 'Hello' }),
          headers: { 'content-type': 'application/json' },
        },
      ],
      ['POST', '/reports', { body: form }],
      ['GET', '/events', {}],
    ];
    for (const [method, path, init] of attempts) {
      const response = await portalRequest(path, cookie, {
        method,
        ...init,
        headers: { Origin: portalOrigin, 'X-BugPin-Portal': '1', ...(init.headers ?? {}) },
      });
      expect({ method, path, status: response.status }).toEqual({ method, path, status: 403 });
      expect(((await response.json()) as ErrorBody).error).toBe('READ_ONLY');
    }
  });

  it('answers 401 instead of READ_ONLY once the operator session is no longer valid', async () => {
    const { cookie } = await signedInOperator();
    await settingsRepo.updateAll({ portalTeamSignIn: false });
    settingsCacheService.invalidate();
    const response = await portalRequest('/events', cookie);
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error).toBe('UNAUTHORIZED');
  });
});

describe('session swap between reporter and operator', () => {
  it('ends the reporter session when a team session starts', async () => {
    const reporter = reporterSession();
    const user = await createStaff();
    await confirmOperator(user);

    const response = await teamLogin(user.email, password, reporter.cookie);
    expect(((await response.json()) as LoginBody).status).toBe('signedIn');
    expect(cookieValue(response, OPERATOR_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isCleared(response, REPORTER_COOKIE)).toBe(true);
    expect((await portalRequest('/me', reporter.cookie)).status).toBe(401);
  });

  it('ends the reporter session when the verification link is exchanged', async () => {
    const reporter = reporterSession();
    const user = await createStaff();
    await teamLogin(user.email);
    clearAllRateLimits();
    const response = await portalPost(
      app,
      '/auth/team/verify/exchange',
      { token: verificationSecret() },
      reporter.cookie
    );
    expect(response.status).toBe(200);
    expect(isCleared(response, REPORTER_COOKIE)).toBe(true);
    expect((await portalRequest('/me', reporter.cookie)).status).toBe(401);
  });

  it('ends the operator session when a reporter signs in', async () => {
    const { cookie } = await signedInOperator();
    const token = Result.unwrap(reporterAuthService.mintLoginToken('swap@example.com', 'request'));
    clearAllRateLimits();
    const response = await portalPost(app, '/auth/exchange', { token: token.secret }, cookie);
    expect(response.status).toBe(200);
    expect(cookieValue(response, REPORTER_COOKIE)).toBeString();
    expect(isCleared(response, OPERATOR_COOKIE)).toBe(true);
    expect((await portalRequest('/me', cookie)).status).toBe(401);
    const reporterCookie = `${REPORTER_COOKIE}=${cookieValue(response, REPORTER_COOKIE)}`;
    const me = (await (await portalRequest('/me', reporterCookie)).json()) as Record<
      string,
      unknown
    >;
    expect(me.reporter).toBeDefined();
    expect(me.operator).toBeUndefined();
  });
});

describe('logout', () => {
  it('ends the operator session and clears its cookie', async () => {
    const { cookie } = await signedInOperator();
    const response = await portalPost(app, '/auth/logout', {}, cookie);
    expect(response.status).toBe(200);
    expect(isCleared(response, OPERATOR_COOKIE)).toBe(true);
    expect((await portalRequest('/me', cookie)).status).toBe(401);
    const revoked = getDb()
      .query<{ revoked_at: string | null }, []>(
        'SELECT revoked_at FROM portal_operator_sessions ORDER BY created_at DESC LIMIT 1'
      )
      .get();
    expect(revoked?.revoked_at).not.toBeNull();
  });

  it('ends both sessions when both cookies are present', async () => {
    const { cookie } = await signedInOperator();
    const reporter = reporterSession();
    const response = await portalPost(app, '/auth/logout', {}, `${cookie}; ${reporter.cookie}`);
    expect(response.status).toBe(200);
    expect(isCleared(response, OPERATOR_COOKIE)).toBe(true);
    expect(isCleared(response, REPORTER_COOKIE)).toBe(true);
    expect((await portalRequest('/me', cookie)).status).toBe(401);
    expect((await portalRequest('/me', reporter.cookie)).status).toBe(401);
  });

  it('requires a session', async () => {
    expect((await portalPost(app, '/auth/logout', {})).status).toBe(401);
  });

  it('keeps a revoked session revoked after signing in again', async () => {
    const user = await createStaff();
    const first = await signedInOperator(user);
    await portalPost(app, '/auth/logout', {}, first.cookie);
    const again = await teamLogin(user.email);
    expect(((await again.json()) as LoginBody).status).toBe('signedIn');
    expect((await portalRequest('/me', first.cookie)).status).toBe(401);
  });
});
