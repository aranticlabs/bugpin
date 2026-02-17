import { Hono } from 'hono';
import { projectsService } from '../../services/projects.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';

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
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json(
    {
      success: true,
      project: result.value.project,
      apiKey: result.value.apiKey, // Full API key, only available on create
      showApiKeyOnce: true, // Flag for UI to show the "save your key" modal
    },
    201,
  );
});

// Update Project (Admin only)

projects.patch(
  '/:id',
  authorize(['admin']),
  validate({ params: schemas.id, body: schemas.updateProject }),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const result = await projectsService.update(id, body);

    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      project: result.value,
    });
  },
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
      apiKey: result.value, // Full API key, only available on regenerate
      showApiKeyOnce: true, // Flag for UI to show the "save your key" modal
    });
  },
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
  },
);

export { projects as projectsRoutes };
