import { Hono } from 'hono';
import { reporterAuthMiddleware } from '../../middleware/reporter-auth.js';
import { portalReportsService } from '../../services/portal-reports.service.js';
import { errorStatus } from '../../utils/http-status.js';

export const portalProjectsRoutes = new Hono();
portalProjectsRoutes.get('/projects', reporterAuthMiddleware, async (c) => {
  const result = await portalReportsService.projects(c.get('reporter').id);
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, projects: result.value });
});
