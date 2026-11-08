import type { Context, MiddlewareHandler } from 'hono';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { getEffectiveOrigin } from '../utils/client-ip.js';

export async function portalOrigin(c: Context): Promise<string | null> {
  const settings = await settingsCacheService.getAll();
  const configured = settings.portalBaseUrl || settings.appUrl;
  if (!configured) return getEffectiveOrigin(c);
  try {
    const url = new URL(configured);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export const portalOriginCheck: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const expected = await portalOrigin(c);
  const fetchSite = c.req.header('Sec-Fetch-Site');
  if (
    !expected ||
    c.req.header('Origin') !== expected ||
    (fetchSite !== undefined && fetchSite !== 'same-origin') ||
    c.req.header('X-BugPin-Portal') !== '1'
  ) {
    return c.json(
      { success: false, error: 'ORIGIN_REJECTED', message: 'Request origin rejected' },
      403
    );
  }
  return next();
};
