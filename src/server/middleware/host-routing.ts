import type { MiddlewareHandler } from 'hono';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { getEffectiveOrigin, getSocketAddress, isLoopbackAddress } from '../utils/client-ip.js';
import type { AppSettings } from '@shared/types';

declare module 'hono' {
  interface ContextVariableMap {
    portalHost: boolean;
  }
}

export type HostRoutingDecision =
  { status: 204; portalHost?: boolean } | { status: 404 } | { status: 421 };

export function decideHostRouting(
  origin: string | null,
  path: string,
  { appUrl, portalBaseUrl }: Pick<AppSettings, 'appUrl' | 'portalBaseUrl'>,
  socketAddress?: string
): HostRoutingDecision {
  if (!portalBaseUrl) return { status: 204 };
  const host = origin ? new URL(origin).host : null;
  const staffHost = appUrl ? new URL(appUrl).host : null;
  const portalHost = new URL(portalBaseUrl).host;
  if (!host || (host !== staffHost && host !== portalHost)) {
    const hostname = origin ? new URL(origin).hostname.replace(/^\[|\]$/g, '') : '';
    if (
      path === '/health' &&
      (hostname === 'localhost' || isLoopbackAddress(hostname)) &&
      isLoopbackAddress(socketAddress)
    )
      return { status: 204 };
    return { status: 421 };
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
    return { status: 404 };
  }
  return { status: 204, portalHost: host === portalHost };
}

export const hostRouting: MiddlewareHandler = async (c, next) => {
  if (c.req.path === '/internal/frontend-gate' || c.req.path === '/internal/proxy-check')
    return next();
  const decision = decideHostRouting(
    getEffectiveOrigin(c),
    c.req.path,
    await settingsCacheService.getAll(),
    getSocketAddress(c)
  );
  if (decision.status === 421)
    return c.json({ success: false, error: 'MISDIRECTED_REQUEST', message: 'Unknown host' }, 421);
  if (decision.status === 404)
    return c.json({ success: false, error: 'NOT_FOUND', message: 'Not found' }, 404);
  if (decision.portalHost !== undefined) c.set('portalHost', decision.portalHost);
  return next();
};
