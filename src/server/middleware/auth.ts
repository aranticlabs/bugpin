import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { authService } from '../services/auth.service.js';
import { twoFactorService } from '../services/two-factor.service.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import { apiAccessDeniedBody, hasApiAccess } from './api-access.js';
import type { ApiTokenValidationResult } from '../types/ee-plugin.js';
import type { User, Session } from '@shared/types';

// Types

// Extend Hono context with user and session
declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    session: Session;
    apiToken: ApiTokenValidationResult;
  }
}

// Middleware

const PASSWORD_CHANGE_ALLOWED_PATHS = new Set(['/api/auth/change-password', '/api/auth/logout']);

function passwordChangeRequired(user: User, path: string): boolean {
  return user.mustChangePassword === true && !PASSWORD_CHANGE_ALLOWED_PATHS.has(path);
}

const passwordChangeRequiredBody = {
  success: false,
  error: 'PASSWORD_CHANGE_REQUIRED',
  message: 'You must change your password before continuing',
} as const;

// While the two-factor policy requires setup, only sign-out, password and second-factor
// management stay available.
const TWO_FACTOR_SETUP_ALLOWED_PREFIXES = ['/api/auth/two-factor', '/api/auth/passkeys'];

function twoFactorSetupRequired(user: User, path: string): boolean {
  if (user.twoFactorSetupRequired !== true || PASSWORD_CHANGE_ALLOWED_PATHS.has(path)) return false;
  return !TWO_FACTOR_SETUP_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

const twoFactorSetupRequiredBody = {
  success: false,
  error: 'TWO_FACTOR_SETUP_REQUIRED',
  message: 'You must set up two-factor authentication before continuing',
} as const;

/**
 * Authentication middleware
 * Validates API credentials or a session cookie and sets the user in context
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.get('user')) return next();
  const authorization = c.req.header('Authorization');
  if (authorization) {
    const service = getEEHooks().getApiTokenService();
    const match = /^Bearer (\S+)$/i.exec(authorization);
    if (!service || !match)
      return c.json(
        { success: false, error: 'UNAUTHORIZED', message: 'Invalid API credentials' },
        401
      );
    const result = await service.validateToken(match[1]);
    if (!result.success)
      return c.json({ success: false, error: result.code, message: result.error }, 401);
    const token = result.value;
    if (token.user.mustChangePassword) return c.json(passwordChangeRequiredBody, 403);
    const scope = ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) ? 'read' : 'write';
    if (!hasApiAccess(token.user)) return c.json(apiAccessDeniedBody, 403);
    if (!service.hasScope(token, scope) || (scope === 'write' && token.user.role === 'viewer')) {
      return c.json(
        { success: false, error: 'FORBIDDEN', message: 'Insufficient API permissions' },
        403
      );
    }
    if (/^\/api\/(auth|tokens)(\/|$)/.test(c.req.path)) {
      return c.json(
        { success: false, error: 'FORBIDDEN', message: 'Use a session to manage credentials' },
        403
      );
    }
    const tokenUser = await twoFactorService.describeUser(token.user);
    if (tokenUser.twoFactorSetupRequired) return c.json(twoFactorSetupRequiredBody, 403);
    c.set('user', tokenUser);
    c.set('apiToken', token);
    return next();
  }
  const sessionId = getCookie(c, 'session');
  if (!sessionId)
    return c.json(
      { success: false, error: 'UNAUTHORIZED', message: 'Authentication required' },
      401
    );
  const result = await authService.validateSession(sessionId);
  if (!result.success)
    return c.json(
      { success: false, error: result.code ?? 'UNAUTHORIZED', message: result.error },
      401
    );
  if (passwordChangeRequired(result.value.user, c.req.path)) {
    return c.json(passwordChangeRequiredBody, 403);
  }
  if (twoFactorSetupRequired(result.value.user, c.req.path)) {
    return c.json(twoFactorSetupRequiredBody, 403);
  }
  c.set('user', result.value.user);
  c.set('session', result.value.session);

  return next();
};

/**
 * Role-based authorization middleware
 * Requires authMiddleware to be applied first
 *
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export function authorize(allowedRoles: Array<'admin' | 'editor' | 'viewer'>): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json(
        { success: false, error: 'UNAUTHORIZED', message: 'Authentication required' },
        401
      );
    }

    const token = c.get('apiToken');
    const adminRoute = allowedRoles.length === 1 && allowedRoles[0] === 'admin';
    if (
      !allowedRoles.includes(user.role) ||
      (token && adminRoute && !token.scopes.includes('admin'))
    ) {
      return c.json(
        { success: false, error: 'FORBIDDEN', message: 'Insufficient permissions' },
        403
      );
    }

    return next();
  };
}

/**
 * Optional authentication middleware
 * Sets user in context if session exists, but doesn't require authentication
 */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const sessionId = getCookie(c, 'session');

  if (sessionId) {
    const result = await authService.validateSession(sessionId);

    if (result.success) {
      c.set('user', result.value.user);
      c.set('session', result.value.session);
    }
  }

  return next();
};

/**
 * Admin-only shortcut middleware
 * Combines authMiddleware + authorize(['admin'])
 */
export const adminOnly: MiddlewareHandler = async (c, next) => {
  const response = await authMiddleware(c, async () => {});
  if (response instanceof Response) return response;
  return authorize(['admin'])(c, next);
};
