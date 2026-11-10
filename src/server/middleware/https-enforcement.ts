import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { logger } from '../utils/logger.js';
import { getEffectiveOrigin, getSocketAddress, isLoopbackAddress } from '../utils/client-ip.js';
import type { AppSettings } from '@shared/types';

let overrideWarningLogged = false;

/** Logs once per process that DISABLE_HTTPS_ENFORCEMENT overrides an enabled "Enforce HTTPS" setting */
export async function warnIfHttpsEnforcementOverridden(): Promise<void> {
  if (overrideWarningLogged || !config.disableHttpsEnforcement) return;
  const settings = await settingsCacheService.getAll();
  if (!settings.enforceHttps) return;
  overrideWarningLogged = true;
  logger.warn(
    'DISABLE_HTTPS_ENFORCEMENT is set: the "Enforce HTTPS" setting is ignored. Remove the variable once the setting is fixed.'
  );
}

export type HttpsDecision =
  | { status: 204; hsts?: string }
  | { status: 301; location: string }
  | { status: 400 }
  | { status: 421 };

export function decideHttpsEnforcement(
  origin: string | null,
  uri: string,
  settings: Pick<AppSettings, 'enforceHttps' | 'appUrl' | 'portalBaseUrl'>,
  disabled: boolean,
  socketAddress?: string
): HttpsDecision {
  if (disabled || !settings.enforceHttps) return { status: 204 };
  if (!origin) return { status: 400 };
  const effectiveUrl = new URL(origin);
  const url = new URL(uri, origin);
  if (effectiveUrl.protocol === 'http:') {
    const hostname = effectiveUrl.hostname.replace(/^\[|\]$/g, '');
    if (
      url.pathname === '/health' &&
      (hostname === 'localhost' || isLoopbackAddress(hostname)) &&
      isLoopbackAddress(socketAddress)
    )
      return { status: 204 };
    let configured = settings.appUrl;
    if (settings.portalBaseUrl) {
      configured =
        [settings.appUrl, settings.portalBaseUrl].find(
          (value) => value && new URL(value).host === effectiveUrl.host
        ) ?? '';
      if (!configured) return { status: 421 };
    }
    const destination = configured ? new URL(configured) : effectiveUrl;
    url.protocol = 'https:';
    url.hostname = destination.hostname;
    url.port = destination.port;
    return { status: 301, location: url.toString() };
  }
  return effectiveUrl.protocol === 'https:'
    ? { status: 204, hsts: 'max-age=31536000; includeSubDomains' }
    : { status: 204 };
}

export const httpsEnforcement: MiddlewareHandler = async (c, next) => {
  if (c.req.path === '/internal/frontend-gate' || c.req.path === '/internal/proxy-check')
    return next();
  if (config.disableHttpsEnforcement) {
    await warnIfHttpsEnforcementOverridden();
    return next();
  }
  const decision = decideHttpsEnforcement(
    getEffectiveOrigin(c),
    c.req.url,
    await settingsCacheService.getAll(),
    config.disableHttpsEnforcement,
    getSocketAddress(c)
  );
  if (decision.status === 400)
    return c.json({ success: false, error: 'INVALID_HOST', message: 'Invalid host' }, 400);
  if (decision.status === 421)
    return c.json({ success: false, error: 'MISDIRECTED_REQUEST', message: 'Unknown host' }, 421);
  if (decision.status === 301) return c.redirect(decision.location, 301);
  await next();
  if (decision.hsts) c.header('Strict-Transport-Security', decision.hsts);
};
