import type { Context, MiddlewareHandler } from 'hono';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { getEffectiveOrigin } from '../utils/client-ip.js';

function configuredOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

function matchesOrigin(c: Context, expected: string | null): boolean {
  const fetchSite = c.req.header('Sec-Fetch-Site');
  return (
    expected !== null &&
    c.req.header('Origin') === expected &&
    (fetchSite === undefined || fetchSite === 'same-origin')
  );
}

function rejectedOrigin(c: Context): Response {
  return c.json(
    { success: false, error: 'ORIGIN_REJECTED', message: 'Request origin rejected' },
    403
  );
}

export async function portalOrigin(c: Context): Promise<string | null> {
  const settings = await settingsCacheService.getAll();
  const configured = settings.portalBaseUrl || settings.appUrl;
  if (!configured) return getEffectiveOrigin(c);
  return configuredOrigin(configured);
}

export const portalOriginCheck: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const expected = await portalOrigin(c);
  if (!matchesOrigin(c, expected) || c.req.header('X-BugPin-Portal') !== '1')
    return rejectedOrigin(c);
  return next();
};

export const staffOriginCheck: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const { appUrl } = await settingsCacheService.getAll();
  const expected = appUrl ? configuredOrigin(appUrl) : getEffectiveOrigin(c);
  if (!matchesOrigin(c, expected)) return rejectedOrigin(c);
  return next();
};
