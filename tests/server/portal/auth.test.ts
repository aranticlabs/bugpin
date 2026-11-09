import { afterEach, beforeEach, expect, it, spyOn, mock } from 'bun:test';
import { getDb } from '../../../src/server/database/database';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { reporterAuthTokensRepo } from '../../../src/server/database/repositories/reporter-auth-tokens.repo';
import { reporterSessionsRepo } from '../../../src/server/database/repositories/reporter-sessions.repo';
import { reporterSuppressionsRepo } from '../../../src/server/database/repositories/reporter-suppressions.repo';
import { reportersRepo } from '../../../src/server/database/repositories/reporters.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsService } from '../../../src/server/services/settings.service';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { emailService } from '../../../src/server/services/email.service';
import { hashToken } from '../../../src/server/utils/secure-token';
import { Result } from '../../../src/server/utils/result';
import { logger } from '../../../src/server/utils/logger';
import { DEFAULT_REPORTER_PORTAL_LIMITS } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let sent: Parameters<typeof emailService.sendEmail>[0][];

beforeEach(async () => {
  close = await openPortalDatabase();
  app = createPortalTestApp();
  sent = [];
  spyOn(emailService, 'sendEmail').mockImplementation(async (options) => {
    sent.push(options);
    return { success: true };
  });
});
afterEach(() => {
  mock.restore();
  close();
});

function mint(
  email = 'jane@example.com',
  source: 'request' | 'confirmation' | 'invitation' = 'request'
) {
  return Result.unwrap(reporterAuthService.mintLoginToken(email, source));
}

function count(table: 'reporters' | 'reporter_auth_tokens' | 'reporter_sessions'): number {
  return getDb().query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()!
    .count;
}

