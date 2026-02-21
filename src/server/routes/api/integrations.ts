import { Hono } from 'hono';
import { integrationsService } from '../../services/integrations.service.js';
import { githubService } from '../../services/integrations/github.service.js';
import { githubSyncService } from '../../services/integrations/github-sync.service.js';
import { syncQueueService } from '../../services/integrations/sync-queue.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { integrationsRepo } from '../../database/repositories/integrations.repo.js';
import type { GitHubIntegrationConfig } from '@shared/types';

const integrations = new Hono();

// All integrations routes require authentication
integrations.use('*', authMiddleware);

// List Integrations (Admin only)

integrations.get(
  '/',
  authorize(['admin']),
  validate({ query: schemas.integrationQuery }),
  async (c) => {
    const query = c.req.query();
    const projectId = query.projectId;

    if (!projectId) {
      return c.json(
        { success: false, error: 'MISSING_PROJECT_ID', message: 'Project ID is required' },
        400,
      );
    }

    const result = await integrationsService.listByProject(projectId);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      data: result.value,
    });
  },
);

// Get Integration by ID (Admin only)

integrations.get('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await integrationsService.getById(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    integration: result.value,
  });
});

// Create Integration (Admin only)

integrations.post(
  '/',
  authorize(['admin']),
  validate({ body: schemas.createIntegration }),
  async (c) => {
    const body = await c.req.json();

    const result = await integrationsService.create(body);

    if (!result.success) {
      const status = result.code === 'PROJECT_NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json(
      {
        success: true,
        integration: result.value,
      },
      201,
    );
  },
);

// Update Integration (Admin only)

integrations.patch(
  '/:id',
  authorize(['admin']),
  validate({ params: schemas.id, body: schemas.updateIntegration }),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const result = await integrationsService.update(id, body);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      integration: result.value,
    });
  },
);

// Delete Integration (Admin only)

integrations.delete('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await integrationsService.delete(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
  });
});

// Test Integration Connection (Admin only)

integrations.post(
  '/:id/test',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const id = c.req.param('id');

    const result = await integrationsService.testConnection(id);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      result: result.value,
    });
  },
);

// Fetch GitHub Repositories (Admin only)
// This endpoint accepts a token and returns available repositories

integrations.post('/github/repositories', authorize(['admin']), async (c) => {
  const body = (await c.req.json()) as { accessToken?: string };

  if (!body.accessToken || !body.accessToken.trim()) {
    return c.json(
      { success: false, error: 'MISSING_TOKEN', message: 'Access token is required' },
      400,
    );
  }

  const result = await githubService.fetchRepositories(body.accessToken);

  if (!result.success) {
    return c.json({ success: false, error: 'FETCH_FAILED', message: result.error }, 400);
  }

  return c.json({
    success: true,
    repositories: result.repositories,
  });
});

// Fetch GitHub Labels for a repository (Admin only)

integrations.post('/github/labels', authorize(['admin']), async (c) => {
  const body = (await c.req.json()) as {
    accessToken?: string;
    owner?: string;
    repo?: string;
    integrationId?: string;
  };

  // Resolve access token: use provided token, or look up from existing integration
  let accessToken = body.accessToken;
  let owner = body.owner;
  let repo = body.repo;

  if (!accessToken && body.integrationId) {
    const integration = await integrationsRepo.findById(body.integrationId);
    if (integration) {
      const config = integration.config as GitHubIntegrationConfig;
      accessToken = config.accessToken;
      owner = owner || config.owner;
      repo = repo || config.repo;
    }
  }

  if (!accessToken || !owner || !repo) {
    return c.json(
      {
        success: false,
        error: 'MISSING_PARAMS',
        message: 'Access token, owner, and repo are required',
      },
      400,
    );
  }

  const result = await githubService.fetchLabels(accessToken, owner, repo);

  if (!result.success) {
    return c.json({ success: false, error: 'FETCH_FAILED', message: result.error }, 400);
  }

  return c.json({
    success: true,
    labels: result.labels,
  });
});

// Fetch GitHub Assignees for a repository (Admin only)

