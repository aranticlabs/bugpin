import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { logger } from '../utils/logger.js';

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
 * - Redirects HTTP requests to HTTPS (using x-forwarded-proto header from proxy)
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

  // Check the protocol from the proxy header
  const proto = c.req.header('x-forwarded-proto');

  // If request came via HTTP (as reported by proxy), redirect to HTTPS
  if (proto === 'http') {
    const url = new URL(c.req.url);
    url.protocol = 'https:';
    return c.redirect(url.toString(), 301);
  }

  // For HTTPS requests, add HSTS header
  // max-age=31536000 = 1 year; includeSubDomains extends to all subdomains
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  return next();
};
