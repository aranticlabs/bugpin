import { createApp } from '../../src/server/app';
import {
  initDatabase,
  initSchema,
  runMigrations,
  getDb,
  closeDatabase,
} from '../../src/server/database/database';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { DEFAULT_REPORTER_PORTAL_LIMITS } from '../../src/shared/types';
import { MAX_REQUEST_BODY_SIZE } from '../../src/server/utils/request-limits';
import { projectsService } from '../../src/server/services/projects.service';
import { Result } from '../../src/server/utils/result';

await initDatabase();
await initSchema();
await runMigrations();
getDb().run(
  "INSERT INTO users (id, email, name, password_hash, role) VALUES ('e2e-staff', 'staff@example.test', 'Team', 'unused', 'admin')"
);
const staffSession = await sessionsRepo.create({
  userId: 'e2e-staff',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
const app = createApp();
const server = Bun.serve({
  port: 0,
  hostname: '0.0.0.0',
  idleTimeout: 60,
  maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
  fetch: app.fetch,
});
const staffOrigin = `http://127.0.0.1:${server.port}`;
const portalOrigin = `http://localhost:${server.port}`;
await settingsRepo.updateAll({
  appUrl: staffOrigin,
  portalBaseUrl: portalOrigin,
  smtpEnabled: true,
  rateLimitPerMinute: 100,
  smtpConfig: {
    host: '127.0.0.1',
    port: Number(process.env.E2E_SMTP_PORT),
    from: 'team@example.test',
  },
  reporterPortalLimits: { ...DEFAULT_REPORTER_PORTAL_LIMITS, loginExchangesPerIpPer15Min: 100 },
});
settingsCacheService.invalidate();
const project = Result.unwrap(
  await projectsService.create({
    name: 'Browser confirmations',
    settings: {
      reporterPortal: { enabled: true, allowNewFeedback: true },
      reporterNotifications: { emailEnabled: true, notifyOnNewReport: true },
    },
  })
);
console.log(
  `E2E_READY ${JSON.stringify({ staffOrigin, portalOrigin, staffSession: staffSession.id, widgetApiKey: project.apiKey })}`
);
process.on('SIGTERM', () => {
  server.stop(true);
  closeDatabase();
  process.exit(0);
});
