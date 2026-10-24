import type { Context, MiddlewareHandler, Next } from 'hono';
import type { EEPlugin, EEFeature, ProjectLicenseService } from '../types/ee-plugin.js';
import { registerEEHooks, resetEEHooks } from './ee-hooks.js';
import { logger } from './logger.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';

/**
 * Enterprise Edition utilities
 *
 * Provides functions to check EE availability and license status.
 * The actual license validation logic lives in ee/src/licensing/
 */

// Cache EE availability check
let eeAvailable: boolean | null = null;

// Resolved EE module path (dist/ in production, src/ in development)
let eeModulePath: string | null = null;

// Cached EE plugin instance
let eePlugin: EEPlugin | null = null;

// Flag to track if EE has been initialized
let eeInitialized = false;

/**
 * Resolve the EE module path.
 * Prefers source in development and compiled modules in production.
 */
function resolveEEPath(): string | null {
  if (eeModulePath) return eeModulePath;

  const paths =
    process.env.NODE_ENV === 'development'
      ? ['../../../ee/src', '../../../ee/dist']
      : ['../../../ee/dist', '../../../ee/src'];
  for (const path of paths) {
    try {
      require.resolve(path);
      eeModulePath = path;
      return eeModulePath;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Check if EE code is available (submodule present)
 */
export function isEEAvailable(): boolean {
  if (eeAvailable !== null) return eeAvailable;
  eeAvailable = resolveEEPath() !== null;
  return eeAvailable;
}

/**
 * Get the EE license service if available
 */
export function getEELicenseService() {
  const path = resolveEEPath();
  if (!path) return null;

  try {
    const ee = require(path);
    return ee.licenseService;
  } catch {
    return null;
  }
}

export function getEEProjectLicenseService(): ProjectLicenseService | null {
  const path = resolveEEPath();
  if (!path) return null;
  return require(path).projectLicenseService ?? null;
}

export async function syncEELicense(): Promise<import('./result.js').Result<boolean>> {
  const path = resolveEEPath();
  const { Result } = await import('./result.js');
  if (!path) return Result.fail('Enterprise Edition is not installed', 'EE_NOT_AVAILABLE');
  const refresh = require(path).refreshLicense;
  if (!refresh) return Result.fail('License sync is unavailable', 'SYNC_UNAVAILABLE');
  return refresh();
}

/**
 * Get the EE plugin if available
 */
export function getEEPlugin(): EEPlugin | null {
  if (!isEEAvailable()) return null;
  if (eePlugin) return eePlugin;

  try {
    const ee = require(resolveEEPath()!);
    if (ee.createPlugin) {
      eePlugin = ee.createPlugin();
      return eePlugin;
    }
  } catch (error) {
    logger.warn('Failed to load EE plugin', { error });
  }

  return null;
}

/**
 * Initialize EE plugin
 * Called once at server startup. Short-lived processes that run next to the
 * server pass refresh: false and rely on the authorization the server stored,
 * because the license server reads a second refreshing process as a second
 * running copy of the license.
 */
export async function initializeEE(options: { refresh?: boolean } = {}): Promise<void> {
  if (eeInitialized) return;

  const plugin = getEEPlugin();
  if (!plugin) {
    logger.info('Enterprise Edition not available');
    resetEEHooks();
    eeInitialized = true;
    return;
  }

  try {
    await plugin.initialize();
  } catch (error) {
    logger.error('Failed to initialize Enterprise Edition', { error });
    resetEEHooks();
    eeInitialized = true;
    return;
  }

  // License restore is best-effort — errors here should not disable EE
  try {
    if (!plugin.isLicensed()) {
      const storedKey = await settingsRepo.get<string>('ee:license_key');
      if (storedKey) {
        const licenseService = getEELicenseService();
        if (licenseService) {
          const authorization = await settingsRepo.get<string>('ee:license_authorization');
          const result = await licenseService.validateAndStore(
            storedKey,
            true,
            authorization ?? undefined
          );
          if (
            result.valid &&
            (await settingsRepo.get<string>('ee:license_revoked_key')) === storedKey
          )
            licenseService.markInactive();
          if (result.valid) {
            logger.info('License restored from database');
          } else {
            // The key stays stored: a clock that is behind at boot fails validation
            // too, and the periodic refresh loads the license once it validates.
            logger.warn('Stored license key could not be loaded', { error: result.error });
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to restore license from database', { error });
  }

  if (options.refresh !== false) {
    const ee = require(resolveEEPath()!);
    ee.startLicenseRefresh?.();
  }

  registerEEHooks(plugin.getHooks());
  logger.info('Enterprise Edition initialized', {
    name: plugin.name,
    version: plugin.version,
    licensed: plugin.isLicensed(),
  });

  eeInitialized = true;
}

/**
 * Get EE routes to mount on the API router
 * Returns a Map of path prefix to Hono app
 */
export function getEERoutes(): Map<string, import('hono').Hono> {
  const plugin = getEEPlugin();
  if (!plugin) return new Map();
  return plugin.getRoutes();
}

/**
 * Check if EE is available AND licensed
 */
export function isEELicensed(): boolean {
  const plugin = getEEPlugin();
  if (plugin) {
    return plugin.isLicensed();
  }

  // Fallback to license service for backwards compatibility
  const licenseService = getEELicenseService();
  if (!licenseService) return false;
  return licenseService.isValid();
}

/**
 * Check if a specific EE feature is available and licensed
 */
export function hasEEFeature(feature: EEFeature): boolean {
  const plugin = getEEPlugin();
  if (plugin) {
    return plugin.hasFeature(feature);
  }

  // Fallback to license service for backwards compatibility
  const licenseService = getEELicenseService();
  if (!licenseService) return false;
  return licenseService.hasFeature(feature);
}

/**
 * Get license status for API responses
 */
export function getLicenseStatus() {
  const licenseService = getEELicenseService();
  if (!licenseService) {
    return {
      eeAvailable: false,
      licensed: false,
      message: 'Enterprise Edition not installed',
    };
  }

  const license = licenseService.getLicense();
  if (!license) {
    return {
      eeAvailable: true,
      licensed: false,
      message: 'No license installed',
    };
  }

  const valid = licenseService.isValid();
  const warning = licenseService.getStatus().warning;
  return {
    eeAvailable: true,
    installed: true,
    licensed: valid,
    ...(!valid ? { message: licenseService.getStatus().error ?? 'License inactive' } : {}),
    ...(warning ? { warning } : {}),
    ...getEEProjectLicenseService()?.getStatus(),
    plan: license.plan,
    customerName: license.customerName,
    customerEmail: license.customerEmail,
    features: licenseService.getStatus().features,
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
  };
}

/**
 * Middleware that requires EE license
 * Returns 402 Payment Required if not licensed
 */
export function requireEELicense(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!isEELicensed()) {
      return c.json(
        {
          error: 'Enterprise license required',
          code: 'LICENSE_REQUIRED',
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402
      );
    }
    return next();
  };
}

/**
 * Middleware that requires a specific EE feature
 * Returns 402 Payment Required if feature not licensed
 */
export function requireEEFeature(feature: EEFeature): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!isEEAvailable()) {
      return c.json(
        {
          error: 'Enterprise Edition required',
          code: 'EE_REQUIRED',
          feature,
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402
      );
    }

    if (!hasEEFeature(feature)) {
      return c.json(
        {
          error: `Feature '${feature}' requires Enterprise license`,
          code: 'FEATURE_NOT_LICENSED',
          feature,
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402
      );
    }

    return next();
  };
}

/**
 * Reset EE state - used primarily for testing
 */
export function resetEEState(): void {
  const path = resolveEEPath();
  if (path) require(path).stopLicenseRefresh?.();
  eeAvailable = null;
  eeModulePath = null;
  eePlugin = null;
  eeInitialized = false;
  resetEEHooks();
}
