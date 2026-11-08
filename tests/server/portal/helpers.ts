import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono';
import { portalRoutes } from '../../../src/server/routes/portal';
import { config } from '../../../src/server/config';
import { closeDatabase, initDatabase, initSchema } from '../../../src/server/database/database';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { clearAllRateLimits } from '../../../src/server/middleware/rate-limit';

export const portalOrigin = 'https://bugpin.example.test';

export function createPortalTestApp(): Hono {
  const app = new Hono();
  app.route('/api/portal', portalRoutes);
  return app;
}

export async function openPortalDatabase(): Promise<() => void> {
  const original = { ...config };
  const directory = mkdtempSync(join(tmpdir(), 'bugpin-portal-'));
  closeDatabase();
  Object.assign(config, {
    dataDir: directory,
    dbPath: join(directory, 'bugpin.db'),
    screenshotsDir: join(directory, 'screenshots'),
    attachmentsDir: join(directory, 'attachments'),
    brandingDir: join(directory, 'branding'),
    avatarsDir: join(directory, 'avatars'),
    trustProxy: 'never',
  });
  await initDatabase();
  await initSchema();
  await settingsRepo.updateAll({
    appUrl: portalOrigin,
    smtpEnabled: true,
    smtpConfig: { host: 'localhost', from: 'team@example.test' },
  });
  settingsCacheService.invalidate();
  clearAllRateLimits();
  return () => {
    closeDatabase();
    Object.assign(config, original);
    settingsCacheService.invalidate();
    clearAllRateLimits();
    rmSync(directory, { recursive: true, force: true });
  };
}

export function portalPost(
  app: Hono,
  path: string,
  body: unknown,
  cookie?: string
): Promise<Response> {
  return Promise.resolve(
    app.request(`${portalOrigin}/api/portal${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Origin: portalOrigin,
        'X-BugPin-Portal': '1',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    })
  );
}
