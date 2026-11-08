import { afterEach, beforeEach, expect, it } from 'bun:test';
import { reportsRoutes } from '../../../src/server/routes/api/reports';
import { projectsRoutes } from '../../../src/server/routes/api/projects';
import { settingsRoutes } from '../../../src/server/routes/api/settings';
import { usersRoutes } from '../../../src/server/routes/api/users';
import { getDb } from '../../../src/server/database/database';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { config } from '../../../src/server/config';
import { Result } from '../../../src/server/utils/result';
import { DEFAULT_REPORTER_PORTAL_LIMITS } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
type Caller =
  'owner' | 'other' | 'suspended' | 'deleted' | 'disabled-project' | 'staff' | 'anonymous';
const callers: Caller[] = [
  'owner',
  'other',
  'suspended',
  'deleted',
  'disabled-project',
  'staff',
  'anonymous',
];
const matrix = [
  { method: 'GET', path: '/config', publicStatus: 200 },
  { method: 'POST', path: '/auth/request', publicStatus: 200 },
  { method: 'POST', path: '/auth/preview', publicStatus: 200 },
  { method: 'POST', path: '/auth/resend', publicStatus: 200 },
  { method: 'POST', path: '/auth/exchange', publicStatus: 400 },
  { method: 'POST', path: '/auth/logout', publicStatus: null },
  { method: 'GET', path: '/me', publicStatus: null },
] as const;

beforeEach(async () => {
  close = await openPortalDatabase();
  // Matrix requests test authorization independently of the abuse limit.
  await settingsRepo.updateAll({
    smtpEnabled: false,
    reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginExchangesPerIpPer15Min: 100 },
  });
  settingsCacheService.invalidate();
  getDb().run(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES ('staff', 'staff@example.com', 'Staff', 'unused', 'admin')"
  );
  app = createPortalTestApp();
  app.route('/api/reports', reportsRoutes);
  app.route('/api/projects', projectsRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/users', usersRoutes);
});
afterEach(() => close());

