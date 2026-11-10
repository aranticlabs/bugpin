import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from '../../src/server/node_modules/hono';
import { config } from '../../src/server/config';
import { createApp } from '../../src/server/app';
import { authService } from '../../src/server/services/auth.service';
import { proxyTokenService } from '../../src/server/services/proxy-token.service';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import {
  getClientIp,
  getEffectiveOrigin,
  requiredTrustProxy,
} from '../../src/server/utils/client-ip';
import { Result } from '../../src/server/utils/result';
import type { AppSettings, Session, User } from '../../src/shared/types';

const originalConfig = { ...config };
const originalGetAll = settingsCacheService.getAll;
const originalValidateSession = authService.validateSession;
let directory: string;
let token: string;
let settings: AppSettings;
let role: User['role'];
let app: Hono;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'bugpin-proxy-token-'));
  Object.assign(config, {
    dataDir: directory,
    proxyTokenFile: join(directory, 'shared', 'proxy-token'),
    trustProxy: 'token',
    disableHttpsEnforcement: false,
  });
  expect(proxyTokenService.initialize().success).toBe(true);
  token = Result.unwrap(proxyTokenService.get());
  settings = {
    appUrl: 'https://staff.example.test',
    portalBaseUrl: 'https://portal.example.test',
    enforceHttps: false,
  } as AppSettings;
  role = 'admin';
  settingsCacheService.getAll = async () => settings;
  authService.validateSession = async () =>
    Result.ok({
      user: { id: 'admin', role, isActive: true } as User,
      session: { id: 'session', userId: 'admin' } as Session,
    });
  app = createApp();
  app.get('/ip', (c) =>
    c.json({ ip: getClientIp(c), origin: getEffectiveOrigin(c), required: requiredTrustProxy(c) })
  );
  app.get('/admin/', (c) => c.text('allowed'));
});

afterEach(() => {
  Object.assign(config, originalConfig);
  settingsCacheService.getAll = originalGetAll;
  authService.validateSession = originalValidateSession;
  rmSync(directory, { recursive: true, force: true });
});

function gate(uri: string, host = 'staff.example.test', proto = 'https', suppliedToken = token) {
  return app.request(
    'http://server:4300/internal/frontend-gate',
    {
      headers: {
        Host: 'server:4300',
        'X-BugPin-Original-URI': uri,
        'X-BugPin-Frontend': 'admin',
        'X-BugPin-Gated-Frontend': uri.startsWith('/reporter-portal') ? 'portal' : 'admin',
        'X-Forwarded-Host': host,
        'X-Forwarded-Proto': proto,
        'X-BugPin-Proxy-Token': suppliedToken,
      },
    },
    { requestIP: () => ({ address: '203.0.113.10' }) }
  );
}

function adminRequest(method = 'GET', headers: Record<string, string> = {}) {
  const path = method === 'GET' ? '/proxy-token' : '/proxy-token/regenerate';
  return app.request(`https://staff.example.test/api/settings${path}`, {
    method,
    headers: {
      Cookie: 'session=session',
      Origin: 'https://staff.example.test',
      'X-BugPin-Proxy-Token': token,
      ...headers,
    },
  });
}

