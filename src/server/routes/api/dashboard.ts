import { Hono } from 'hono';
import { dashboardService } from '../../services/dashboard.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import type { DashboardRange, TeamPeriod, User } from '@shared/types';

const dashboard = new Hono();

dashboard.use('*', authMiddleware);

dashboard.get('/overview', validate({ query: schemas.dashboardOverview }), async (c) => {
  const query = c.get('validatedQuery' as never) as {
    projectId?: string;
    range: DashboardRange;
    timeZone?: string;
  };
  const result = await dashboardService.getOverview(query);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, overview: result.value });
});

dashboard.get('/me', validate({ query: schemas.dashboardPersonal }), async (c) => {
  const user = c.get('user') as User;
  const { timeZone } = c.get('validatedQuery' as never) as { timeZone?: string };
  const result = await dashboardService.getPersonal(user, timeZone);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, personal: result.value });
});

dashboard.get('/team', validate({ query: schemas.dashboardTeam }), async (c) => {
  const user = c.get('user') as User;
  const { period } = c.get('validatedQuery' as never) as { period: TeamPeriod };
  const result = await dashboardService.getTeam(user, period);
  if (!result.success) {
    const status = result.code === 'FORBIDDEN' ? 403 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }
  return c.json({ success: true, team: result.value });
});

export { dashboard as dashboardRoutes };
