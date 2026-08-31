import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { updateCheckService } from '../../services/update-check.service.js';
import { widgetPackageCompatibilityService } from '../../services/widget-package-compatibility.service.js';

const version = new Hono();

version.use('*', authMiddleware);

version.get('/', authorize(['admin']), async (c) => {
  const [result, widgetPackageResult] = await Promise.all([
    updateCheckService.getStatus(),
    widgetPackageCompatibilityService.getStatus(),
  ]);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 500);
  }
  if (!widgetPackageResult.success) {
    return c.json(
      {
        success: false,
        error: widgetPackageResult.code,
        message: widgetPackageResult.error,
      },
      500
    );
  }

  const status = result.value;
  return c.json({
    success: true,
    current: status.current,
    latest: status.latest,
    updateAvailable: status.updateAvailable,
    releaseUrl: status.releaseUrl,
    publishedAt: status.publishedAt,
    lastCheckedAt: status.lastCheckedAt,
    checkEnabled: status.checkEnabled,
    widgetPackage: widgetPackageResult.value,
  });
});

export { version as versionRoutes };
