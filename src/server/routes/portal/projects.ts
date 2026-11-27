import { Hono } from 'hono';
import { portalReaderAuthMiddleware } from '../../middleware/reporter-auth.js';
import { portalReportsService } from '../../services/portal-reports.service.js';
import { errorStatus } from '../../utils/http-status.js';

export const portalProjectsRoutes = new Hono();
portalProjectsRoutes.get('/projects', portalReaderAuthMiddleware, async (c) => {
  const result = await portalReportsService.projects(c.get('portalScope'));
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, projects: result.value });
});
