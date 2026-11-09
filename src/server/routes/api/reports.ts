import { Hono } from 'hono';
import { reportsService } from '../../services/reports.service.js';
import { workspaceViewsService } from '../../services/workspace-views.service.js';
import { syncQueueService } from '../../services/integrations/sync-queue.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { rateLimiter, userKeyGenerator } from '../../middleware/rate-limit.js';
import type { z } from 'zod';
import {
  ASSIGNED_TO_ME_FILTER,
  type ReportBoardMove,
  type ReportPriority,
  type ReportSortKey,
  type ReportStatus,
} from '@shared/types';
import { normalizeMimeType } from '@shared/mime';
import { createFileResponse } from '../../utils/range.js';

const reports = new Hono();

// All reports routes require authentication
reports.use('*', authMiddleware);

// List Reports

reports.get('/', validate({ query: schemas.reportFilter }), async (c) => {
  const query = c.req.query();

  const filter = {
    projectId: query.projectId,
    reporterId: query.reporterId,
    source: query.source as 'widget' | 'manual' | undefined,
    status: query.status?.split(',') as ReportStatus[],
    priority: query.priority?.split(',') as ReportPriority[],
    assignedTo: query.assignedTo === ASSIGNED_TO_ME_FILTER ? c.get('user').id : query.assignedTo,
    search: query.search,
    after: query.after,
    page: parseInt(query.page || '1'),
    limit: parseInt(query.limit || '20'),
    sortBy: (query.sortBy || 'createdAt') as ReportSortKey,
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

// Create Manual Report (Admin and Editor)

reports.post('/', authorize(['admin', 'editor']), async (c) => {
  const user = c.get('user');
  const contentType = c.req.header('content-type') ?? '';
  let body: Record<string, unknown> = {};
  let files: File[] = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody({ all: true });
    const dataField = formData.data;

    if (typeof dataField === 'string') {
      try {
        body = JSON.parse(dataField);
      } catch {
        return c.json(
          {
            success: false,
            error: 'INVALID_JSON',
            message: 'Invalid JSON in data field',
          },
          400
        );
      }
    } else {
      body = Object.fromEntries(
        Object.entries(formData).filter(
          ([key, value]) => key !== 'files' && !(value instanceof File)
        )
      );
    }

    const fileField = formData.files;
    if (Array.isArray(fileField)) {
      files = fileField.filter((file): file is File => file instanceof File);
    } else if (fileField instanceof File) {
      files = [fileField];
    }
  } else {
    body = await c.req.json().catch(() => ({}));
  }

  const validation = schemas.createManualReport.safeParse(body);
  if (!validation.success) {
    return c.json(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      },
      400
    );
  }

  const parsedFiles: Array<{ data: Buffer; filename: string; mimeType: string }> = [];
  for (const file of files) {
    try {
      parsedFiles.push({
        data: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        mimeType: normalizeMimeType(file.type),
      });
    } catch {
      return c.json(
        {
          success: false,
          error: 'FILE_READ_ERROR',
          message: `Failed to read uploaded file "${file.name}"`,
        },
        400
      );
    }
  }

  const result = await reportsService.createManual(
    {
      projectId: validation.data.projectId,
      title: validation.data.title,
      description: validation.data.description,
      priority: validation.data.priority,
      assignedTo:
        validation.data.assignedTo === undefined ? undefined : validation.data.assignedTo || null,
      reporterName: validation.data.reporterName || undefined,
      reporterEmail: validation.data.reporterEmail || undefined,
      url: validation.data.url || undefined,
      channel: validation.data.channel,
      files: parsedFiles,
    },
    user.id
  );

  if (!result.success) {
    const status =
      result.code === 'PROJECT_NOT_FOUND' ? 404 : result.code === 'PROJECT_INACTIVE' ? 400 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json(
    {
      success: true,
      report: result.value,
    },
    201
  );
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

// Counts for the sidebar report views of the signed-in user

reports.get('/views/counts', async (c) => {
  const result = await workspaceViewsService.getViewCounts(c.get('user').id);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, counts: result.value });
});

// Reports the signed-in user opened recently

reports.get('/recent', async (c) => {
  const limit = parseInt(c.req.query('limit') || '3') || 3;
  const result = await workspaceViewsService.listRecentReports(c.get('user').id, limit);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, reports: result.value });
});

