import { brandingService } from './branding.service.js';
import { settingsCacheService } from './settings-cache.service.js';
import { Result } from '../utils/result.js';
import { SUPPORTED_LOCALES } from '@shared/types';

export const portalConfigService = {
  async get() {
    const branding = await brandingService.getBrandingConfig();
    if (!branding.success) return branding;
    const settings = await settingsCacheService.getAll();
    const {
      primaryColor,
      logoLightUrl,
      logoDarkUrl,
      faviconLightVersion,
      faviconDarkVersion,
      whiteLabel,
    } = branding.value;
    return Result.ok({
      appName: settings.appName,
      branding: {
        primaryColor,
        logoLightUrl,
        logoDarkUrl,
        faviconLightVersion,
        faviconDarkVersion,
      },
      hideFooterBranding: Boolean(whiteLabel?.enabled && whiteLabel.hideFooterBranding),
      locales: SUPPORTED_LOCALES,
    });
  },
};
