import { expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { createServer } from '../../src/admin/node_modules/vite/dist/node/index.js';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { getDb } from '../../src/server/database/database';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { reportersRepo } from '../../src/server/database/repositories/reporters.repo';
import { reporterSessionsRepo } from '../../src/server/database/repositories/reporter-sessions.repo';
import { hashToken } from '../../src/server/utils/secure-token';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { openPortalDatabase } from '../server/portal/helpers';

it('bootstraps settings through the real Admin Console proxy without weakening configured-origin CSRF checks', async () => {
  const close = await openPortalDatabase();
  const backend = Bun.serve({
    port: Number(process.env.DEV_PROXY_BACKEND_PORT ?? 0),
    hostname: '127.0.0.1',
    fetch: createApp().fetch,
  });
  let proxy: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    proxy = await createServer({
      configFile: resolve('src/admin/vite.config.ts'),
      root: resolve('src/admin'),
      appType: 'custom',
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port: Number(process.env.DEV_PROXY_FRONTEND_PORT ?? 0),
        strictPort: true,
        hmr: false,
        watch: null,
        preTransformRequests: false,
        proxy: { '/api': { target: `http://127.0.0.1:${backend.port}`, xfwd: false } },
      },
    });
    await proxy.listen();
    const address = proxy.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Development proxy did not bind');
    const front = `http://localhost:${address.port}`;
    getDb().run(
      "INSERT INTO users (id,email,password_hash,name,role) VALUES ('proxy-admin','proxy@example.test','unused','Proxy admin','admin')"
    );
    const session = await sessionsRepo.create({
      userId: 'proxy-admin',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const mutate = (
      origin: string | undefined,
      site: string | undefined,
      path = '/api/projects',
      data: object = {}
    ) =>
      fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: path === '/api/settings' ? 'PUT' : 'POST',
        headers: {
          Host: `localhost:${address.port}`,
          Cookie: `session=${session.id}`,
          'Content-Type': 'application/json',
          ...(origin === undefined ? {} : { Origin: origin }),
          ...(site === undefined ? {} : { 'Sec-Fetch-Site': site }),
        },
        body: JSON.stringify(data),
      });
    for (const trustProxy of ['never', 'auto'] as const) {
      config.trustProxy = trustProxy;
      await settingsRepo.updateAll({ appUrl: '', portalBaseUrl: '', smtpEnabled: false });
      settingsCacheService.invalidate();
      expect((await settingsRepo.getAll()).appUrl).toBe('');
      const valid = await mutate(front, 'same-origin');
      expect(valid.status).toBe(400);
      expect(await valid.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
      expect((await mutate(front, undefined)).status).toBe(400);
      for (const [origin, site] of [
        [front, 'cross-site'],
        [front, 'same-site'],
        [`http://localhost:${backend.port}`, 'same-origin'],
        ['https://other.example.test', 'same-origin'],
        ['https://other.example.test', undefined],
        [undefined, undefined],
      ] as const) {
        const denied = await mutate(origin, site);
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ error: 'ORIGIN_REJECTED' });
      }
      const configured = 'https://bugs.example.test';
      expect(
        (await mutate(front, 'same-origin', '/api/settings', { appUrl: configured })).status
      ).toBe(200);
      expect((await settingsRepo.getAll()).appUrl).toBe(configured);
      expect((await mutate(configured, 'same-origin')).status).toBe(400);
      expect((await mutate(configured, undefined)).status).toBe(400);
      expect((await mutate(front, 'same-origin')).status).toBe(403);
      expect((await mutate(configured, 'cross-site')).status).toBe(403);
      expect((await mutate('https://other.example.test', 'same-origin')).status).toBe(403);
    }
  } finally {
    try {
      await proxy?.close();
    } finally {
      backend.stop(true);
      close();
    }
  }
}, 30000);

