import type { MiddlewareHandler } from 'hono';
import type { User } from '@shared/types';

export function hasApiAccess(user: Pick<User, 'role' | 'apiAccessEnabled'>): boolean {
  return user.role === 'admin' || user.apiAccessEnabled === true;
}

export const apiAccessDeniedBody = {
  success: false,
  error: 'API_ACCESS_DISABLED',
  message: 'An administrator has not enabled API access for this account',
} as const;

/** Blocks token creation for users without API access; listing and revoking stay allowed. */
export const requireApiAccessToCreateTokens: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const user = c.get('user');
  if (!user || !hasApiAccess(user)) return c.json(apiAccessDeniedBody, 403);
  return next();
};
