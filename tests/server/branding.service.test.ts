import * as ee from '../../src/server/utils/ee';
import { describe, it, expect, beforeAll, beforeEach, afterEach, spyOn, type Mock } from 'bun:test';
import {
  settingsRepo,
  DEFAULT_BRANDING,
  DEFAULT_ADMIN_BUTTON,
} from '../../src/server/database/repositories/settings.repo';
import { logger } from '../../src/server/utils/logger';

let brandingService: typeof import('../../src/server/services/branding.service').brandingService;

const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };
let hasFeature: Mock<typeof ee.hasEEFeature>;

let updateNestedCalls: Array<{ key: string; payload: unknown }> = [];

beforeAll(async () => {
  const mod = await import('../../src/server/services/branding.service');
  brandingService = mod.brandingService;
});

beforeEach(() => {
  hasFeature = spyOn(ee, 'hasEEFeature').mockReturnValue(true);
  updateNestedCalls = [];

  settingsRepo.updateNested = async (key, payload) => {
    updateNestedCalls.push({ key, payload });
    return settingsRepo.getAll();
  };
  settingsRepo.getAll = async () =>
    ({
      branding: {
        primaryColor: '#123456',
        logoLightUrl: '/branding/light/logo.png',
        logoDarkUrl: '/branding/dark/logo.png',
        iconLightUrl: '/branding/light/icon.png',
        iconDarkUrl: '/branding/dark/icon.png',
        faviconLightVersion: 'v1',
        faviconDarkVersion: 'v2',
      },
      adminButton: {
        lightButtonColor: '#111111',
        lightTextColor: '#ffffff',
        lightButtonHoverColor: '#222222',
        lightTextHoverColor: '#ffffff',
        darkButtonColor: '#eeeeee',
        darkTextColor: '#000000',
        darkButtonHoverColor: '#dddddd',
        darkTextHoverColor: '#000000',
      },
      widgetDialog: {
        lightButtonColor: '#111111',
        lightTextColor: '#ffffff',
        lightButtonHoverColor: '#222222',
        lightTextHoverColor: '#ffffff',
        darkButtonColor: '#eeeeee',
        darkTextColor: '#000000',
        darkButtonHoverColor: '#dddddd',
        darkTextHoverColor: '#000000',
      },
    }) as never;

  logger.info = () => undefined;
  logger.error = () => undefined;
});

afterEach(() => {
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
  hasFeature.mockRestore();
});

describe('brandingService.getBrandingConfig', () => {
  it('returns config from settings', async () => {
    const result = await brandingService.getBrandingConfig();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.primaryColor).toBe('#123456');
    }
  });

  it('uses default branding without a license and preserves saved customization', async () => {
    hasFeature.mockReturnValue(false);
    const settings = await settingsRepo.getAll();
    const snapshot = structuredClone(settings);
    settingsRepo.getAll = async () => settings;
    const result = await brandingService.getBrandingConfig();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.primaryColor).toBe(DEFAULT_BRANDING.primaryColor);
      expect(result.value.logoLightUrl).toBeNull();
      expect(result.value.adminThemeColors).toEqual(DEFAULT_ADMIN_BUTTON);
      expect(result.value.widgetPrimaryColors).toEqual(settings.widgetDialog);
    }
    expect(settings).toEqual(snapshot);
  });

  it('returns GET_FAILED when settings fetch throws', async () => {
    settingsRepo.getAll = async () => {
      throw new Error('boom');
    };
    const result = await brandingService.getBrandingConfig();
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'GET_FAILED');
  });
});

describe('brandingService.updateWidgetPrimaryColors', () => {
  it('rejects invalid colors', async () => {
    const result = await brandingService.updateWidgetPrimaryColors({ lightButtonColor: 'blue' });
    expect(result.success).toBe(false);
  });

  it('updates colors when valid', async () => {
    const result = await brandingService.updateWidgetPrimaryColors({ lightButtonColor: '#112233' });
    expect(result.success).toBe(true);
    expect(updateNestedCalls[0]).toMatchObject({ key: 'widgetDialog' });
  });

  it('returns UPDATE_FAILED when update throws', async () => {
    settingsRepo.updateNested = async () => {
      throw new Error('boom');
    };
    const result = await brandingService.updateWidgetPrimaryColors({ lightButtonColor: '#112233' });
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'UPDATE_FAILED');
  });
});