it('preserves browser origins, ignores spoofed forwarding, and routes both real Vite frontends', async () => {
  const close = await openPortalDatabase();
  const originalApiTarget = process.env.BUGPIN_API_PROXY_TARGET;
  const originalPortalTarget = process.env.BUGPIN_PORTAL_DEV_TARGET;
  const seen: Array<{ path: string; host: string | null; forwarded: string | null }> = [];
  const app = createApp();
  const backend = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      seen.push({
        path,
        host: request.headers.get('host'),
        forwarded: request.headers.get('x-forwarded-host'),
      });
      return app.fetch(request);
    },
  });
  const frontends: Array<Awaited<ReturnType<typeof createServer>>> = [];
  try {
    process.env.BUGPIN_API_PROXY_TARGET = `http://127.0.0.1:${backend.port}`;
    const start = async (frontend: 'admin' | 'portal') => {
      const server = await createServer({
        configFile: resolve(`src/${frontend}/vite.config.ts`),
        root: resolve(`src/${frontend}`),
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, watch: null, preTransformRequests: false },
      });
      frontends.push(server);
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === 'string') throw new Error('Vite did not bind');
      return { server, port: address.port };
    };
    const portal = await start('portal');
    process.env.BUGPIN_PORTAL_DEV_TARGET = `http://127.0.0.1:${portal.port}`;
    const admin = await start('admin');
    const adminOrigin = `http://localhost:${admin.port}`;
    const portalOrigin = `http://127.0.0.1:${portal.port}`;
    config.trustProxy = 'never';
    await settingsRepo.updateAll({
      appUrl: adminOrigin,
      portalBaseUrl: portalOrigin,
      smtpEnabled: false,
    });
    settingsCacheService.invalidate();
    getDb().run(
      "INSERT INTO users (id,email,password_hash,name,role) VALUES ('routing-admin','routing@example.test','unused','Routing admin','admin')"
    );
    const session = await sessionsRepo.create({
      userId: 'routing-admin',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    const now = new Date().toISOString();
    const reporter = reportersRepo.resolve('reporter@example.test', 'Reporter', now);
    const reporterSecret = 'proxy-reporter-session';
    reporterSessionsRepo.create({
      tokenHash: hashToken(reporterSecret),
      reporterId: reporter.id,
      now,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const request = (
      port: number,
      path: string,
      origin: string,
      method = 'GET',
      spoof = false,
      data: object = {}
    ) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        redirect: 'manual',
        headers: {
          Host: new URL(origin).host,
          Origin: origin,
          'Sec-Fetch-Site': 'same-origin',
          Cookie: `session=${session.id}; bugpin_reporter_session=${reporterSecret}`,
          'Content-Type': 'application/json',
          'X-BugPin-Portal': '1',
          ...(spoof
            ? {
                'X-Forwarded-Host': 'attacker.example.test',
                'X-Forwarded-Proto': 'https',
                'X-Forwarded-For': '203.0.113.99',
                'X-Real-IP': '203.0.113.99',
                Forwarded: 'host=attacker.example.test;proto=https',
              }
            : {}),
        },
        ...(method === 'GET' ? {} : { body: JSON.stringify(data) }),
      });

    for (const spoof of [false, true]) {
      const staff = await request(admin.port, '/api/projects', adminOrigin, 'POST', spoof);
      expect(staff.status).toBe(400);
      expect(await staff.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
      const login = await request(
        portal.port,
        '/api/portal/auth/request',
        portalOrigin,
        'POST',
        spoof
      );
      expect(login.status).toBe(400);
      expect(await login.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
      const profile = await request(portal.port, '/api/portal/me', portalOrigin, 'PATCH', spoof, {
        displayName: 'Updated',
      });
      expect(profile.status).toBe(200);
      expect(await profile.json()).toMatchObject({ reporter: { displayName: 'Updated' } });
    }
    for (const [port, origin, path] of [
      [admin.port, adminOrigin, '/api/projects'],
      [portal.port, portalOrigin, '/api/portal/auth/request'],
    ] as const) {
      const denied = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: {
          Host: new URL(origin).host,
          Origin: 'https://attacker.example.test',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
          'X-BugPin-Portal': '1',
          Cookie: `session=${session.id}`,
        },
        body: '{}',
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({ error: 'ORIGIN_REJECTED' });
    }
    expect(
      (await request(admin.port, '/api/portal/auth/request', adminOrigin, 'POST')).status
    ).toBe(404);
    expect((await request(admin.port, '/api/projects', portalOrigin)).status).toBe(404);
    expect((await request(admin.port, '/api/projects', 'http://127.0.0.2')).status).toBe(421);
    for (const [port, origin] of [
      [admin.port, adminOrigin],
      [portal.port, portalOrigin],
    ] as const) {
      expect((await request(port, '/api/portal/config', origin)).status).toBe(200);
      await request(port, '/branding/missing.png', origin);
      expect(seen.at(-1)).toMatchObject({
        path: '/branding/missing.png',
        host: new URL(origin).host,
        forwarded: null,
      });
    }
    await request(admin.port, '/admin/branding/missing.png', adminOrigin);
    expect(seen.at(-1)).toMatchObject({
      path: '/branding/missing.png',
      host: new URL(adminOrigin).host,
    });
    await request(admin.port, '/widget.js', adminOrigin);
    expect(seen.at(-1)).toMatchObject({ path: '/widget.js', host: new URL(adminOrigin).host });
    const beforePage = seen.length;
    const page = await request(admin.port, '/admin/test-widget', adminOrigin);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('/admin/@vite/client');
    expect(seen).toHaveLength(beforePage);
    expect(admin.server.config.server.proxy).not.toHaveProperty('/test-widget');

    await settingsRepo.updateAll({ portalBaseUrl: '' });
    settingsCacheService.invalidate();
    const sameOriginPage = await request(admin.port, '/reporter-portal/login', adminOrigin);
    expect(sameOriginPage.status).toBe(200);
    expect(await sameOriginPage.text()).toContain('/reporter-portal/@vite/client');
    const sameOriginLogin = await request(
      admin.port,
      '/api/portal/auth/request',
      adminOrigin,
      'POST',
      true
    );
    expect(sameOriginLogin.status).toBe(400);
    expect(await sameOriginLogin.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(
      (
        await request(admin.port, '/api/portal/me', adminOrigin, 'PATCH', true, {
          displayName: 'Same origin',
        })
      ).status
    ).toBe(200);

    for (const [port, path] of [
      [admin.port, '/admin/'],
      [portal.port, '/reporter-portal/'],
      [admin.port, '/reporter-portal/'],
    ] as const) {
      const token =
        path === '/admin/'
          ? admin.server.config.webSocketToken
          : portal.server.config.webSocketToken;
      const socket = new WebSocket(`ws://127.0.0.1:${port}${path}?token=${token}`, 'vite-hmr');
      try {
        const message = await Promise.race([
          new Promise<string>((resolve, reject) => {
            socket.onmessage = (event) => resolve(String(event.data));
            socket.onerror = () => reject(new Error('HMR WebSocket failed'));
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('HMR timed out')), 5000)
          ),
        ]);
        expect(JSON.parse(message)).toMatchObject({ type: 'connected' });
      } finally {
        socket.close();
      }
    }
    for (const frontend of frontends) {
      const hmr = frontend.config.server.hmr;
      expect(typeof hmr === 'object' ? hmr.clientPort : undefined).toBeUndefined();
      for (const proxy of Object.values(frontend.config.server.proxy ?? {})) {
        if (typeof proxy === 'string') throw new Error('Expected explicit proxy options');
        expect(proxy.changeOrigin).toBe(false);
        expect(proxy.xfwd).toBe(false);
      }
    }
  } finally {
    await Promise.all(frontends.map((frontend) => frontend.close()));
    backend.stop(true);
    if (originalApiTarget === undefined) delete process.env.BUGPIN_API_PROXY_TARGET;
    else process.env.BUGPIN_API_PROXY_TARGET = originalApiTarget;
    if (originalPortalTarget === undefined) delete process.env.BUGPIN_PORTAL_DEV_TARGET;
    else process.env.BUGPIN_PORTAL_DEV_TARGET = originalPortalTarget;
    close();
  }
}, 30000);
