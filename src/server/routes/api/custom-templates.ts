import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { requireEEFeature } from '../../utils/ee.js';

const app = new Hono();

// All routes require authentication, admin role, and the custom-templates EE feature
app.use('*', authMiddleware);
app.use('*', authorize(['admin']));
app.use('*', requireEEFeature('custom-templates'));

/**
 * GET /api/templates - List all custom email templates
 * This route requires EE license with custom-templates feature
 */
app.get('/', async (c) => {
  // This handler is never reached if EE is not available
  // The requireEEFeature middleware returns 402
  return c.json({ success: true, templates: [] });
});

/**
 * GET /api/templates/:type - Get a specific template
 */
app.get('/:type', async (c) => {
  return c.json({ success: true, template: null });
});

/**
 * PUT /api/templates/:type - Update a template
 */
app.put('/:type', async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/templates/:type/preview - Preview a template
 */
app.post('/:type/preview', async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/templates/:type/reset - Reset template to default
 */
app.post('/:type/reset', async (c) => {
  return c.json({ success: true });
});

export const customTemplatesRoutes = app;
