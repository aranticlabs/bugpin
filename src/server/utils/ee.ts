import type { Context, Next } from 'hono';
import type { EEPlugin } from '../types/ee-plugin.js';
import { registerEEHooks, resetEEHooks } from './ee-hooks.js';
import { logger } from './logger.js';

/**
 * Enterprise Edition utilities
 *
 * Provides functions to check EE availability and license status.
 * The actual license validation logic lives in ee/src/licensing/
 */

// Cache EE availability check
let eeAvailable: boolean | null = null;

// Cached EE plugin instance
let eePlugin: EEPlugin | null = null;

// Flag to track if EE has been initialized
let eeInitialized = false;

/**
 * Check if EE code is available (submodule present)
 */
export function isEEAvailable(): boolean {
  if (eeAvailable !== null) return eeAvailable;

  try {
    require.resolve('../../../ee/src');
    eeAvailable = true;
  } catch {
    eeAvailable = false;
  }

  return eeAvailable;
}

/**
 * Get the EE license service if available
 */
export function getEELicenseService() {
  if (!isEEAvailable()) return null;

  try {
    const ee = require('../../../ee/src');
    return ee.licenseService;
  } catch {
    return null;
  }
}

/**
 * Get the EE plugin if available
 */
export function getEEPlugin(): EEPlugin | null {
  if (!isEEAvailable()) return null;
  if (eePlugin) return eePlugin;

  try {
    const ee = require('../../../ee/src');
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
 * Called once at server startup
 */
export async function initializeEE(): Promise<void> {
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
    registerEEHooks(plugin.getHooks());
    logger.info('Enterprise Edition initialized', {
      name: plugin.name,
      version: plugin.version,
      licensed: plugin.isLicensed(),
    });
  } catch (error) {
    logger.error('Failed to initialize Enterprise Edition', { error });
    resetEEHooks();
  }

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
export function hasEEFeature(feature: string): boolean {
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

  if (!licenseService.isValid()) {
    return {
      eeAvailable: true,
      licensed: false,
      message: 'License expired',
    };
  }

  return {
    eeAvailable: true,
    licensed: true,
    plan: license.plan,
    customerName: license.customerName,
    features: license.features,
    expiresAt: license.expiresAt,
  };
}

/**
 * Middleware that requires EE license
 * Returns 402 Payment Required if not licensed
 */
export function requireEELicense() {
  return async (c: Context, next: Next) => {
    if (!isEELicensed()) {
      return c.json(
        {
          error: 'Enterprise license required',
          code: 'LICENSE_REQUIRED',
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402,
      );
    }
    return next();
  };
}

/**
 * Middleware that requires a specific EE feature
 * Returns 402 Payment Required if feature not licensed
 */
export function requireEEFeature(feature: string) {
  return async (c: Context, next: Next) => {
    if (!isEEAvailable()) {
      return c.json(
        {
          error: 'Enterprise Edition required',
          code: 'EE_REQUIRED',
          feature,
          upgradeUrl: 'https://bugpin.io/editions/',
        },
        402,
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
        402,
      );
    }

    return next();
  };
}

/**
 * Reset EE state - used primarily for testing
 */
export function resetEEState(): void {
  eeAvailable = null;
  eePlugin = null;
  eeInitialized = false;
  resetEEHooks();
}