async function observableResponse(response: Response) {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

it('returns identical complete responses for unknown, known, suspended, email-limited, and IP-limited requests', async () => {
  reportersRepo.resolve('known@example.com', 'Known', new Date().toISOString());
  const suspended = reportersRepo.resolve(
    'suspended@example.com',
    'Suspended',
    new Date().toISOString()
  );
  getDb().run('UPDATE reporters SET suspended_at = ? WHERE id = ?', [
    new Date().toISOString(),
    suspended.id,
  ]);
  const responses = [];
  for (const email of ['unknown@example.com', 'known@example.com', 'suspended@example.com']) {
    const response = await portalPost(app, '/auth/request', { email });
    expect(response.status).toBe(200);
    responses.push(await observableResponse(response));
  }
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginRequestsPerEmailPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  const limited = await portalPost(app, '/auth/request', { email: 'known@example.com' });
  responses.push(await observableResponse(limited));
  expect(limited.status).toBe(200);
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginRequestsPerIpPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  responses.push(
    await observableResponse(
      await portalPost(app, '/auth/request', { email: 'ip-limited@example.com' })
    )
  );
  expect(responses).toEqual(Array(5).fill(responses[0]));
  expect(responses[0].body).toBe(JSON.stringify({ success: true }));
  for (const response of responses) {
    expect(response.status).toBe(200);
    for (const name of [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after',
    ])
      expect(response.headers).not.toHaveProperty(name);
  }
  expect(sent.map((email) => email.to[0].email)).toEqual([
    'unknown@example.com',
    'known@example.com',
  ]);
  expect(count('reporters')).toBe(2);
  expect(count('reporter_auth_tokens')).toBe(2);
});

it('returns identical complete resend responses for unknown, known, suspended, email-limited, and IP-limited recipients', async () => {
  const now = new Date().toISOString();
  reportersRepo.resolve('known@example.com', 'Known', now);
  const suspended = reportersRepo.resolve('suspended@example.com', 'Suspended', now);
  const tokens = ['unknown@example.com', 'known@example.com', 'suspended@example.com'].map(
    (email) => mint(email, 'confirmation')
  );
  for (const token of tokens)
    getDb().run('UPDATE reporter_auth_tokens SET expires_at = ? WHERE token_hash = ?', [
      new Date(Date.now() - 1000).toISOString(),
      hashToken(token.secret),
    ]);
  reportersRepo.setSuspension(suspended.id, now, null, now);
  const responses = [];
  for (const token of tokens)
    responses.push(
      await observableResponse(await portalPost(app, '/auth/resend', { token: token.secret }))
    );
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginRequestsPerEmailPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  responses.push(
    await observableResponse(await portalPost(app, '/auth/resend', { token: tokens[1].secret }))
  );
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginRequestsPerIpPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  responses.push(
    await observableResponse(await portalPost(app, '/auth/resend', { token: tokens[0].secret }))
  );
  expect(responses).toEqual(Array(5).fill(responses[0]));
  expect(responses[0].status).toBe(200);
  expect(responses[0].body).toBe(JSON.stringify({ success: true }));
  for (const name of [
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'retry-after',
  ])
    expect(responses[0].headers).not.toHaveProperty(name);
  expect(sent.map((email) => email.to[0].email)).toEqual([
    'unknown@example.com',
    'known@example.com',
  ]);
  expect(count('reporter_auth_tokens')).toBe(5);
});

it('does not wait for SMTP or expose delivery failures in the response', async () => {
  spyOn(emailService, 'sendEmail').mockImplementation(() => new Promise(() => {}));
  const response = await portalPost(app, '/auth/request', { email: 'unknown@example.com' });
  expect(await response.json()).toEqual({ success: true });
  spyOn(emailService, 'sendEmail').mockRejectedValue(new Error('delivery failed'));
  expect((await portalPost(app, '/auth/request', { email: 'other@example.com' })).status).toBe(200);
  spyOn(emailService, 'sendEmail').mockResolvedValue({ success: false, error: 'delivery failed' });
  const failed = await portalPost(app, '/auth/request', { email: 'failed@example.com' });
  expect(failed.status).toBe(200);
  expect(await failed.json()).toEqual({ success: true });
});

it('keeps IP-limited login requests neutral across different emails', async () => {
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginRequestsPerIpPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  for (const email of ['first@example.com', 'second@example.com']) {
    const response = await portalPost(app, '/auth/request', { email });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  }
  expect(sent).toHaveLength(1);
});

it('logs delivery warnings for SMTP failures but not intentional login mint refusals', async () => {
  const suspended = reportersRepo.resolve(
    'suspended@example.com',
    'Suspended',
    new Date().toISOString()
  );
  reportersRepo.setSuspension(
    suspended.id,
    new Date().toISOString(),
    null,
    new Date().toISOString()
  );
  const warnings = spyOn(logger, 'warn').mockImplementation(() => {});
  for (const email of ['invalid', suspended.email])
    expect(await reporterAuthService.requestLogin(email)).toEqual(Result.ok(undefined));
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(warnings).not.toHaveBeenCalled();
  expect(sent).toHaveLength(0);
  spyOn(emailService, 'sendEmail').mockResolvedValue({ success: false });
  expect(await reporterAuthService.requestLogin('other@example.com')).toEqual(Result.ok(undefined));
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(warnings).toHaveBeenCalledWith('Reporter login email delivery failed');
});

it('logs exactly one warning for a rejecting public delivery while test delivery returns a failure', async () => {
  const warnings = spyOn(logger, 'warn').mockImplementation(() => {});
  spyOn(emailService, 'sendEmail').mockRejectedValue(new Error('SMTP failed'));
  expect((await portalPost(app, '/auth/request', { email: 'public@example.com' })).status).toBe(
    200
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(warnings).toHaveBeenCalledTimes(1);
  expect(warnings).toHaveBeenCalledWith('Reporter login email delivery failed');
  expect(await reporterAuthService.sendLoginLink('admin@example.com')).toMatchObject({
    success: false,
    code: 'EMAIL_DELIVERY_FAILED',
  });
  expect(warnings).toHaveBeenCalledTimes(1);
});

it('shares the per-email allowance between requests and expired-link resends', async () => {
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginRequestsPerEmailPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  const { secret } = mint('jane@example.com', 'invitation');
  getDb().run('UPDATE reporter_auth_tokens SET expires_at = ? WHERE token_hash = ?', [
    new Date(Date.now() - 1000).toISOString(),
    hashToken(secret),
  ]);
  await portalPost(app, '/auth/request', { email: 'jane@example.com' });
  expect((await portalPost(app, '/auth/resend', { token: secret })).status).toBe(200);
  expect(sent).toHaveLength(1);
});

it('gives preview and exchange separate IP counters with the same configured maximum', async () => {
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginExchangesPerIpPer15Min: 1 },
  });
  settingsCacheService.invalidate();
  const { secret } = mint();
  expect((await portalPost(app, '/auth/preview', { token: secret })).status).toBe(200);
  expect((await portalPost(app, '/auth/preview', { token: secret })).status).toBe(429);
  expect((await portalPost(app, '/auth/exchange', { token: secret })).status).toBe(200);
  const outstanding = mint('other@example.com');
  const response = await portalPost(app, '/auth/exchange', { token: outstanding.secret });
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests',
  });
  expect(reporterAuthTokensRepo.findByHash(hashToken(outstanding.secret))!.consumedAt).toBeNull();
});

