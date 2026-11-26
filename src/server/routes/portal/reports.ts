import { Hono } from 'hono';
import { portalReaderAuthMiddleware } from '../../middleware/reporter-auth.js';
import { validate, validatedQuery } from '../../middleware/validate.js';
import { portalReportsService } from '../../services/portal-reports.service.js';
import { portalReportQuerySchema } from '../../utils/portal-schemas.js';
import { errorStatus } from '../../utils/http-status.js';

export const portalReportsRoutes = new Hono();
portalReportsRoutes.get(
  '/reports',
  portalReaderAuthMiddleware,
  validate({ query: portalReportQuerySchema }),
  (c) => {
    const result = portalReportsService.list(
      c.get('portalScope'),
      validatedQuery(c, portalReportQuerySchema)
    );
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return c.json({ success: true, ...result.value });
  }
);
portalReportsRoutes.get('/reports/:id', portalReaderAuthMiddleware, async (c) => {
  const result = await portalReportsService.detail(c.req.param('id'), c.get('portalScope'));
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, report: result.value });
});
