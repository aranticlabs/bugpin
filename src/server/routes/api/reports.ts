import { Hono } from 'hono';
import { reportsService } from '../../services/reports.service.js';
import { syncQueueService } from '../../services/integrations/sync-queue.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import type { ReportStatus, ReportPriority } from '@shared/types';

const reports = new Hono();

// All reports routes require authentication
reports.use('*', authMiddleware);

// List Reports

reports.get('/', validate({ query: schemas.reportFilter }), async (c) => {
  const query = c.req.query();

  const filter = {
    projectId: query.projectId,
    status: query.status?.split(',') as ReportStatus[],
    priority: query.priority?.split(',') as ReportPriority[],
    assignedTo: query.assignedTo,
    search: query.search,
    page: parseInt(query.page || '1'),
    limit: parseInt(query.limit || '20'),
    sortBy: query.sortBy || 'createdAt',
    sortOrder: (query.sortOrder || 'desc') as 'asc' | 'desc',
  };

  const result = await reportsService.list(filter);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    ...result.value,
  });
});

// Get Report Statistics (must be before /:id to avoid matching "stats" as an ID)

reports.get('/stats/overview', async (c) => {
  const projectId = c.req.query('projectId');

  const result = await reportsService.getStats(projectId);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    stats: result.value,
  });
});

// Get Report by ID

reports.get('/:id', validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await reportsService.getByIdWithFiles(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    report: result.value.report,
    files: result.value.files,
  });
});

// Update Report (Admin and Editor)

reports.patch(
  '/:id',
  authorize(['admin', 'editor']),
  validate({ params: schemas.id, body: schemas.updateReport }),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();

    const result = await reportsService.update(id, body, user.id);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      report: result.value,
    });
  },
);

// Delete Report (Admin only)

reports.delete('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await reportsService.delete(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    message: 'Report deleted successfully',
  });
});

// Bulk Update Reports (Admin and Editor)

reports.post(
  '/bulk-update',
  authorize(['admin', 'editor']),
  validate({ body: schemas.bulkUpdateReports }),
  async (c) => {
    const { ids, updates } = await c.req.json();

    const result = await reportsService.bulkUpdate(ids, updates);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      updated: result.value,
    });
  },
);

// Forward Report to Integration (Admin only)

reports.post(
  '/:reportId/forward/:integrationId',
  authorize(['admin']),
  validate({ body: schemas.forwardReport }),
  async (c) => {
    const reportId = c.req.param('reportId');
    const integrationId = c.req.param('integrationId');
    const body = await c.req.json().catch(() => ({}));

    // Import integrations service
    const { integrationsService } = await import('../../services/integrations.service.js');

    const result = await integrationsService.forwardReport(reportId, integrationId, body);

    if (!result.success) {
      if (result.code === 'INTEGRATION_NOT_FOUND' || result.code === 'REPORT_NOT_FOUND') {
        return c.json({ success: false, error: result.code, message: result.error }, 404);
      }
      if (result.code === 'PROJECT_MISMATCH') {
        return c.json({ success: false, error: result.code, message: result.error }, 403);
      }
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      result: result.value,
    });
  },
);

// Get Report Files

reports.get('/:id/files', validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await reportsService.getReportFiles(id);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 500);
  }

  return c.json({
    success: true,
    files: result.value,
  });
});

// Serve File

reports.get('/:reportId/files/:fileId', async (c) => {
  const fileId = c.req.param('fileId');

  const result = await reportsService.serveFile(fileId);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 404);
  }

  const { file, data } = result.value;

  return new Response(data, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': file.sizeBytes.toString(),
      'Cache-Control': 'private, max-age=86400', // 24 hours
    },
  });
});

// Retry GitHub Sync (Admin only)

reports.post(
  '/:id/retry-sync',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const id = c.req.param('id');

    const result = await syncQueueService.retrySyncForReport(id);

    if (!result.success) {
      const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, statusCode);
    }

    return c.json({
      success: true,
      message: 'Report queued for sync',
    });
  },
);

export { reports as reportsRoutes };
