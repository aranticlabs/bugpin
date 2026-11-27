import { Hono } from 'hono';
import { projectsService } from '../../services/projects.service.js';
import { workspaceViewsService } from '../../services/workspace-views.service.js';
import { errorStatus } from '../../utils/http-status.js';
import { reporterPortalSettingsService } from '../../services/reporter-portal-settings.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, validatedBody, schemas } from '../../middleware/validate.js';

const projects = new Hono();

// All projects routes require authentication
projects.use('*', authMiddleware);

// List Projects (Admin only)

projects.get('/', authorize(['admin']), async (c) => {
  const result = await projectsService.list();

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    projects: result.value,
  });
});

// List project names for every role, without API keys or settings

projects.get('/summaries', authorize(['admin', 'editor', 'viewer']), async (c) => {
  const result = await projectsService.listSummaries({
    includeApiKeyPrefix: c.get('user').role === 'admin',
  });

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    projects: result.value,
  });
});

// The signed-in user's pinned projects (every role)

projects.get('/pinned', async (c) => {
  const result = await workspaceViewsService.listPinnedProjects(c.get('user').id);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, projects: result.value });
});

projects.put('/pinned/order', validate({ body: schemas.reorderProjects }), async (c) => {
  const body = await c.req.json();
  const result = await workspaceViewsService.reorderPinnedProjects(
    c.get('user').id,
    body.projectIds
  );
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true });
});

projects.put('/:id/pin', validate({ params: schemas.id }), async (c) => {
  const result = await workspaceViewsService.pinProject(c.get('user').id, c.req.param('id'));
  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }
  return c.json({ success: true });
});

projects.delete('/:id/pin', validate({ params: schemas.id }), async (c) => {
  await workspaceViewsService.unpinProject(c.get('user').id, c.req.param('id'));
  return c.json({ success: true });
});

// Get Project by ID (Admin only)

projects.get('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await projectsService.getById(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    project: result.value,
  });
});

// Create Project (Admin only)

projects.post('/', authorize(['admin']), validate({ body: schemas.createProject }), async (c) => {
  const body = await c.req.json();

  const result = await projectsService.create(body);

  if (!result.success) {
    return c.json(
      {
        success: false,
        error: result.code,
        message: result.error,
        ...(result.details ? { details: result.details } : {}),
      },
      result.code === 'PORTAL_PREREQUISITES_MISSING' ? 409 : 400
    );
  }

  return c.json(
    {
      success: true,
      project: result.value,
    },
    201
  );
});

// Update Project (Admin only)

projects.patch(
  '/:id',
  authorize(['admin']),
  validate({ params: schemas.id, body: schemas.updateProject }),
  async (c) => {
    const id = c.req.param('id');
    const body = validatedBody(c, schemas.updateProject);

    const result = await projectsService.update(id, body);

    if (!result.success) {
      const status =
        result.code === 'NOT_FOUND'
          ? 404
          : result.code === 'PORTAL_PREREQUISITES_MISSING'
            ? 409
            : 400;
      return c.json(
        {
          success: false,
          error: result.code,
          message: result.error,
          ...(result.details ? { details: result.details } : {}),
        },
        status
      );
    }

    return c.json({
      success: true,
      project: result.value,
    });
  }
);

projects.post(
  '/:id/reporter-portal/test-login',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const result = await reporterPortalSettingsService.testLogin(
      c.req.param('id'),
      c.get('user').email
    );
    if (!result.success)
      return c.json(
        {
          success: false,
          error: result.code,
          message: result.error,
          ...(result.details ? { details: result.details } : {}),
        },
        result.code === 'PORTAL_PREREQUISITES_MISSING' ? 409 : errorStatus(result.code)
      );
    return c.json({ success: true });
  }
);

// Delete Project (Admin only)

projects.delete('/:id', authorize(['admin']), validate({ params: schemas.id }), async (c) => {
  const id = c.req.param('id');

  const result = await projectsService.delete(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    message: 'Project deleted successfully',
  });
});

// Regenerate API Key (Admin only)

projects.post(
  '/:id/regenerate-key',
  authorize(['admin']),
  validate({ params: schemas.id }),
  async (c) => {
    const id = c.req.param('id');

    const result = await projectsService.regenerateApiKey(id);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      project: result.value,
    });
  }
);

// Reorder Projects (Admin only)

projects.put(
  '/reorder',
  authorize(['admin']),
  validate({ body: schemas.reorderProjects }),
  async (c) => {
    const body = await c.req.json();

    const result = await projectsService.reorder(body.projectIds);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      message: 'Projects reordered successfully',
    });
  }
);

export { projects as projectsRoutes };
