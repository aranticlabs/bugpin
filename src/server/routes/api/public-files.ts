import { Hono } from 'hono';
import { publicFilesService } from '../../services/public-files.service.js';
import { logger } from '../../utils/logger.js';
import { createFileResponse } from '../../utils/range.js';

export const publicFilesRoutes = new Hono();

/**
 * GET /api/public/files/:reportId/:filename
 * Public endpoint to access screenshots and attachments for external integrations like GitHub
 */
publicFilesRoutes.get('/:reportId/:filename', async (c) => {
  const { reportId, filename } = c.req.param();

  try {
    const result = await publicFilesService.get(reportId, filename);
    if (!result.success) {
      logger.warn('File not found', { reportId, filename });
      return c.json({ error: 'File not found' }, 404);
    }

    const { file, handle } = result.value;
    const response = await createFileResponse({
      handle,
      rangeHeader: c.req.header('range'),
      size: file.sizeBytes,
      mimeType: file.mimeType,
      cacheControl:
        file.type === 'video' || file.mimeType.startsWith('video/')
          ? 'private, max-age=300'
          : 'public, max-age=86400',
      filename: file.filename,
      headOnly: c.req.method === 'HEAD',
    });

    if (!response) {
      logger.error('Failed to read file from storage', {
        reportId,
        filename,
        path: file.path,
      });
      return c.json({ error: 'File not found' }, 404);
    }

    return response;
  } catch (error) {
    logger.error('Error serving public file', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
