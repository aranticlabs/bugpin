import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { requireEEFeature } from '../../utils/ee.js';

const app = new Hono();

// All routes require authentication, admin role, and the white-label EE feature
app.use('*', authMiddleware);
app.use('*', authorize(['admin']));
app.use('*', requireEEFeature('white-label'));

/**
 * GET /api/white-label/config - Get white-label configuration
 * This route requires EE license with white-label feature
 */
app.get('/config', async (c) => {
  // This handler is never reached if EE is not available
  // The requireEEFeature middleware returns 402
  return c.json({
    success: true,
    config: {
      enabled: false,
      hideFooterBranding: false,
      hideEmailBranding: false,
      hidePoweredBy: false,
    },
  });
});

/**
 * PUT /api/white-label/config - Update white-label configuration
 */
app.put('/config', async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/white-label/reset - Reset white-label configuration
 */
app.post('/reset', async (c) => {
  return c.json({ success: true });
});

export const whiteLabelRoutes = app;