integrations.post('/github/assignees', authorize(['admin']), async (c) => {
  const body = (await c.req.json()) as {
    accessToken?: string;
    owner?: string;
    repo?: string;
    integrationId?: string;
  };

  // Resolve access token: use provided token, or look up from existing integration
  let accessToken = body.accessToken;
  let owner = body.owner;
  let repo = body.repo;

  if (!accessToken && body.integrationId) {
    const integration = await integrationsRepo.findById(body.integrationId);
    if (integration) {
      const config = integration.config as GitHubIntegrationConfig;
      accessToken = config.accessToken;
      owner = owner || config.owner;
      repo = repo || config.repo;
    }
  }

  if (!accessToken || !owner || !repo) {
    return c.json(
      {
        success: false,
        error: 'MISSING_PARAMS',
        message: 'Access token, owner, and repo are required',
      },
      400,
    );
  }

  const result = await githubService.fetchAssignees(accessToken, owner, repo);

  if (!result.success) {
    return c.json({ success: false, error: 'FETCH_FAILED', message: result.error }, 400);
  }

  return c.json({
    success: true,
    assignees: result.assignees,
  });
});

// =============================================================================
// GitHub Sync Endpoints
// =============================================================================

// Set sync mode for an integration (Admin only)

integrations.post(
  '/:id/sync-mode',
  authorize(['admin']),
  validate({ params: schemas.id, body: schemas.setSyncMode }),
  async (c) => {
    const id = c.req.param('id');
    const body = c.get('validatedBody' as never) as { syncMode: 'manual' | 'automatic' };

    // Get integration to check type
    const integration = await integrationsRepo.findById(id);
    if (!integration) {
      return c.json({ success: false, error: 'NOT_FOUND', message: 'Integration not found' }, 404);
    }

    if (integration.type !== 'github') {
      return c.json(
        {
          success: false,
          error: 'INVALID_TYPE',
          message: 'Only GitHub integrations support sync modes',
        },
        400,
      );
    }

    const currentConfig = integration.config as GitHubIntegrationConfig;
    const currentMode = currentConfig.syncMode || 'manual';

    // Check if mode is actually changing
    if (currentMode === body.syncMode) {
      return c.json({
        success: true,
        message: `Sync mode is already ${body.syncMode}`,
        syncMode: body.syncMode,
      });
    }

    let result;
    if (body.syncMode === 'automatic') {
      result = await githubSyncService.enableAutoSync(id);
    } else {
      result = await githubSyncService.disableAutoSync(id);
    }

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    // Get count of unsynced reports if enabling automatic sync
    let unsyncedCount = 0;
    if (body.syncMode === 'automatic') {
      unsyncedCount = await githubSyncService.getUnsyncedCount(integration.projectId);
    }

    return c.json({
      success: true,
      syncMode: body.syncMode,
      unsyncedCount,
    });
  },
);

// Sync existing reports (Admin only)

integrations.post(
  '/:id/sync-existing',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { reportIds?: string[] | 'all' };

    // Get integration
    const integration = await integrationsRepo.findById(id);
    if (!integration) {
      return c.json({ success: false, error: 'NOT_FOUND', message: 'Integration not found' }, 404);
    }

    if (integration.type !== 'github') {
      return c.json(
        {
          success: false,
          error: 'INVALID_TYPE',
          message: 'Only GitHub integrations support syncing',
        },
        400,
      );
    }

    let reportIds: string[];

    if (body.reportIds === 'all') {
      // Get all unsynced report IDs
      reportIds = await githubSyncService.getUnsyncedReportIds(integration.projectId);
    } else if (Array.isArray(body.reportIds)) {
      reportIds = body.reportIds;
    } else {
      return c.json(
        { success: false, error: 'INVALID_PARAMS', message: 'reportIds must be an array or "all"' },
        400,
      );
    }

    if (reportIds.length === 0) {
      return c.json({
        success: true,
        message: 'No reports to sync',
        queued: 0,
      });
    }

    // Queue reports for sync
    for (const reportId of reportIds) {
      await syncQueueService.enqueue(reportId, id);
    }

    return c.json({
      success: true,
      message: `Queued ${reportIds.length} reports for sync`,
      queued: reportIds.length,
    });
  },
);

// Get sync status for an integration (Admin only)

integrations.get(
  '/:id/sync-status',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const id = c.req.param('id');

    // Get integration
    const integration = await integrationsRepo.findById(id);
    if (!integration) {
      return c.json({ success: false, error: 'NOT_FOUND', message: 'Integration not found' }, 404);
    }

    if (integration.type !== 'github') {
      return c.json(
        {
          success: false,
          error: 'INVALID_TYPE',
          message: 'Only GitHub integrations support sync status',
        },
        400,
      );
    }

    const config = integration.config as GitHubIntegrationConfig;
    const unsyncedCount = await githubSyncService.getUnsyncedCount(integration.projectId);
    const queueStatus = syncQueueService.getStatus();

    return c.json({
      success: true,
      syncMode: config.syncMode || 'manual',
      unsyncedCount,
      queueLength: queueStatus.queueLength,
      processing: queueStatus.processing,
    });
  },
);

export { integrations as integrationsRoutes };
