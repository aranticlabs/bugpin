import { Hono } from 'hono';
import { createStoredFileHandle } from '../../storage/files.js';
import { filesRepo } from '../../database/repositories/files.repo.js';
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
    // Find all files for the report
    const files = await filesRepo.findByReportId(reportId);
    const fileRecord = files.find((f) => f.filename === filename);

    if (!fileRecord) {
      logger.warn('File not found', { reportId, filename });
      return c.json({ error: 'File not found' }, 404);
    }

    // Only allow screenshots and attachments (not avatars or branding)
    if (fileRecord.type !== 'screenshot' && fileRecord.type !== 'attachment') {
      return c.json({ error: 'File type not accessible publicly' }, 403);
    }

    const response = await createFileResponse({
      handle: createStoredFileHandle(fileRecord.path),
      rangeHeader: c.req.header('range'),
      size: fileRecord.sizeBytes,
      mimeType: fileRecord.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    });

    if (!response) {
      logger.error('Failed to read file from storage', {
        reportId,
        filename,
        path: fileRecord.path,
      });
      return c.json({ error: 'File not found in storage' }, 404);
    }

    return response;
  } catch (error) {
    logger.error('Error serving public file', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
