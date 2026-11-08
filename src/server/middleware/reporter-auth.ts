import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { reporterAuthService } from '../services/reporter-auth.service.js';
import { portalOrigin } from './origin-check.js';
import type { PortalMe } from '@shared/portal-types';

export const REPORTER_SESSION_COOKIE = 'bugpin_reporter_session';

declare module 'hono' {
  interface ContextVariableMap {
    reporter: PortalMe;
    reporterSessionId: string;
  }
}

export const reporterAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const secret = getCookie(c, REPORTER_SESSION_COOKIE);
  const result = secret ? reporterAuthService.validateSession(secret) : null;
  if (!result?.success)
    return c.json(
      { success: false, error: 'UNAUTHORIZED', message: 'Authentication required' },
      401
    );
  c.set('reporter', result.value.reporter);
  c.set('reporterSessionId', result.value.sessionId);
  setCookie(c, REPORTER_SESSION_COOKIE, secret!, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: (await portalOrigin(c))?.startsWith('https:') ?? false,
    path: '/',
    expires: new Date(result.value.expiresAt),
  });
  return next();
};
