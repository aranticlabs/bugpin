import { Hono } from 'hono';
import { reporterAuthMiddleware } from '../../middleware/reporter-auth.js';
import { portalReportsService } from '../../services/portal-reports.service.js';
import { createFileResponse } from '../../utils/range.js';

export const portalFilesRoutes = new Hono();
portalFilesRoutes.on(
  ['GET', 'HEAD'],
  '/reports/:id/files/:fileId',
  reporterAuthMiddleware,
  async (c) => {
    const result = portalReportsService.file(
      c.req.param('id'),
      c.req.param('fileId'),
      c.get('reporter').id
    );
    if (!result.success)
      return c.json({ success: false, error: result.code, message: result.error }, 404);
    const { file, handle } = result.value;
    c.header('Cache-Control', 'private, no-store');
    const response = await createFileResponse({
      handle,
      rangeHeader: c.req.header('range'),
      size: file.sizeBytes,
      mimeType: file.mimeType,
      cacheControl: 'private, no-store',
      filename: file.filename,
      headOnly: c.req.method === 'HEAD',
    });
    return (
      response ?? c.json({ success: false, error: 'NOT_FOUND', message: 'File not found' }, 404)
    );
  }
);