describe('proxy token persistence', () => {
  it('creates a private random token and a cross-UID readable export', () => {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url').length).toBe(32);
    expect(readFileSync(join(directory, '.proxy-token'), 'utf8')).toBe(token);
    expect(statSync(join(directory, '.proxy-token')).mode & 0o777).toBe(0o600);
    expect(readFileSync(config.proxyTokenFile!, 'utf8')).toBe(token);
    expect(statSync(config.proxyTokenFile!).mode & 0o777).toBe(0o644);
  });

  it('reuses the stored token, repairs private permissions, and republishes on startup', () => {
    chmodSync(join(directory, '.proxy-token'), 0o644);
    writeFileSync(config.proxyTokenFile!, 'stale');
    expect(proxyTokenService.initialize().success).toBe(true);
    expect(Result.unwrap(proxyTokenService.get())).toBe(token);
    expect(statSync(join(directory, '.proxy-token')).mode & 0o777).toBe(0o600);
    expect(readFileSync(config.proxyTokenFile!, 'utf8')).toBe(token);
  });

  it('regenerates immediately and persists both files', () => {
    const { token: next } = Result.unwrap(proxyTokenService.regenerate());
    expect(next).not.toBe(token);
    expect(Result.unwrap(proxyTokenService.verify(token))).toBe(false);
    expect(Result.unwrap(proxyTokenService.verify(next))).toBe(true);
    expect(readFileSync(join(directory, '.proxy-token'), 'utf8')).toBe(next);
    expect(readFileSync(config.proxyTokenFile!, 'utf8')).toBe(next);
    expect(statSync(config.proxyTokenFile!).mode & 0o777).toBe(0o644);
    expect(proxyTokenService.initialize().success).toBe(true);
    expect(Result.unwrap(proxyTokenService.get())).toBe(next);
  });

  it('works without an export and fails closed for an unreadable export location', () => {
    config.proxyTokenFile = undefined;
    expect(proxyTokenService.initialize().success).toBe(true);
    const blocked = join(directory, 'blocked');
    writeFileSync(blocked, 'file');
    config.proxyTokenFile = join(blocked, 'token');
    expect(proxyTokenService.initialize()).toEqual({
      success: false,
      error: 'Failed to initialize proxy token',
      code: 'PROXY_TOKEN_ERROR',
    });
    expect(existsSync(join(blocked, 'token'))).toBe(false);
  });

  it('keeps the active and persisted token if staging the export fails', () => {
    const blocked = join(directory, 'blocked');
    writeFileSync(blocked, 'file');
    config.proxyTokenFile = join(blocked, 'token');
    expect(proxyTokenService.regenerate().success).toBe(false);
    expect(Result.unwrap(proxyTokenService.get())).toBe(token);
    expect(readFileSync(join(directory, '.proxy-token'), 'utf8')).toBe(token);
    expect(readFileSync(join(directory, 'shared', 'proxy-token'), 'utf8')).toBe(token);
    expect(readdirSync(directory).some((file) => file.endsWith('.tmp'))).toBe(false);
  });

  it('keeps the active and exported token if the private file cannot be replaced', () => {
    rmSync(join(directory, '.proxy-token'));
    mkdirSync(join(directory, '.proxy-token'));
    expect(proxyTokenService.regenerate().success).toBe(false);
    expect(Result.unwrap(proxyTokenService.get())).toBe(token);
    expect(readFileSync(config.proxyTokenFile!, 'utf8')).toBe(token);
    expect(readdirSync(directory).some((file) => file.endsWith('.tmp'))).toBe(false);
    expect(readdirSync(join(directory, 'shared'))).toEqual(['proxy-token']);
  });

  it('returns the active token and warning if the staged export cannot replace its destination', async () => {
    rmSync(config.proxyTokenFile!);
    mkdirSync(config.proxyTokenFile!);
    const response = await adminRequest('POST');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; warning: string };
    expect(body.warning).toContain('shared file could not be updated');
    expect(body.token).not.toBe(token);
    expect(Result.unwrap(proxyTokenService.get())).toBe(body.token);
    expect(readFileSync(join(directory, '.proxy-token'), 'utf8')).toBe(body.token);
    expect(Result.unwrap(proxyTokenService.verify(token))).toBe(false);
    expect(readdirSync(join(directory, 'shared'))).toEqual(['proxy-token']);
    token = body.token;
    for (let read = 0; read < 2; read++) {
      const status = await adminRequest();
      expect(await status.json()).toEqual({ success: true, enabled: true, ...body });
    }
    rmSync(config.proxyTokenFile!, { recursive: true });
    const repaired = await adminRequest('POST');
    const repairedBody = (await repaired.json()) as { token: string; warning?: string };
    expect(repairedBody.warning).toBeUndefined();
    token = repairedBody.token;
    expect(readFileSync(config.proxyTokenFile!, 'utf8')).toBe(repairedBody.token);
    expect(await (await adminRequest()).json()).toEqual({
      success: true,
      enabled: true,
      token: repairedBody.token,
    });
  });

  it('does not create or export a token outside token mode', () => {
    rmSync(join(directory, '.proxy-token'));
    rmSync(config.proxyTokenFile!);
    for (const mode of ['never', 'always', 'auto'] as const) {
      config.trustProxy = mode;
      expect(proxyTokenService.initialize().success).toBe(true);
      expect(proxyTokenService.get().success).toBe(false);
      expect(existsSync(join(directory, '.proxy-token'))).toBe(false);
      expect(existsSync(config.proxyTokenFile!)).toBe(false);
      expect(Result.unwrap(proxyTokenService.verify(token))).toBe(false);
    }
  });

  it('does not replace malformed stored tokens silently', () => {
    writeFileSync(join(directory, '.proxy-token'), 'invalid');
    expect(proxyTokenService.initialize().success).toBe(false);
    expect(readFileSync(join(directory, '.proxy-token'), 'utf8')).toBe('invalid');
  });
});

