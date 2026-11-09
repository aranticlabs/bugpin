import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { portalOriginCheck } from '../../middleware/origin-check.js';
import { reporterAuthMiddleware } from '../../middleware/reporter-auth.js';
import { portalConfigService } from '../../services/portal-config.service.js';
import { unsubscribeRoutes } from './unsubscribe.js';
import { portalAuthRoutes } from './auth.js';
import { portalMeRoutes } from './me.js';
import { portalProjectsRoutes } from './projects.js';
import { portalReportsRoutes } from './reports.js';
import { portalFilesRoutes } from './files.js';

export const portalRoutes = new Hono();

portalRoutes.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
portalRoutes.use('*', portalOriginCheck);
portalRoutes.use(
  '/auth/*',
  bodyLimit({
    maxSize: 4096,
    onError: (c) =>
      c.json(
        { success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
        413
      ),
  })
);
portalRoutes.route('/auth', portalAuthRoutes);
portalRoutes.route('/unsubscribe', unsubscribeRoutes);
portalRoutes.route('/', portalMeRoutes);
portalRoutes.route('/', portalProjectsRoutes);
portalRoutes.route('/', portalReportsRoutes);
portalRoutes.route('/', portalFilesRoutes);
portalRoutes.get('/me', reporterAuthMiddleware, (c) =>
  c.json({ success: true, reporter: c.get('reporter') })
);
portalRoutes.get('/config', async (c) => {
  const result = await portalConfigService.get();
  if (!result.success)
    return c.json({ success: false, error: result.code, message: result.error }, 500);
  return c.json({ success: true, config: result.value });
});
