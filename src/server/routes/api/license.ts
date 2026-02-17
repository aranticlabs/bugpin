import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import {
  getLicenseStatus,
  isEEAvailable,
  hasEEFeature,
  getEELicenseService,
} from '../../utils/ee.js';

const app = new Hono();

/**
 * GET /api/license/status - Get license status (authenticated users only)
 */
app.get('/status', authMiddleware, async (c) => {
  const status = getLicenseStatus();
  return c.json(status);
});

/**
 * GET /api/license/features - Check which EE features are available
 */
app.get('/features', authMiddleware, async (c) => {
  const features = [
    'custom-branding',
    'sso',
    'audit-log',
    'api-access',
    'webhooks',
    'white-label',
    'email-templates',
    's3-storage',
  ];

  const featureStatus = features.reduce(
    (acc, feature) => {
      acc[feature] = hasEEFeature(feature);
      return acc;
    },
    {} as Record<string, boolean>,
  );

  return c.json({
    eeAvailable: isEEAvailable(),
    features: featureStatus,
  });
});

/**
 * GET /api/license/feature/:feature - Check if a specific feature is available
 */
app.get('/feature/:feature', authMiddleware, async (c) => {
  const feature = c.req.param('feature');
  const available = hasEEFeature(feature);

  return c.json({
    feature,
    available,
    eeAvailable: isEEAvailable(),
  });
});

/**
 * POST /api/license/activate - Activate a license key (admin only)
 */
app.post('/activate', authMiddleware, authorize(['admin']), async (c) => {
  const licenseService = getEELicenseService();

  if (!licenseService) {
    return c.json(
      {
        success: false,
        error: 'EE_NOT_AVAILABLE',
        message: 'Enterprise Edition is not installed',
      },
      400,
    );
  }

  try {
    const body = await c.req.json();
    const { licenseKey } = body;

    if (!licenseKey || typeof licenseKey !== 'string') {
      return c.json(
        {
          success: false,
          error: 'INVALID_INPUT',
          message: 'License key is required',
        },
        400,
      );
    }

    const result = await licenseService.validateAndStore(licenseKey);

    if (!result.valid) {
      return c.json(
        {
          success: false,
          error: 'INVALID_LICENSE',
          message: result.error || 'Invalid license key',
        },
        400,
      );
    }

    return c.json({ success: true, license: result.license });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'ACTIVATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to activate license',
      },
      500,
    );
  }
});

/**
 * DELETE /api/license - Remove the current license (admin only)
 */
app.delete('/', authMiddleware, authorize(['admin']), async (c) => {
  const licenseService = getEELicenseService();

  if (!licenseService) {
    return c.json(
      {
        success: false,
        error: 'EE_NOT_AVAILABLE',
        message: 'Enterprise Edition is not installed',
      },
      400,
    );
  }

  try {
    await licenseService.removeLicense();
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'REMOVE_FAILED',
        message: 'Failed to remove license',
      },
      500,
    );
  }
});

export default app;
