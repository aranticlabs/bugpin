import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { reporterAuthService } from '../services/reporter-auth.service.js';
import { portalOperatorAuthService } from '../services/portal-operator-auth.service.js';
import { portalOrigin } from './origin-check.js';
import type { PortalScope } from '../database/repositories/portal-reports.repo.js';
import type { PortalMe, PortalOperator } from '@shared/portal-types';

export const REPORTER_SESSION_COOKIE = 'bugpin_reporter_session';
export const PORTAL_OPERATOR_COOKIE = 'bugpin_portal_operator_session';

declare module 'hono' {
  interface ContextVariableMap {
    reporter: PortalMe;
    reporterSessionId: string;
    portalOperator: PortalOperator;
    portalOperatorSessionId: string;
    portalScope: PortalScope;
  }
}

const unauthorized = (c: Context) =>
  c.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);

export async function portalCookieOptions(c: Context, expires?: string) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: (await portalOrigin(c))?.startsWith('https:') ?? false,
    path: '/',
    ...(expires ? { expires: new Date(expires) } : {}),
  };
}

async function authenticateReporter(c: Context): Promise<boolean> {
  const secret = getCookie(c, REPORTER_SESSION_COOKIE);
  const result = secret ? reporterAuthService.validateSession(secret) : null;
  if (!secret || !result?.success) return false;
  c.set('reporter', result.value.reporter);
  c.set('reporterSessionId', result.value.sessionId);
  c.set('portalScope', { kind: 'reporter', reporterId: result.value.reporter.id });
  setCookie(
    c,
    REPORTER_SESSION_COOKIE,
    secret,
    await portalCookieOptions(c, result.value.expiresAt)
  );
  return true;
}

async function authenticateOperator(c: Context): Promise<boolean> {
  const secret = getCookie(c, PORTAL_OPERATOR_COOKIE);
  if (!secret) return false;
  const result = await portalOperatorAuthService.validateSession(secret);
  if (!result.success) return false;
  c.set('portalOperator', result.value.operator);
  c.set('portalOperatorSessionId', result.value.sessionId);
  c.set('portalScope', { kind: 'operator' });
  return true;
}

/** Routes that act as a reporter. A team session is read-only and is refused with 403. */
export const reporterAuthMiddleware: MiddlewareHandler = async (c, next) => {
  if (await authenticateReporter(c)) return next();
  if (await authenticateOperator(c))
    return c.json(
      { success: false, error: 'READ_ONLY', message: 'The team view is read-only' },
      403
    );
  return unauthorized(c);
};

/** Read routes shared by reporters and the read-only team view. Sets `portalScope`. */
export const portalReaderAuthMiddleware: MiddlewareHandler = async (c, next) => {
  if ((await authenticateReporter(c)) || (await authenticateOperator(c))) return next();
  return unauthorized(c);
};