reports.post('/:id/views', validate({ params: schemas.id }), async (c) => {
  const result = await workspaceViewsService.recordReportView(c.get('user').id, c.req.param('id'));
  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }
  return c.json({ success: true });
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
    const body = c.get('validatedBody' as never) as {
      title?: string;
      description?: string;
      status?: 'open' | 'in_progress' | 'resolved' | 'closed';
      priority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
      assignedTo?: string | null;
    };

    const result = await reportsService.update(id, body, user.id);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      report: result.value,
    });
  }
);

// Move Reports on the Board (Admin and Editor)

const boardMoveRateLimit = rateLimiter({
  name: 'report-board-move',
  max: 120,
  window: 60,
  keyGenerator: userKeyGenerator,
});

function boardMoveFor(
  body: z.infer<typeof schemas.moveReportOnBoard>,
  userId: string
): ReportBoardMove {
  const { status, previousId, nextId, adoptSort } = body;
  const scope = adoptSort?.scope;
  return {
    status,
    previousId,
    nextId,
    adoptSort: adoptSort && {
      ...adoptSort,
      scope: scope && {
        ...scope,
        assignedTo: scope.assignedTo === ASSIGNED_TO_ME_FILTER ? userId : scope.assignedTo,
      },
    },
  };
}

function boardMoveErrorStatus(code: string | undefined): 404 | 500 | 400 {
  return code === 'NOT_FOUND' ? 404 : code === 'UPDATE_FAILED' ? 500 : 400;
}

reports.post(
  '/bulk-board-position',
  authorize(['admin', 'editor']),
  boardMoveRateLimit,
  validate({ body: schemas.moveReportsOnBoard }),
  async (c) => {
    const body = c.get('validatedBody' as never) as z.infer<typeof schemas.moveReportsOnBoard>;
    const user = c.get('user');

    const result = await reportsService.moveManyOnBoard(
      body.ids,
      boardMoveFor(body, user.id),
      user.id
    );

    if (!result.success) {
      return c.json(
        { success: false, error: result.code, message: result.error },
        boardMoveErrorStatus(result.code)
      );
    }

    return c.json({ success: true, reports: result.value });
  }
);

reports.patch(
  '/:id/board-position',
  authorize(['admin', 'editor']),
  boardMoveRateLimit,
  validate({ params: schemas.id, body: schemas.moveReportOnBoard }),
  async (c) => {
    const body = c.get('validatedBody' as never) as z.infer<typeof schemas.moveReportOnBoard>;
    const user = c.get('user');

    const result = await reportsService.moveOnBoard(
      c.req.param('id'),
      boardMoveFor(body, user.id),
      user.id
    );

    if (!result.success) {
      return c.json(
        { success: false, error: result.code, message: result.error },
        boardMoveErrorStatus(result.code)
      );
    }

    return c.json({ success: true, report: result.value });
  }
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
    const user = c.get('user');
    const { ids, updates } = await c.req.json();

    const result = await reportsService.bulkUpdate(ids, updates, user.id);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      updated: result.value,
    });
  }
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
  }
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

  const result = await reportsService.serveFile(c.req.param('reportId'), fileId);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 404);
  }

  const { file, handle } = result.value;
  const response = await createFileResponse({
    handle,
    rangeHeader: c.req.header('range'),
    size: file.sizeBytes,
    mimeType: file.mimeType,
    cacheControl: 'private, no-store',
    filename: file.filename,
    headOnly: c.req.method === 'HEAD',
  });

  return response ?? c.json({ success: false, error: 'NOT_FOUND', message: 'File not found' }, 404);
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
  }
);

export { reports as reportsRoutes };
