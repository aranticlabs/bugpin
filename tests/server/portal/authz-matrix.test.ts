import { afterEach, beforeEach, expect, it } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  | 'owner'
  | 'other'
  | 'suspended'
  | 'deleted'
  | 'disabled-project'
  | 'staff'
  | 'anonymous'
  | 'bearer';
const callers: Caller[] = [
  'owner',
  'other',
  'suspended',
  'deleted',
  'disabled-project',
  'staff',
  'anonymous',
  'bearer',
];
interface MatrixRow {
  method: 'GET' | 'HEAD' | 'POST' | 'PATCH';
  path: string;
  publicStatus?: number | null;
  resource?: boolean;
  submission?: boolean;
}
const matrix: MatrixRow[] = [
  { method: 'GET', path: '/config', publicStatus: 200 },
  { method: 'GET', path: '/unsubscribe', publicStatus: 400 },
  { method: 'POST', path: '/unsubscribe', publicStatus: 400 },
  { method: 'POST', path: '/auth/request', publicStatus: 200 },
  { method: 'POST', path: '/auth/preview', publicStatus: 200 },
  { method: 'POST', path: '/auth/resend', publicStatus: 200 },
  { method: 'POST', path: '/auth/exchange', publicStatus: 400 },
  { method: 'POST', path: '/auth/logout', publicStatus: null },
  { method: 'GET', path: '/me', publicStatus: null },
  { method: 'PATCH', path: '/me' },
  { method: 'GET', path: '/projects' },
  { method: 'GET', path: '/events' },
  { method: 'POST', path: '/reports', submission: true },
  { method: 'POST', path: '/reports/:id/messages', resource: true },
  { method: 'GET', path: '/reports' },
  { method: 'GET', path: '/reports/:id', resource: true },
  { method: 'GET', path: '/reports/:id/files/:fileId', resource: true },
  { method: 'HEAD', path: '/reports/:id/files/:fileId', resource: true },
];

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
  getDb().run(`INSERT INTO projects (id, name, api_key_hash, api_key_prefix, settings)
    VALUES ('matrix-project', 'Matrix project', 'matrix-key', 'matrix', '{"reporterPortal":{"enabled":true}}')`);
  getDb().run(`INSERT INTO reports (id, project_id, title, metadata)
    VALUES ('matrix-report', 'matrix-project', 'Owned report', '{}')`);
  const path = join(config.dataDir, 'matrix.png');
  writeFileSync(path, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  getDb().run(
    `INSERT INTO files (id, report_id, type, filename, path, mime_type, size_bytes)
    VALUES ('matrix-file', 'matrix-report', 'screenshot', 'matrix.png', ?, 'image/png', 8)`,
    [path]
  );
  app = createPortalTestApp();
  app.route('/api/reports', reportsRoutes);
  app.route('/api/projects', projectsRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/users', usersRoutes);
});
afterEach(() => close());

async function credential(caller: Caller): Promise<string> {
  if (caller === 'anonymous' || caller === 'bearer') return '';
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
  if (caller === 'owner' || caller === 'disabled-project') {
    getDb().run('UPDATE reports SET reporter_id = ? WHERE id = ?', [
      session.reporter.id,
      'matrix-report',
    ]);
    getDb().run('UPDATE projects SET settings = ? WHERE id = ?', [
      JSON.stringify({ reporterPortal: { enabled: caller === 'owner', allowNewFeedback: true } }),
      'matrix-project',
    ]);
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
      const path = row.path.replace(':id', 'matrix-report').replace(':fileId', 'matrix-file');
      const variants = row.path.includes('/files/')
        ? ['', 'bytes=0-3']
        : row.path === '/reports' && row.method === 'GET'
          ? ['', '?groupByStatus=true']
          : [''];
      for (const variant of variants) {
        const fileRequest = row.path.includes('/files/');
        const form = new FormData();
        form.set('projectId', 'matrix-project');
        form.set('title', 'New feedback');
        const response = await app.request(
          `${portalOrigin}/api/portal${path}${fileRequest ? '' : variant}`,
          {
            method: row.method,
            headers: {
              Cookie: cookie,
              ...(caller === 'bearer' ? { Authorization: 'Bearer some-api-token' } : {}),
              Origin: portalOrigin,
              'X-BugPin-Portal': '1',
              ...(!row.submission ? { 'content-type': 'application/json' } : {}),
              ...(fileRequest && variant ? { Range: variant } : {}),
            },
            ...(['POST', 'PATCH'].includes(row.method)
              ? {
                  body: row.submission
                    ? form
                    : JSON.stringify(
                        row.path === '/auth/request'
                          ? { email: 'request@example.com' }
                          : row.method === 'PATCH'
                            ? { displayName: 'Updated name' }
                            : row.path.endsWith('/messages')
                              ? { body: 'Reporter reply' }
                              : { token: 'invalid' }
                      ),
                }
              : {}),
          }
        );
        const authenticated = ['owner', 'other', 'disabled-project'].includes(caller);
        const expected =
          row.publicStatus ??
          (!authenticated
            ? 401
            : row.submission
              ? caller === 'owner'
                ? 201
                : 404
              : row.resource
                ? caller !== 'owner'
                  ? 404
                  : fileRequest && variant
                    ? 206
                    : row.method === 'POST'
                      ? 201
                      : 200
                : 200);
        expect({
          endpoint: `${row.method} ${row.path}`,
          caller,
          variant,
          status: response.status,
        }).toEqual({
          endpoint: `${row.method} ${row.path}`,
          caller,
          variant,
          status: expected,
        });
        expect(response.headers.get('cache-control')).toBe(
          fileRequest && caller === 'owner' ? 'private, no-store' : 'no-store'
        );
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
        if (row.path === '/events' && authenticated) {
          const reader = response.body!.getReader();
          expect(new TextDecoder().decode((await reader.read()).value)).toContain(': connected');
          await reader.cancel();
        }
        if (
          row.method === 'GET' &&
          (row.path === '/projects' || row.path === '/reports') &&
          authenticated
        ) {
          const body = (await response.json()) as {
            projects?: unknown[];
            reports?: unknown[];
            columns?: Record<string, { reports: unknown[]; total: number }>;
          };
          const items =
            body.projects ??
            body.reports ??
            Object.values(body.columns!).flatMap((column) => column.reports);
          expect(items.length).toBe(caller === 'owner' ? 1 : 0);
        }
      }
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
    '/reports',
    '/reports/matrix-report/messages',
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