async function credential(caller: Caller): Promise<string> {
  if (caller === 'anonymous') return '';
  if (caller === 'staff') {
    const session = await sessionsRepo.create({
      userId: 'staff',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    return `session=${session.id}`;
  }
  const token = Result.unwrap(
    reporterAuthService.mintLoginToken(`${crypto.randomUUID()}@example.com`, 'request')
  );
  const session = Result.unwrap(reporterAuthService.exchange(token.secret));
  if (caller === 'suspended')
    getDb().run('UPDATE reporters SET suspended_at = ? WHERE id = ?', [
      new Date().toISOString(),
      session.reporter.id,
    ]);
  if (caller === 'deleted')
    getDb().run('DELETE FROM reporters WHERE id = ?', [session.reporter.id]);
  if (caller === 'disabled-project') {
    const id = crypto.randomUUID();
    getDb().run(
      "INSERT INTO projects (id, name, api_key_hash, api_key_prefix, settings) VALUES (?, 'Disabled project', ?, 'prefix', '{}')",
      [id, id]
    );
    getDb().run(
      "INSERT INTO reports (id, project_id, title, metadata, reporter_id) VALUES (?, ?, 'Owned report', '{}', ?)",
      [crypto.randomUUID(), id, session.reporter.id]
    );
  }
  return `bugpin_reporter_session=${session.sessionSecret}`;
}

it('has a matrix entry for every registered portal endpoint', () => {
  const registered = app.routes
    .filter((route) => route.path.startsWith('/api/portal/') && route.method !== 'ALL')
    .map((route) => `${route.method} ${route.path}`);
  expect([...new Set(registered)].sort()).toEqual(
    matrix.map((row) => `${row.method} /api/portal${row.path}`).sort()
  );
});

it('applies the endpoint matrix to every caller type without accepting staff credentials', async () => {
  for (const row of matrix) {
    for (const caller of callers) {
      const cookie = await credential(caller);
      const response =
        row.method === 'GET'
          ? await app.request(`${portalOrigin}/api/portal${row.path}`, {
              headers: { Cookie: cookie },
            })
          : await portalPost(
              app,
              row.path,
              row.path === '/auth/request'
                ? { email: 'request@example.com' }
                : { token: 'invalid' },
              cookie
            );
      const expected =
        row.publicStatus ?? (['owner', 'other', 'disabled-project'].includes(caller) ? 200 : 401);
      expect({ endpoint: `${row.method} ${row.path}`, caller, status: response.status }).toEqual({
        endpoint: `${row.method} ${row.path}`,
        caller,
        status: expected,
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
  }
});

it('rejects reporter-only credentials on staff routes and ignores Bearer-only credentials in the portal', async () => {
  const cookie = await credential('owner');
  for (const path of ['/api/reports', '/api/projects', '/api/settings', '/api/users']) {
    expect(
      (await app.request(`${portalOrigin}${path}`, { headers: { Cookie: cookie } })).status
    ).toBe(401);
  }
  expect(
    (
      await app.request(`${portalOrigin}/api/portal/me`, {
        headers: { Authorization: 'Bearer some-api-token' },
      })
    ).status
  ).toBe(401);
});

it('checks Origin, Fetch Metadata, and the portal header on public and authenticated mutations', async () => {
  const cookie = await credential('owner');
  for (const path of [
    '/auth/request',
    '/auth/preview',
    '/auth/resend',
    '/auth/exchange',
    '/auth/logout',
  ]) {
    const rejectedHeaders: Record<string, string>[] = [
      { Origin: 'https://other.example.test', 'X-BugPin-Portal': '1' },
      { Origin: 'https://sibling.bugpin.example.test', 'X-BugPin-Portal': '1' },
      { Origin: portalOrigin },
      { 'X-BugPin-Portal': '1' },
      { Origin: portalOrigin, 'X-BugPin-Portal': '1', 'Sec-Fetch-Site': 'same-site' },
      { Origin: portalOrigin, 'X-BugPin-Portal': '1', 'Sec-Fetch-Site': 'cross-site' },
      { Origin: `${portalOrigin}/`, 'X-BugPin-Portal': '1' },
    ];
    for (const bad of rejectedHeaders) {
      const response = await app.request(`${portalOrigin}/api/portal${path}`, {
        method: 'POST',
        headers: { Cookie: cookie, 'content-type': 'application/json', ...bad },
        body: '{}',
      });
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
      expect(((await response.json()) as { error: string }).error).toBe('ORIGIN_REJECTED');
    }
  }
});

it('uses the configured portal origin independently of the staff origin', async () => {
  await settingsRepo.updateAll({ portalBaseUrl: 'https://portal.example.test' });
  settingsCacheService.invalidate();
  expect((await portalPost(app, '/auth/preview', { token: 'invalid' })).status).toBe(403);
  const response = await app.request('https://portal.example.test/api/portal/auth/preview', {
    method: 'POST',
    headers: {
      Origin: 'https://portal.example.test',
      'X-BugPin-Portal': '1',
      'content-type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({ token: 'invalid' }),
  });
  expect(response.status).toBe(200);
});

it('honors forwarded origin headers only from a trusted proxy during bootstrap', async () => {
  await settingsRepo.updateAll({ appUrl: '' });
  settingsCacheService.invalidate();
  const forwarded = {
    Origin: portalOrigin,
    'X-BugPin-Portal': '1',
    'content-type': 'application/json',
    'X-Forwarded-Host': 'bugpin.example.test',
    'X-Forwarded-Proto': 'https',
  };
  const init = { method: 'POST', headers: forwarded, body: JSON.stringify({ token: 'invalid' }) };
  const peer = { requestIP: () => ({ address: '127.0.0.1' }) };
  expect((await app.request('http://localhost/api/portal/auth/preview', init, peer)).status).toBe(
    403
  );
  config.trustProxy = 'auto';
  expect((await app.request('http://localhost/api/portal/auth/preview', init, peer)).status).toBe(
    200
  );
  expect(
    (
      await app.request('http://localhost/api/portal/auth/preview', init, {
        requestIP: () => ({ address: '203.0.113.1' }),
      })
    ).status
  ).toBe(403);
  for (const host of [
    'other.example.test',
    'bugpin.example.test:bad',
    'bugpin.example.test/path',
    'user@bugpin.example.test',
    'bugpin.example.test,other.test',
  ]) {
    const response = await app.request(
      'http://localhost/api/portal/auth/preview',
      {
        ...init,
        headers: { ...forwarded, 'X-Forwarded-Host': host },
      },
      peer
    );
    expect(response.status).toBe(403);
  }
});

it('rejects oversized bodies before authentication and never consumes a credential on GET', async () => {
  const token = Result.unwrap(reporterAuthService.mintLoginToken('jane@example.com', 'request'));
  const response = await portalPost(app, '/auth/exchange', { token: 'a'.repeat(5000) });
  expect(response.status).toBe(413);
  expect((await app.request(`${portalOrigin}/api/portal/auth/exchange`)).status).toBe(404);
  expect(Result.unwrap(reporterAuthService.preview(token.secret)).state).toBe('valid');
});

it('allows only staff admins to update portal limits through the settings API', async () => {
  const cookie = await credential('staff');
  const update = (value: number) =>
    app.request(`${portalOrigin}/api/settings`, {
      method: 'PUT',
      headers: { Cookie: cookie, Origin: portalOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ reporterPortalLimits: { loginRequestsPerEmailPer15Min: value } }),
    });
  expect((await update(0)).status).toBe(400);
  expect((await update(51)).status).toBe(400);
  expect((await update(6)).status).toBe(200);
  expect(
    (await settingsCacheService.getAll()).reporterPortalLimits.loginRequestsPerEmailPer15Min
  ).toBe(6);
  getDb().run("UPDATE users SET role = 'editor' WHERE id = 'staff'");
  expect((await update(7)).status).toBe(403);
});
