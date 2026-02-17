import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.js';
import { requireEEFeature } from '../../utils/ee.js';

const app = new Hono();

// All routes require authentication and the api-access EE feature
app.use('*', authMiddleware);
app.use('*', requireEEFeature('api-access'));

/**
 * CE API Tokens Routes (Stubs)
 *
 * These routes are stubs that return 402 when EE is not available.
 * When EE is available, EE routes are mounted first and handle these endpoints.
 *
 * Actual API token functionality is implemented in:
 * - ee/src/features/api-access/api-tokens.service.ts
 * - ee/src/features/api-access/api-tokens.routes.ts
 */

/**
 * GET /api/tokens - List all API tokens (EE required)
 */
app.get('/', async (c) => {
  // This handler is never reached - requireEEFeature returns 402
  return c.json({ success: true, tokens: [] });
});

/**
 * POST /api/tokens - Create a new API token (EE required)
 */
app.post('/', async (c) => {
  return c.json({ success: true });
});

/**
 * GET /api/tokens/:id - Get a specific token (EE required)
 */
app.get('/:id', async (c) => {
  return c.json({ success: true });
});

/**
 * DELETE /api/tokens/:id - Revoke a token (EE required)
 */
app.delete('/:id', async (c) => {
  return c.json({ success: true });
});

/**
 * DELETE /api/tokens - Revoke all tokens (EE required)
 */
app.delete('/', async (c) => {
  return c.json({ success: true });
});

export const apiTokensRoutes = app;
