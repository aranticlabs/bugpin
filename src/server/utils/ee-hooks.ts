import type { EEHooks } from '../types/ee-plugin.js';
import { createDefaultHooks } from '../types/ee-plugin.js';

/**
 * EE Hooks Registry
 *
 * This module provides a registry for EE hooks. When EE is available and initialized,
 * it registers its hooks here. CE code uses getEEHooks() to access these hooks.
 *
 * This pattern allows CE code to call hook functions without knowing if EE is present.
 * When EE is not available, the default no-op hooks are used.
 */

let eeHooks: EEHooks = createDefaultHooks();

/**
 * Register EE hooks
 * Called by EE plugin during initialization
 */
export function registerEEHooks(hooks: EEHooks): void {
  eeHooks = hooks;
}

/**
 * Get EE hooks
 * Returns the registered EE hooks, or default no-op hooks if EE is not available
 */
export function getEEHooks(): EEHooks {
  return eeHooks;
}

/**
 * Reset EE hooks to defaults
 * Used primarily for testing
 */
export function resetEEHooks(): void {
  eeHooks = createDefaultHooks();
}
