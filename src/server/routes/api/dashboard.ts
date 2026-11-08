import { Hono } from 'hono';
import { dashboardService } from '../../services/dashboard.service.js';
import { gamificationService } from '../../services/gamification.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { rateLimiter, userKeyGenerator } from '../../middleware/rate-limit.js';
import { validate, validatedQuery, schemas } from '../../middleware/validate.js';
import { errorStatus } from '../../utils/http-status.js';
import type { User } from '@shared/types';

const dashboard = new Hono();

dashboard.use('*', authMiddleware);
// The dashboard aggregates over every report, so one account may not run it in a tight loop
dashboard.use(
  '*',
  rateLimiter({ name: 'dashboard', max: 120, window: 60, keyGenerator: userKeyGenerator })
);

dashboard.get('/overview', validate({ query: schemas.dashboardOverview }), async (c) => {
  const query = validatedQuery(c, schemas.dashboardOverview);
  const result = await dashboardService.getOverview(query);
  if (!result.success) {
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  }
  return c.json({ success: true, overview: result.value });
});

dashboard.get('/me', validate({ query: schemas.dashboardPersonal }), async (c) => {
  const { timeZone } = validatedQuery(c, schemas.dashboardPersonal);
  const result = await dashboardService.getPersonal(c.get('user') as User, timeZone);
  if (!result.success) {
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  }
  return c.json({ success: true, personal: result.value });
});

dashboard.get('/team', validate({ query: schemas.dashboardTeam }), async (c) => {
  const { period } = validatedQuery(c, schemas.dashboardTeam);
  const result = await gamificationService.getTeam(c.get('user') as User, period);
  if (!result.success) {
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  }
  return c.json({ success: true, team: result.value });
});

export { dashboard as dashboardRoutes };
