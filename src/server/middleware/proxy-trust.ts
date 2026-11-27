import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { proxyTokenService } from '../services/proxy-token.service.js';
import { Result } from '../utils/result.js';

export const proxyTrust: MiddlewareHandler = async (c, next) => {
  if (config.trustProxy !== 'token') return next();
  const path = c.req.path;
  const read = c.req.method === 'GET' || c.req.method === 'HEAD';
  if (read && path === '/internal/proxy-check' && c.req.header('X-BugPin-Frontend') !== 'portal')
    return next();
  if (!Result.unwrapOr(proxyTokenService.verify(c.req.header('X-BugPin-Proxy-Token')), false)) {
    if (read && path === '/health') return next();
    return c.json({ success: false, error: 'MISDIRECTED_REQUEST', message: 'Unknown host' }, 421);
  }
  if (
    (path.startsWith('/internal/') && !(read && path === '/internal/frontend-gate')) ||
    (c.req.header('X-BugPin-Frontend') === 'portal' &&
      path !== '/' &&
      !path.startsWith('/api/portal/') &&
      !path.startsWith('/branding/') &&
      path !== '/internal/frontend-gate')
  ) {
    return c.json({ success: false, error: 'NOT_FOUND', message: 'Not found' }, 404);
  }
  return next();
};
