import { afterEach, beforeEach, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono';
import { hostRouting } from '../../../src/server/middleware/host-routing';
import { httpsEnforcement } from '../../../src/server/middleware/https-enforcement';
import { portalCsp } from '../../../src/server/middleware/portal-csp';
import { servePortal } from '../../../src/server/routes/static';
import { config } from '../../../src/server/config';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { settingsService } from '../../../src/server/services/settings.service';
import { openPortalDatabase } from './helpers';

let close: () => void;
let app: Hono;
beforeEach(async () => {
  close = await openPortalDatabase();
  config.portalDir = join(config.dataDir, 'portal');
  mkdirSync(join(config.portalDir, 'assets'), { recursive: true });
  writeFileSync(
    join(config.portalDir, 'index.html'),
    '<!doctype html><title>Reporter Portal</title>'
  );
  writeFileSync(join(config.portalDir, 'assets', 'main.js'), 'document.title = "Portal";');
  await settingsRepo.updateAll({
    appUrl: 'https://staff.example.test',
    portalBaseUrl: 'https://portal.example.test',
  });
  settingsCacheService.invalidate();
  app = new Hono();
  app.use('*', hostRouting);
  app.use('*', httpsEnforcement);
  app.use('/reporter-portal', portalCsp);
  app.use('/reporter-portal/*', portalCsp);
  app.get('/reporter-portal', servePortal);
  app.get('/reporter-portal/*', servePortal);
  app.get('/', (c) => (c.get('portalHost') ? c.redirect('/reporter-portal/') : c.text('allowed')));
  app.all('*', (c) => c.text('allowed'));
});
afterEach(() => close());

it('separates every portal surface from staff, widget, integrations, and public files', async () => {
  for (const path of [
    '/admin',
    '/admin/reports/123',
    '/api/reports',
    '/api/auth/login',
    '/api/events',
    '/api/widget/config/key',
    '/widget.js',
    '/api/public/files/file',
    '/api/webhooks/github',
  ]) {
    expect((await app.request(`https://staff.example.test${path}`)).status).toBe(200);
    expect((await app.request(`https://portal.example.test${path}`)).status).toBe(404);
  }
  for (const path of [
    '/reporter-portal',
    '/reporter-portal/login',
    '/api/portal/me',
    '/api/portal/events',
    '/api/portal/unsubscribe',
  ]) {
    expect((await app.request(`https://portal.example.test${path}`)).status).toBe(200);
    expect((await app.request(`https://staff.example.test${path}`)).status).toBe(404);
  }
  for (const host of ['staff.example.test', 'portal.example.test']) {
    for (const path of ['/branding/light/logo-light.svg', '/api/portal/config'])
      expect((await app.request(`https://${host}${path}`)).status).toBe(200);
  }
  expect((await app.request('https://portal.example.test/api/portalish')).status).toBe(404);
  expect((await app.request('https://staff.example.test/api/portalish')).status).toBe(200);
});

it('rejects unknown and malformed hosts before redirects while keeping loopback tooling available', async () => {
  await settingsRepo.updateAll({ enforceHttps: true });
  settingsCacheService.invalidate();
  for (const host of ['unknown.example.test', 'portal.example.test:9999']) {
    const response = await app.request(`http://${host}/admin`);
    expect(response.status).toBe(421);
    expect(response.headers.get('Location')).toBeNull();
  }
  expect(
    (
      await app.request('https://staff.example.test/admin', {
        headers: { Host: 'unknown.example.test' },
      })
    ).status
  ).toBe(421);
  expect(
    (
      await app.request('https://staff.example.test/admin', {
        headers: { Host: 'staff.example.test,unknown.example.test' },
      })
    ).status
  ).toBe(421);
  await settingsRepo.updateAll({ enforceHttps: false });
  settingsCacheService.invalidate();
  for (const host of ['localhost', '127.0.0.2', '[::1]'])
    expect(
      (
        await app.request(
          `http://${host}/health`,
          {},
          { requestIP: () => ({ address: '127.0.0.1' }) }
        )
      ).status
    ).toBe(200);
});

it('trusts forwarded host and protocol only under the existing proxy policy', async () => {
  config.trustProxy = 'auto';
  const headers = { 'X-Forwarded-Host': 'portal.example.test', 'X-Forwarded-Proto': 'https' };
  const proxy = { requestIP: () => ({ address: '127.0.0.1' }) };
  const publicPeer = { requestIP: () => ({ address: '203.0.113.1' }) };
  expect((await app.request('http://internal.example/admin', { headers }, proxy)).status).toBe(404);
  expect(
    (await app.request('http://internal.example/reporter-portal/', { headers }, proxy)).status
  ).toBe(200);
  expect(
    (await app.request('http://internal.example/reporter-portal/', { headers }, publicPeer)).status
  ).toBe(421);
  expect(
    (
      await app.request(
        'http://internal.example/reporters',
        { headers: { ...headers, 'X-Forwarded-Host': 'portal.example.test,evil.example' } },
        proxy
      )
    ).status
  ).toBe(421);
  config.trustProxy = 'never';
  expect(
    (await app.request('http://internal.example/reporter-portal/', { headers }, proxy)).status
  ).toBe(421);
});

it('redirects only a recognized effective host and emits HSTS for portal HTTPS', async () => {
  await settingsRepo.updateAll({ enforceHttps: true });
  settingsCacheService.invalidate();
  config.trustProxy = 'auto';
  const peer = { requestIP: () => ({ address: '127.0.0.1' }) };
  const response = await app.request(
    'http://internal.example/admin',
    { headers: { 'X-Forwarded-Host': 'portal.example.test', 'X-Forwarded-Proto': 'http' } },
    peer
  );
  expect(response.status).toBe(404);
  const redirect = await app.request(
    'http://internal.example/reporter-portal/login?x=1',
    { headers: { 'X-Forwarded-Host': 'portal.example.test', 'X-Forwarded-Proto': 'http' } },
    peer
  );
  expect(redirect.headers.get('Location')).toBe(
    'https://portal.example.test/reporter-portal/login?x=1'
  );
  const secure = await app.request('https://portal.example.test/reporter-portal/');
  expect(secure.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
  const root = await app.request('http://portal.example.test/');
  expect(root.headers.get('Location')).toBe('https://portal.example.test/');
});

it('applies CSP and no-store to portal HTML, serves assets and deep links, and rejects traversal', async () => {
  for (const path of [
    '/reporter-portal',
    '/reporter-portal/',
    '/reporter-portal/login',
    '/reporter-portal/reports/123',
  ]) {
    const response = await app.request(`https://portal.example.test${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  }
  const asset = await app.request('https://portal.example.test/reporter-portal/assets/main.js');
  expect(asset.headers.get('Content-Type')).toContain('javascript');
  expect(asset.headers.get('Content-Security-Policy')).toBeNull();
  expect(
    (await app.request('https://portal.example.test/reporter-portal/assets/missing.js')).status
  ).toBe(404);
  expect(
    (await app.request('https://portal.example.test/reporter-portal/%2e%2e%2fpackage.json')).status
  ).toBe(404);
  const raw = {
    url: 'https://portal.example.test/reporter-portal/../../package.json',
    method: 'GET',
    headers: new Headers(),
  } as unknown as Request;
  expect((await app.fetch(raw)).status).toBe(404);
  expect((await app.request('https://portal.example.test/')).headers.get('Location')).toBe(
    '/reporter-portal/'
  );
});

it('preserves arbitrary hosts and both route trees in same-origin mode', async () => {
  await settingsRepo.updateAll({ portalBaseUrl: '' });
  settingsCacheService.invalidate();
  for (const path of [
    '/admin',
    '/reporter-portal',
    '/api/widget/submit',
    '/api/reports',
    '/api/portal/me',
  ])
    expect((await app.request(`https://any.example.test${path}`)).status).toBe(200);
});

it('rejects clearing the staff origin and restores Admin Console routing through offline portal-origin recovery', async () => {
  expect(await settingsService.update({ appUrl: '' })).toMatchObject({
    success: false,
    code: 'INVALID_APP_URL',
  });
  expect((await app.request('https://staff.example.test/admin')).status).toBe(200);
  expect((await app.request('https://portal.example.test/admin')).status).toBe(404);
  await settingsRepo.updateAll({ appUrl: '', appName: 'Recovery fixture' });
  settingsCacheService.invalidate();
  expect((await app.request('https://staff.example.test/admin')).status).toBe(421);
  const before = await settingsRepo.getAll();
  const recovered = Bun.spawnSync(['make', 'reset-portal-origin'], {
    env: { ...process.env, NODE_ENV: 'test', DATA_DIR: config.dataDir },
  });
  expect(recovered.exitCode).toBe(0);
  expect(recovered.stdout.toString()).toContain('Portal Base URL cleared');
  expect(await settingsRepo.getAll()).toEqual({ ...before, portalBaseUrl: '' });
  settingsCacheService.invalidate();
  expect((await app.request('https://staff.example.test/admin')).status).toBe(200);
  expect(
    (
      await settingsService.update({
        appUrl: 'https://staff.example.test',
        portalBaseUrl: 'https://portal.example.test',
      })
    ).success
  ).toBe(true);
  expect((await app.request('https://portal.example.test/admin')).status).toBe(404);
  expect((await app.request('https://unknown.example.test/admin')).status).toBe(421);
});

it('never treats loopback Host headers as a portal or Admin Console routing exemption', async () => {
  const peers = ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.0.2', '203.0.113.7'];
  for (const address of peers) {
    const peer = { requestIP: () => ({ address }) };
    for (const host of ['localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
      for (const path of [
        '/admin',
        '/admin/test-widget',
        '/test-widget',
        '/api/reports',
        '/api/portal/me',
        '/reporter-portal',
      ])
        expect((await app.request(`http://${host}${path}`, {}, peer)).status).toBe(421);
      expect((await app.request(`http://${host}/health`, {}, peer)).status).toBe(
        address === '10.0.0.2' || address === '203.0.113.7' ? 421 : 200
      );
    }
  }
  config.trustProxy = 'auto';
  expect(
    (
      await app.request(
        'http://localhost/admin',
        { headers: { 'X-Forwarded-Host': 'localhost' } },
        { requestIP: () => ({ address: '127.0.0.1' }) }
      )
    ).status
  ).toBe(421);
});
