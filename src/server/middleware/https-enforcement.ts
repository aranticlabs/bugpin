import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { logger } from '../utils/logger.js';
import { getEffectiveOrigin, getSocketAddress, isLoopbackAddress } from '../utils/client-ip.js';

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

/**
 * HTTPS enforcement middleware
 *
 * When enforceHttps is enabled in settings:
 * - Redirects HTTP to the configured host, or the request host when no URL is configured
 * - Adds Strict-Transport-Security header to HTTPS responses
 *
 * The DISABLE_HTTPS_ENFORCEMENT environment variable turns both off regardless of the setting.
 *
 * Note: This requires a properly configured reverse proxy that sets
 * the x-forwarded-proto header. Without a TLS-terminating proxy,
 * enabling this setting will not provide actual HTTPS protection.
 */
export const httpsEnforcement: MiddlewareHandler = async (c, next) => {
  if (config.disableHttpsEnforcement) {
    await warnIfHttpsEnforcementOverridden();
    return next();
  }

  const settings = await settingsCacheService.getAll();

  if (!settings.enforceHttps) {
    return next();
  }

  const url = new URL(c.req.url);
  const origin = getEffectiveOrigin(c);
  if (!origin)
    return c.json({ success: false, error: 'INVALID_HOST', message: 'Invalid host' }, 400);
  const effectiveUrl = new URL(origin);

  // Separate origins require a configured host; other redirects use appUrl or the validated origin.
  if (effectiveUrl.protocol === 'http:') {
    const hostname = effectiveUrl.hostname.replace(/^\[|\]$/g, '');
    if (
      c.req.path === '/health' &&
      (hostname === 'localhost' || isLoopbackAddress(hostname)) &&
      isLoopbackAddress(getSocketAddress(c))
    )
      return next();
    let configured = settings.appUrl;
    if (settings.portalBaseUrl) {
      configured =
        [settings.appUrl, settings.portalBaseUrl].find(
          (value) => value && new URL(value).host === effectiveUrl.host
        ) ?? '';
      if (!configured)
        return c.json(
          { success: false, error: 'MISDIRECTED_REQUEST', message: 'Unknown host' },
          421
        );
    }
    const destination = configured ? new URL(configured) : effectiveUrl;
    url.protocol = 'https:';
    url.hostname = destination.hostname;
    url.port = destination.port;
    return c.redirect(url.toString(), 301);
  }

  // For HTTPS requests, add HSTS header
  // max-age=31536000 = 1 year; includeSubDomains extends to all subdomains
  await next();
  if (effectiveUrl.protocol === 'https:')
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
};
