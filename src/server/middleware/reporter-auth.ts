import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { reporterAuthService } from '../services/reporter-auth.service.js';
import { portalOperatorAuthService } from '../services/portal-operator-auth.service.js';
import { portalOrigin } from './origin-check.js';
import type { PortalScope } from '../database/repositories/portal-reports.repo.js';
import type { PortalMe, PortalOperator } from '@shared/portal-types';

const REPORTER_SESSION_COOKIE = 'bugpin_reporter_session';
const PORTAL_OPERATOR_COOKIE = 'bugpin_portal_operator_session';
const HOST_REPORTER_SESSION_COOKIE = `__Host-${REPORTER_SESSION_COOKIE}`;
const HOST_PORTAL_OPERATOR_COOKIE = `__Host-${PORTAL_OPERATOR_COOKIE}`;

declare module 'hono' {
  interface ContextVariableMap {
    reporter: PortalMe;
    reporterSessionId: string;
    reporterSessionSecret: string;
    portalOperator: PortalOperator;
    portalOperatorSessionId: string;
    portalScope: PortalScope;
  }
}

const unauthorized = (c: Context) =>
  c.json({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);

async function portalIsHttps(c: Context): Promise<boolean> {
  return (await portalOrigin(c))?.startsWith('https:') ?? false;
}

export async function portalCookieOptions(c: Context, expires?: string) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: await portalIsHttps(c),
    path: '/',
    ...(expires ? { expires: new Date(expires) } : {}),
  };
}

// On HTTPS only the `__Host-` name is read or written, so a sibling subdomain that plants
// the plain name cannot fix a session on the portal.
export async function reporterCookieName(c: Context): Promise<string> {
  return (await portalIsHttps(c)) ? HOST_REPORTER_SESSION_COOKIE : REPORTER_SESSION_COOKIE;
}

export async function portalOperatorCookieName(c: Context): Promise<string> {
  return (await portalIsHttps(c)) ? HOST_PORTAL_OPERATOR_COOKIE : PORTAL_OPERATOR_COOKIE;
}

async function authenticateReporter(c: Context): Promise<boolean> {
  const name = await reporterCookieName(c);
  const secret = getCookie(c, name);
  const result = secret ? reporterAuthService.validateSession(secret) : null;
  if (!secret || !result?.success) return false;
  c.set('reporter', result.value.reporter);
  c.set('reporterSessionId', result.value.sessionId);
  c.set('reporterSessionSecret', secret);
  c.set('portalScope', { kind: 'reporter', reporterId: result.value.reporter.id });
  setCookie(c, name, secret, await portalCookieOptions(c, result.value.expiresAt));
  return true;
}

async function authenticateOperator(c: Context): Promise<boolean> {
  const secret = getCookie(c, await portalOperatorCookieName(c));
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
