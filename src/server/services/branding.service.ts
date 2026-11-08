import { withEffectiveBranding } from '../utils/effective-branding.js';
import { getEEHooks } from '../utils/ee-hooks.js';
import type { WhiteLabelConfig } from '../types/ee-plugin.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { isValidHexColor } from '../utils/validators.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { ThemeColors, AdminButtonColors } from '@shared/types';

/**
 * CE Branding Service
 *
 * This service handles Community Edition branding features:
 * - Reading branding configuration (public)
 * - Widget dialog colors (CE feature)
 *
 * Admin branding features (logos, icons, favicons, primary color, admin theme colors)
 * are handled by the EE Admin Branding Service.
 */

// Types

export interface BrandingConfig {
  whiteLabel?: WhiteLabelConfig;
  primaryColor: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  iconLightUrl: string | null;
  iconDarkUrl: string | null;
  faviconLightVersion: string;
  faviconDarkVersion: string;
  adminThemeColors: AdminButtonColors;
  widgetPrimaryColors: ThemeColors;
}

// Service

export const brandingService = {
  /**
   * Get current branding configuration
   * This is a public endpoint - no EE license required
   */
  async getBrandingConfig(): Promise<Result<BrandingConfig>> {
    try {
      const settings = withEffectiveBranding(await settingsRepo.getAll());

      const config: BrandingConfig = {
        whiteLabel: await getEEHooks().getWhiteLabelService()?.getConfig(),
        primaryColor: settings.branding.primaryColor,
        logoLightUrl: settings.branding.logoLightUrl,
        logoDarkUrl: settings.branding.logoDarkUrl,
        iconLightUrl: settings.branding.iconLightUrl,
        iconDarkUrl: settings.branding.iconDarkUrl,
        faviconLightVersion: settings.branding.faviconLightVersion,
        faviconDarkVersion: settings.branding.faviconDarkVersion,
        adminThemeColors: settings.adminButton,
        widgetPrimaryColors: settings.widgetDialog,
      };

      return Result.ok(config);
    } catch (error) {
      logger.error('Failed to get branding config', { error });
      return Result.fail('Failed to get branding config', 'GET_FAILED');
    }
  },

  /**
   * Update widget dialog colors (buttons inside the dialog)
   * This is a CE feature - no EE license required
   */
  async updateWidgetPrimaryColors(colors: Partial<ThemeColors>): Promise<Result<void>> {
    try {
      for (const [key, value] of Object.entries(colors)) {
        if (value !== undefined && !isValidHexColor(value)) {
          return Result.fail(
            `Invalid hex color format for ${key}. Must be #RRGGBB`,
            'INVALID_COLOR'
          );
        }
      }

      await settingsRepo.updateNested('widgetDialog', colors);
      settingsCacheService.invalidate();

      logger.info('Widget dialog colors updated', { colors });
      return Result.ok(undefined);
    } catch (error) {
      logger.error('Failed to update widget dialog colors', { error, colors });
      return Result.fail('Failed to update widget dialog colors', 'UPDATE_FAILED');
    }
  },
};