it('resolves one account for normalized email and rejects a suspended account token', () => {
  const first = Result.unwrap(reporterAuthService.exchange(mint(' Jane+Tag@Example.COM ').secret));
  const secondToken = mint('jane+tag@example.com');
  const second = Result.unwrap(reporterAuthService.exchange(secondToken.secret));
  expect(second.reporter.id).toBe(first.reporter.id);
  expect(count('reporters')).toBe(1);
  const outstanding = mint('jane+tag@example.com');
  getDb().run('UPDATE reporters SET suspended_at = ? WHERE id = ?', [
    new Date().toISOString(),
    first.reporter.id,
  ]);
  expect(Result.unwrap(reporterAuthService.preview(outstanding.secret))).toEqual({
    state: 'invalid',
  });
  expect(reporterAuthService.exchange(outstanding.secret).success).toBe(false);
  expect(reporterAuthTokensRepo.findByHash(hashToken(outstanding.secret))!.consumedAt).toBeNull();
  expect(reporterAuthService.mintLoginToken('jane+tag@example.com', 'request')).toEqual({
    success: false,
    error: 'Reporter is suspended',
    code: 'REPORTER_SUSPENDED',
  });
  expect(reporterAuthService.mintLoginToken('invalid', 'request')).toEqual({
    success: false,
    error: 'Invalid email address',
    code: 'INVALID_EMAIL',
  });
});

it('puts requested secrets only in link fragments and stores only their hashes', async () => {
  await portalPost(app, '/auth/request', { email: ' Jane+Tag@Example.COM ', locale: 'de' });
  expect(sent[0].to).toEqual([{ email: 'jane+tag@example.com' }]);
  const url = new URL(sent[0].text!.split(' ')[5].split('\n')[0]);
  expect(url.pathname).toBe('/reporter-portal/login');
  expect(url.search).toBe('');
  const secret = url.hash.slice(1);
  expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const token = reporterAuthTokensRepo.findByHash(hashToken(secret))!;
  expect(token.email).toBe('jane+tag@example.com');
  expect(Date.parse(token.expiresAt) - Date.now()).toBeWithin(899000, 900001);
  expect(JSON.stringify(getDb().query('SELECT * FROM reporter_auth_tokens').all())).not.toContain(
    secret
  );
});

