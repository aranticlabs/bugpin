import { isIP } from 'node:net';
import type { MiddlewareHandler } from 'hono';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { getEffectiveOrigin } from '../utils/client-ip.js';

declare module 'hono' {
  interface ContextVariableMap {
    portalHost: boolean;
  }
}

export const hostRouting: MiddlewareHandler = async (c, next) => {
  const { appUrl, portalBaseUrl } = await settingsCacheService.getAll();
  if (!portalBaseUrl) return next();

  const origin = getEffectiveOrigin(c);
  const host = origin ? new URL(origin).host : null;
  const staffHost = appUrl ? new URL(appUrl).host : null;
  const portalHost = new URL(portalBaseUrl).host;
  const path = c.req.path;
  if (!host || (host !== staffHost && host !== portalHost)) {
    const hostname = origin ? new URL(origin).hostname.replace(/^\[|\]$/g, '') : '';
    const loopback =
      hostname === 'localhost' ||
      hostname === '::1' ||
      (isIP(hostname) === 4 && hostname.startsWith('127.'));
    if (loopback) return next();
    return c.json({ success: false, error: 'MISDIRECTED_REQUEST', message: 'Unknown host' }, 421);
  }

  const shared = path.startsWith('/branding/') || path === '/api/portal/config';
  const portal =
    path === '/reporter-portal' ||
    path.startsWith('/reporter-portal/') ||
    path === '/api/portal' ||
    path.startsWith('/api/portal/');
  if (
    !shared &&
    ((host === staffHost && portal) || (host === portalHost && !portal && path !== '/'))
  ) {
    return c.json({ success: false, error: 'NOT_FOUND', message: 'Not found' }, 404);
  }
  c.set('portalHost', host === portalHost);
  return next();
};