describe('frontend gate', () => {
  it('disables internal split-deployment endpoints outside token mode', async () => {
    for (const mode of ['never', 'always', 'auto'] as const) {
      config.trustProxy = mode;
      for (const method of ['GET', 'HEAD']) {
        const check = await app.request('http://server:4300/internal/proxy-check', {
          method,
          headers: { 'X-BugPin-Proxy-Token': token },
        });
        expect(check.status).toBe(409);
        if (method === 'GET')
          expect(await check.json()).toMatchObject({ error: 'PROXY_TOKEN_DISABLED' });
        expect(
          (await app.request('http://server:4300/internal/frontend-gate', { method })).status
        ).toBe(404);
      }
    }
  });

  it('allows valid frontend paths and returns HSTS only when enforcement applies', async () => {
    for (const [uri, host] of [
      ['/admin/', 'staff.example.test'],
      ['/reporter-portal/login', 'portal.example.test'],
    ]) {
      let response = await gate(uri, host);
      expect(response.status).toBe(204);
      expect(response.headers.get('X-BugPin-Gate-HSTS')).toBeNull();
      settings.enforceHttps = true;
      response = await gate(uri, host);
      expect(response.status).toBe(204);
      expect(response.headers.get('X-BugPin-Gate-HSTS')).toBe(
        'max-age=31536000; includeSubDomains'
      );
      config.disableHttpsEnforcement = true;
      response = await gate(uri, host, 'http');
      expect(response.status).toBe(204);
      expect(response.headers.get('X-BugPin-Gate-HSTS')).toBeNull();
      config.disableHttpsEnforcement = false;
      settings.enforceHttps = false;
    }
  });

  it('maps HTTPS redirects to gate headers and preserves the original path and query', async () => {
    settings.enforceHttps = true;
    for (const [uri, host] of [
      ['/admin/reports?sort=new', 'staff.example.test'],
      ['/reporter-portal/login?x=1', 'portal.example.test'],
    ]) {
      const response = await gate(uri, host, 'http');
      expect(response.status).toBe(403);
      expect(response.headers.get('X-BugPin-Gate-Status')).toBe('301');
      expect(response.headers.get('X-BugPin-Gate-Location')).toBe(`https://${host}${uri}`);
      expect(response.headers.get('Location')).toBeNull();
    }
  });

  it('maps unknown hosts and wrong frontend origins before considering redirects', async () => {
    settings.enforceHttps = true;
    for (const [uri, host, status] of [
      ['/admin/', 'unknown.example.test', '421'],
      ['/admin/', 'portal.example.test', '404'],
      ['/reporter-portal/', 'staff.example.test', '404'],
    ]) {
      const response = await gate(uri, host, 'http');
      expect(response.status).toBe(403);
      expect(response.headers.get('X-BugPin-Gate-Status')).toBe(status);
      expect(response.headers.get('X-BugPin-Gate-Location')).toBeNull();
    }
  });

  it('requires a valid token and supports same-origin mode', async () => {
    const response = await app.request('http://server:4300/internal/frontend-gate', {
      headers: { Host: 'portal.example.test', 'X-BugPin-Original-URI': '/reporter-portal/' },
    });
    expect(response.status).toBe(421);
    settings.portalBaseUrl = '';
    expect((await gate('/reporter-portal/', 'staff.example.test')).status).toBe(204);
  });

  it('routes the gated location independently of the original URI normalization', async () => {
    const response = await app.request('http://server:4300/internal/frontend-gate', {
      headers: {
        'X-BugPin-Proxy-Token': token,
        'X-BugPin-Frontend': 'admin',
        'X-BugPin-Gated-Frontend': 'admin',
        'X-BugPin-Original-URI': '/reporter-portal/../admin/',
        'X-Forwarded-Host': 'portal.example.test',
        'X-Forwarded-Proto': 'https',
      },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('X-BugPin-Gate-Status')).toBe('404');
  });

  it('rejects missing or invalid original URIs', async () => {
    for (const uri of [
      '',
      'https://evil.test/admin/',
      '//evil.test/admin/',
      '/\\evil.test',
      '/admin/#fragment',
    ]) {
      const response = await gate(uri);
      expect(response.status).toBe(403);
      expect(response.headers.get('X-BugPin-Gate-Status')).toBe('404');
    }
  });
});

describe('token proxy trust', () => {
  it('rejects missing or invalid tokens even on private peers', async () => {
    settings.portalBaseUrl = '';
    for (const supplied of ['', 'wrong', 'x'.repeat(43)]) {
      const response = await app.request(
        'http://server:4300/ip',
        {
          headers: {
            Host: 'server:4300',
            'X-Forwarded-Host': 'portal.example.test',
            'X-Forwarded-Proto': 'https',
            'X-Forwarded-For': '198.51.100.1',
            'X-Real-IP': '198.51.100.2',
            'X-BugPin-Proxy-Token': supplied,
          },
        },
        { requestIP: () => ({ address: '10.0.0.1' }) }
      );
      expect(response.status).toBe(421);
    }
  });

  it('rejects tokenless API requests on configured hosts in both portal modes', async () => {
    for (const portalBaseUrl of ['', 'https://portal.example.test']) {
      settings.portalBaseUrl = portalBaseUrl;
      for (const host of ['staff.example.test', 'portal.example.test']) {
        const response = await app.request(`http://${host}/api/settings`, {
          headers: { Host: host },
        });
        expect(response.status).toBe(421);
        expect(await response.json()).toEqual({
          success: false,
          error: 'MISDIRECTED_REQUEST',
          message: 'Unknown host',
        });
      }
    }
  });

  it('allows only GET and HEAD healthchecks and proxy checks without a token', async () => {
    settings.enforceHttps = true;
    for (const method of ['GET', 'HEAD']) {
      const response = await app.request(
        'http://127.0.0.1:4300/health',
        { method },
        {
          requestIP: () => ({ address: '127.0.0.1' }),
        }
      );
      expect(response.status).toBe(200);
      expect(
        (await app.request('http://server:4300/internal/proxy-check', { method })).status
      ).toBe(403);
    }
    for (const path of ['/health', '/internal/proxy-check', '/internal/frontend-gate']) {
      expect((await app.request(`http://server:4300${path}`, { method: 'POST' })).status).toBe(421);
    }
  });

  it('limits portal proxies and internal requests even in same-origin mode', async () => {
    settings.portalBaseUrl = '';
    for (const frontend of ['admin', 'portal']) {
      const headers = { 'X-BugPin-Proxy-Token': token, 'X-BugPin-Frontend': frontend };
      for (const path of ['/internal/private', '/internal/other/path']) {
        expect((await app.request(`http://server:4300${path}`, { headers })).status).toBe(404);
      }
      if (frontend === 'portal') {
        for (const path of [
          '/admin/',
          '/api/settings',
          '/widget.js',
          '/health',
          '/reporter-portal/',
        ]) {
          expect((await app.request(`http://server:4300${path}`, { headers })).status).toBe(404);
        }
      }
    }
    for (const path of ['/', '/api/portal/config']) {
      const response = await app.request(`http://server:4300${path}`, {
        headers: { 'X-BugPin-Proxy-Token': token, 'X-BugPin-Frontend': 'portal' },
      });
      expect(response.status).not.toBe(421);
    }
  });

  it('rejects unnormalized portal request targets over a TCP socket', async () => {
    settings.portalBaseUrl = '';
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
    try {
      for (const path of [
        '/api/portal/..\\..\\api/settings',
        '/api/portal/%2e%2e/settings',
        '/api/portal/../../internal/proxy-check',
      ]) {
        const response = await new Promise<string>((resolve, reject) => {
          let data = '';
          void Bun.connect({
            hostname: '127.0.0.1',
            port: server.port!,
            socket: {
              open(socket) {
                socket.write(
                  `GET ${path} HTTP/1.1\r\nHost: staff.example.test\r\nX-BugPin-Proxy-Token: ${token}\r\nX-BugPin-Frontend: portal\r\nCookie: session=session\r\nConnection: close\r\n\r\n`
                );
                socket.timeout(2);
              },
              data(_socket, chunk) {
                data += chunk.toString();
              },
              close() {
                resolve(data);
              },
              error(_socket, error) {
                reject(error);
              },
              timeout(socket) {
                socket.terminate();
                reject(new Error('Raw request timed out'));
              },
            },
          }).catch(reject);
        });
        expect(response.split('\r\n')[0]).toMatch(/^HTTP\/1\.1 (404|421) /);
        expect(response).not.toContain('"enabled"');
      }
    } finally {
      await server.stop(true);
    }
  });

  it('trusts a valid token regardless of the socket address and falls back to X-Real-IP', async () => {
    settings.portalBaseUrl = '';
    for (const peer of [undefined, '203.0.113.10']) {
      for (const ipHeader of ['X-Forwarded-For', 'X-Real-IP']) {
        const response = await app.request(
          'http://server:4300/ip',
          {
            headers: {
              Host: 'server:4300',
              'X-Forwarded-Host': 'staff.example.test',
              'X-Forwarded-Proto': 'https',
              [ipHeader]: '198.51.100.1',
              'X-BugPin-Proxy-Token': token,
            },
          },
          peer ? { requestIP: () => ({ address: peer }) } : undefined
        );
        expect(await response.json()).toEqual({
          ip: '198.51.100.1',
          origin: 'https://staff.example.test',
          required: null,
        });
      }
    }
  });

  it('rejects forged origins with 421 when separate portal mode is enabled', async () => {
    for (const supplied of ['', 'wrong']) {
      const headers = {
        'X-Forwarded-Host': 'staff.example.test',
        'X-Forwarded-Proto': 'https',
        'X-BugPin-Proxy-Token': supplied,
      };
      expect((await app.request('http://server:4300/admin/', { headers })).status).toBe(421);
      const response = await gate('/admin/', 'staff.example.test', 'https', supplied);
      expect(response.status).toBe(421);
    }
    expect((await gate('/admin/')).status).toBe(204);
  });

  it('proxy-check bypasses host and HTTPS routing and rejects the previous token after regeneration', async () => {
    settings.enforceHttps = true;
    for (const supplied of ['', 'wrong', 'x'.repeat(43), token]) {
      const response = await app.request('http://server:4300/internal/proxy-check', {
        headers: { 'X-BugPin-Proxy-Token': supplied },
      });
      expect(response.status).toBe(supplied === token ? 204 : 403);
      expect(await response.text()).toBe('');
      expect(response.headers.get('X-BugPin-Proxy-Token')).toBeNull();
    }
    const { token: next } = Result.unwrap(proxyTokenService.regenerate());
    for (const [supplied, status] of [
      [token, 403],
      [next, 204],
    ] as const)
      expect(
        (
          await app.request('http://server:4300/internal/proxy-check', {
            headers: { 'X-BugPin-Proxy-Token': supplied },
          })
        ).status
      ).toBe(status);
  });
});

describe('admin proxy token endpoints', () => {
  it('reads and regenerates with no-store and immediately replaces the exported token', async () => {
    const read = await adminRequest();
    expect(read.status).toBe(200);
    expect(read.headers.get('Cache-Control')).toBe('no-store');
    expect(await read.json()).toEqual({ success: true, enabled: true, token });
    const regenerated = await adminRequest('POST');
    expect(regenerated.status).toBe(200);
    expect(regenerated.headers.get('Cache-Control')).toBe('no-store');
    const body = (await regenerated.json()) as {
      success: boolean;
      enabled: boolean;
      token: string;
    };
    expect(body).toEqual({
      success: true,
      enabled: true,
      token: Result.unwrap(proxyTokenService.get()),
    });
    expect(body.token).not.toBe(token);
    expect(Result.unwrap(proxyTokenService.verify(token))).toBe(false);
    expect(readFileSync(config.proxyTokenFile!, 'utf8')).toBe(body.token);
  });

  it('requires an admin and authentication on both endpoints, including no-store on denials', async () => {
    for (const method of ['GET', 'POST']) {
      for (const userRole of ['editor', 'viewer'] as const) {
        role = userRole;
        const response = await adminRequest(method);
        expect(response.status).toBe(403);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.text()).not.toContain(token);
      }
      const response = await adminRequest(method, { Cookie: '' });
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('applies the staff origin check to regeneration', async () => {
    for (const Origin of ['', 'https://evil.test', 'https://portal.example.test']) {
      const response = await adminRequest('POST', { Origin });
      expect(response.status).toBe(403);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(Result.unwrap(proxyTokenService.get())).toBe(token);
  });

  it('hides the token when token trust mode is disabled', async () => {
    config.trustProxy = 'never';
    for (const method of ['GET', 'POST']) {
      const response = await adminRequest(method);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({ success: true, enabled: false });
    }
    expect(Result.unwrap(proxyTokenService.get())).toBe(token);
  });
});
