import type { MiddlewareHandler } from 'hono';
import { acquireUploadSlot } from '../utils/upload-concurrency.js';
import { rateLimiter } from './rate-limit.js';
import { settingsCacheService } from '../services/settings-cache.service.js';
import type { ReporterPortalLimits } from '@shared/types';

export function portalRateLimit(name: keyof ReporterPortalLimits, window: number) {
  return rateLimiter({
    name: `portal-${name}`,
    window,
    max: async () => (await settingsCacheService.getAll()).reporterPortalLimits[name],
    keyGenerator: (c) => c.get('reporter').id,
    onLimit: (c) =>
      c.json({ success: false, error: 'RATE_LIMITED', message: 'Too many requests' }, 429),
  });
}

export const limitPortalUploads: MiddlewareHandler = async (c, next) => {
  if (!c.req.header('content-type')?.includes('multipart/form-data')) return next();
  const release = acquireUploadSlot(c.get('reporter').id);
  if (!release) {
    return c.json(
      { success: false, error: 'RATE_LIMITED', message: 'Too many concurrent uploads' },
      429
    );
  }
  try {
    await next();
  } finally {
    release();
  }
};