it('previews repeatedly without consuming and rejects requested links after 15 minutes', async () => {
  const { secret } = mint();
  for (let i = 0; i < 2; i++)
    expect(await (await portalPost(app, '/auth/preview', { token: secret })).json()).toEqual({
      success: true,
      state: 'valid',
      maskedEmail: 'j***@example.com',
    });
  expect(count('reporter_sessions')).toBe(0);
  expect((await portalPost(app, '/auth/exchange', { token: secret })).status).toBe(200);
  expect(Result.unwrap(reporterAuthService.preview(secret))).toEqual({ state: 'invalid' });
  const expired = mint('expired@example.com');
  getDb().run('UPDATE reporter_auth_tokens SET expires_at = ? WHERE token_hash = ?', [
    new Date(Date.now() - 60000).toISOString(),
    hashToken(expired.secret),
  ]);
  expect((await portalPost(app, '/auth/exchange', { token: expired.secret })).status).toBe(400);
  expect(count('reporter_sessions')).toBe(1);
});

it('resends expired email links only to the stored email with a fresh requested token', async () => {
  const { secret, expiresAt } = mint('jane@example.com', 'confirmation');
  expect(Date.parse(expiresAt) - Date.now()).toBeWithin(86399000, 86400001);
  getDb().run('UPDATE reporter_auth_tokens SET expires_at = ? WHERE token_hash = ?', [
    new Date(Date.now() - 3600000).toISOString(),
    hashToken(secret),
  ]);
  expect(await (await portalPost(app, '/auth/preview', { token: secret })).json()).toEqual({
    success: true,
    state: 'expired',
    maskedEmail: 'j***@example.com',
  });
  expect(await (await portalPost(app, '/auth/resend', { token: secret })).json()).toEqual({
    success: true,
  });
  expect(sent[0].to[0].email).toBe('jane@example.com');
  expect(count('reporter_auth_tokens')).toBe(2);
  const replacementSecret = new URL(sent[0].text!.split(' ')[5].split('\n')[0]).hash.slice(1);
  const replacement = reporterAuthTokensRepo.findByHash(hashToken(replacementSecret))!;
  expect(replacement.source).toBe('request');
  expect(Date.parse(replacement.expiresAt) - Date.now()).toBeWithin(899000, 900001);
  expect((await portalPost(app, '/auth/exchange', { token: replacementSecret })).status).toBe(200);
  expect(reporterAuthTokensRepo.findByHash(hashToken(secret))!.consumedAt).toBeNull();
  getDb().run('UPDATE reporter_auth_tokens SET revoked_at = ? WHERE token_hash = ?', [
    new Date().toISOString(),
    hashToken(secret),
  ]);
  await portalPost(app, '/auth/resend', { token: secret });
  expect(sent).toHaveLength(1);
});

