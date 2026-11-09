import { expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { createServer } from '../../src/admin/node_modules/vite/dist/node/index.js';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { getDb } from '../../src/server/database/database';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
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
        proxy: { '/api': { target: `http://127.0.0.1:${backend.port}` } },
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
