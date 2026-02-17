import { Hono } from 'hono';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { requireEEFeature } from '../../utils/ee.js';

const storage = new Hono();

// All routes require authentication
storage.use('*', authMiddleware);

// All S3 storage routes require 's3-storage' EE feature
const requireS3Storage = requireEEFeature('s3-storage');

/**
 * CE S3 Storage Routes (Stubs)
 *
 * These routes are stubs that return 402 when EE is not available.
 * When EE is available, EE routes are mounted first and handle these endpoints.
 *
 * Actual S3 functionality is implemented in:
 * - ee/src/features/s3-storage/s3.service.ts
 * - ee/src/features/s3-storage/migration.service.ts
 * - ee/src/features/s3-storage/storage.routes.ts
 */

/**
 * GET /api/storage/stats - Get storage statistics (EE required)
 */
storage.get('/stats', authorize(['admin']), requireS3Storage, async (c) => {
  // This handler is never reached - requireS3Storage returns 402
  return c.json({ success: true });
});

/**
 * GET /api/storage/migration/status - Get migration status (EE required)
 */
storage.get('/migration/status', authorize(['admin']), requireS3Storage, async (c) => {
  return c.json({ success: true });
});

/**
 * GET /api/storage/migration/stream - Stream migration progress (EE required)
 */
storage.get('/migration/stream', authorize(['admin']), requireS3Storage, async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/storage/migrate - Start migration (EE required)
 */
storage.post('/migrate', authorize(['admin']), requireS3Storage, async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/storage/migrate/cancel - Cancel migration (EE required)
 */
storage.post('/migrate/cancel', authorize(['admin']), requireS3Storage, async (c) => {
  return c.json({ success: true });
});

/**
 * POST /api/storage/s3/test - Test S3 connection (EE required)
 */
storage.post('/s3/test', authorize(['admin']), requireS3Storage, async (c) => {
  return c.json({ success: true });
});

export { storage as storageRoutes };