it('allows exactly one concurrent exchange, sends an allowlisted DTO, and sets a host-only secure cookie', async () => {
  const { secret } = mint();
  const responses = await Promise.all([
    portalPost(app, '/auth/exchange', { token: secret }),
    portalPost(app, '/auth/exchange', { token: secret }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
  const success = responses.find((r) => r.status === 200)!;
  const body = (await success.json()) as { reporter: Record<string, unknown> };
  expect(Object.keys(body.reporter).sort()).toEqual([
    'displayName',
    'email',
    'emailUpdates',
    'id',
    'locale',
  ]);
  expect(body).not.toHaveProperty('sessionSecret');
  const cookie = success.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
    expect(cookie).toContain(flag);
  expect(cookie).not.toContain('Domain=');
  const stored = getDb()
    .query<{ token_hash: string }, []>('SELECT token_hash FROM reporter_sessions')
    .get()!;
  expect(stored.token_hash).toBe(hashToken(cookie.split(';')[0].split('=')[1]));
  expect(count('reporter_sessions')).toBe(1);
});

it('rolls token consumption, reporter creation, attachment, and history back when session insertion fails', () => {
  const { secret } = mint();
  getDb().exec(
    "CREATE TRIGGER refuse_session BEFORE INSERT ON reporter_sessions BEGIN SELECT RAISE(ABORT, 'refused'); END;"
  );
  expect(() => reporterAuthService.exchange(secret)).toThrow('refused');
  expect(count('reporters')).toBe(0);
  expect(count('reporter_sessions')).toBe(0);
  expect(reporterAuthTokensRepo.findByHash(hashToken(secret))!.consumedAt).toBeNull();
});

it('renews sessions only hourly and caps renewal at the absolute expiry', () => {
  const exchanged = Result.unwrap(reporterAuthService.exchange(mint().secret));
  const secret = exchanged.sessionSecret;
  const first = reporterSessionsRepo.findByHash(hashToken(secret))!;
  reporterAuthService.validateSession(secret);
  expect(reporterSessionsRepo.findByHash(hashToken(secret))!.lastUsedAt).toBe(first.lastUsedAt);
  const absolute = new Date(Date.now() + 10 * 86400000).toISOString();
  getDb().run(
    'UPDATE reporter_sessions SET last_used_at = ?, absolute_expires_at = ? WHERE id = ?',
    [new Date(Date.now() - 3600001).toISOString(), absolute, first.id]
  );
  expect(Result.unwrap(reporterAuthService.validateSession(secret)).expiresAt).toBe(absolute);
  getDb().run('UPDATE reporter_sessions SET absolute_expires_at = ? WHERE id = ?', [
    new Date(Date.now() - 1).toISOString(),
    first.id,
  ]);
  expect(reporterAuthService.validateSession(secret).success).toBe(false);
});

it('revokes the previous browser session on exchange and logout invalidates the replacement', async () => {
  const first = Result.unwrap(reporterAuthService.exchange(mint().secret));
  const response = await portalPost(
    app,
    '/auth/exchange',
    { token: mint('other@example.com').secret },
    `bugpin_reporter_session=${first.sessionSecret}`
  );
  expect(reporterAuthService.validateSession(first.sessionSecret).success).toBe(false);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const me = await app.request(`${portalOrigin}/api/portal/me`, { headers: { Cookie: cookie } });
  expect(((await me.json()) as { reporter: { email: string } }).reporter.email).toBe(
    'other@example.com'
  );
  const logout = await portalPost(app, '/auth/logout', {}, cookie);
  expect(logout.status).toBe(200);
  expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(
    (await app.request(`${portalOrigin}/api/portal/me`, { headers: { Cookie: cookie } })).status
  ).toBe(401);
});

it('reads suppression state without blocking login emails or adding a profile mutation route', async () => {
  reporterSuppressionsRepo.insert('jane@example.com', 'unsubscribe');
  const first = Result.unwrap(reporterAuthService.exchange(mint().secret));
  expect(first.reporter.emailUpdates).toBe(false);
  await portalPost(app, '/auth/request', { email: 'jane@example.com' });
  expect(sent).toHaveLength(1);
  reporterSuppressionsRepo.delete('jane@example.com');
  expect(
    Result.unwrap(reporterAuthService.validateSession(first.sessionSecret)).reporter.emailUpdates
  ).toBe(true);
  expect(
    (
      await app.request(`${portalOrigin}/api/portal/me`, {
        method: 'PATCH',
        headers: { Origin: portalOrigin, 'X-BugPin-Portal': '1' },
      })
    ).status
  ).toBe(404);
});

it('validates bounded partial rate-limit settings and preserves the other defaults', async () => {
  expect(
    (await settingsService.update({ reporterPortalLimits: { loginRequestsPerIpPer15Min: 0 } }))
      .success
  ).toBe(false);
  expect(
    (await settingsService.update({ reporterPortalLimits: { sseStreamsPerSession: 11 } })).success
  ).toBe(false);
  const result = Result.unwrap(
    await settingsService.update({ reporterPortalLimits: { loginRequestsPerIpPer15Min: 30 } })
  );
  expect(result.reporterPortalLimits).toEqual({
    ...DEFAULT_REPORTER_PORTAL_LIMITS,
    loginRequestsPerIpPer15Min: 30,
  });
});

it('does not deliver login credentials over public HTTP or a malformed portal URL', async () => {
  for (const appUrl of ['http://example.com', 'https://user:password@example.com']) {
    await settingsRepo.updateAll({ appUrl });
    settingsCacheService.invalidate();
    await reporterAuthService.requestLogin('jane@example.com');
  }
  expect(sent).toHaveLength(0);
});
