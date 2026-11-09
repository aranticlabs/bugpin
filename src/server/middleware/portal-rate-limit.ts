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
