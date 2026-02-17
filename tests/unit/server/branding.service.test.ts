import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { logger } from '../../../src/server/utils/logger';

let brandingService: typeof import('../../../src/server/services/branding.service').brandingService;

const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };

let updateNestedCalls: Array<{ key: string; payload: unknown }> = [];

beforeAll(async () => {
  const mod = await import('../../../src/server/services/branding.service');
  brandingService = mod.brandingService;
});

beforeEach(() => {
  updateNestedCalls = [];

  settingsRepo.updateNested = async (key, payload) => {
    updateNestedCalls.push({ key, payload });
    return true;
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
});

describe('brandingService.getBrandingConfig', () => {
  it('returns config from settings', async () => {
    const result = await brandingService.getBrandingConfig();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.primaryColor).toBe('#123456');
    }
  });

  it('returns GET_FAILED when settings fetch throws', async () => {
    settingsRepo.getAll = async () => {
      throw new Error('boom');
    };
    const result = await brandingService.getBrandingConfig();
    expect(result.success).toBe(false);
    expect(result.code).toBe('GET_FAILED');
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
    expect(result.code).toBe('UPDATE_FAILED');
  });
});
