import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { brandingService } from '../../services/branding.service.js';
import { requireEEFeature } from '../../utils/ee.js';

const app = new Hono();

// All admin branding modification routes require 'custom-branding' EE feature
// These routes are stubs that return 402 when EE is not available
// When EE is available, EE routes handle these endpoints instead
const requireBranding = requireEEFeature('custom-branding');

/**
 * GET /api/branding/config - Get branding configuration (public)
 * This is a CE route - no EE license required
 */
app.get('/config', async (c) => {
  try {
    const result = await brandingService.getBrandingConfig();

    if (!result.success) {
      return c.json({ success: false, error: result.error, message: result.error }, 500);
    }

    return c.json({ success: true, config: result.value });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'GET_FAILED',
        message: 'Failed to get branding config',
      },
      500,
    );
  }
});

/**
 * PUT /api/branding/widget-primary-colors - Update widget primary colors (admin only)
 * This is a CE feature - no EE license required
 */
app.put('/widget-primary-colors', authMiddleware, authorize(['admin']), async (c) => {
  try {
    const colors = await c.req.json();

    const result = await brandingService.updateWidgetPrimaryColors(colors);

    if (!result.success) {
      return c.json({ success: false, error: result.error, message: result.error }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'UPDATE_FAILED',
        message: 'Failed to update widget primary colors',
      },
      500,
    );
  }
});

// ============================================================================
// Admin Branding Routes (EE Feature)
// These are stub routes that return 402 when EE is not available.
// When EE is available, EE routes are mounted first and handle these endpoints.
// ============================================================================

/**
 * POST /api/branding/logo/:mode - Upload logo (admin only, EE required)
 */
app.post('/logo/:mode', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  // This handler is never reached - requireBranding returns 402
  return c.json({ success: true });
});

/**
 * POST /api/branding/favicon/:mode - Upload favicon (admin only, EE required)
 */
app.post('/favicon/:mode', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/branding/icon/:mode - Upload icon (admin only, EE required)
 */
app.post('/icon/:mode', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * PUT /api/branding/primary-color - Update primary color (admin only, EE required)
 */
app.put('/primary-color', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * PUT /api/branding/admin-theme-colors - Update admin theme colors (admin only, EE required)
 */
app.put('/admin-theme-colors', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * DELETE /api/branding/logo/:mode - Reset logo to default (admin only, EE required)
 */
app.delete('/logo/:mode', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * DELETE /api/branding/icon/:mode - Reset icon to default (admin only, EE required)
 */
app.delete('/icon/:mode', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * DELETE /api/branding/favicon/:mode - Reset favicon to default (admin only, EE required)
 */
app.delete('/favicon/:mode', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/branding/reset - Reset all branding to defaults (admin only, EE required)
 */
app.post('/reset', authMiddleware, authorize(['admin']), requireBranding, async (c) => {
  return c.json({ success: true });
});

export default app;
