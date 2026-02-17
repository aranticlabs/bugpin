import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { requireEEFeature } from '../../utils/ee.js';

const webhooks = new Hono();

// All webhook routes require authentication, admin role, and webhooks EE feature
webhooks.use('*', authMiddleware);
webhooks.use('*', authorize(['admin']));
webhooks.use('*', requireEEFeature('webhooks'));

/**
 * CE Webhooks Routes (Stubs)
 *
 * These routes are stubs that return 402 when EE is not available.
 * When EE is available, EE routes are mounted first and handle these endpoints.
 *
 * Actual webhook functionality is implemented in:
 * - ee/src/features/webhooks/webhooks.service.ts
 * - ee/src/features/webhooks/webhooks.routes.ts
 */

/**
 * GET /api/webhooks - List webhooks (EE required)
 */
webhooks.get('/', async (c) => {
  // This handler is never reached - requireEEFeature returns 402
  return c.json({ success: true, webhooks: [] });
});

/**
 * GET /api/webhooks/:id - Get webhook by ID (EE required)
 */
webhooks.get('/:id', async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/webhooks - Create webhook (EE required)
 */
webhooks.post('/', async (c) => {
  return c.json({ success: true });
});

/**
 * PATCH /api/webhooks/:id - Update webhook (EE required)
 */
webhooks.patch('/:id', async (c) => {
  return c.json({ success: true });
});

/**
 * DELETE /api/webhooks/:id - Delete webhook (EE required)
 */
webhooks.delete('/:id', async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/webhooks/:id/test - Test webhook (EE required)
 */
webhooks.post('/:id/test', async (c) => {
  return c.json({ success: true });
});

export { webhooks as webhooksRoutes };
