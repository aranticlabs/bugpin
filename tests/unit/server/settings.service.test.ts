import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { settingsService } from '../../../src/server/services/settings.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import type { AppSettings } from '../../../src/shared/types';

function createBaseSettings(): AppSettings {
  const baseColors = {
    lightButtonColor: '#111111',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#222222',
    lightTextHoverColor: '#ffffff',
    darkButtonColor: '#111111',
    darkTextColor: '#ffffff',
    darkButtonHoverColor: '#222222',
    darkTextHoverColor: '#ffffff',
  };

  return {
    appName: 'BugPin',
    appUrl: 'https://example.com',
    retentionDays: 90,
    rateLimitPerMinute: 10,
    sessionMaxAgeDays: 7,
    smtpEnabled: false,
    smtpConfig: {},
    s3Enabled: false,
    s3Config: {},
    widgetLauncherButton: {
      position: 'bottom-right',
      buttonText: 'Report a bug',
      buttonShape: 'round',
      buttonIcon: 'bug',
      buttonIconSize: 24,
      buttonIconStroke: 2,
      theme: 'auto',
      enableHoverScaleEffect: true,
      tooltipEnabled: true,
      tooltipText: 'Found a bug?',
      ...baseColors,
    },
    widgetDialog: baseColors,
    screenshot: {
      useScreenCaptureAPI: false,
      maxScreenshotSize: 10,
    },
    notifications: {
      emailEnabled: true,
      notifyOnNewReport: true,
      notifyOnStatusChange: true,
      notifyOnPriorityChange: true,
      notifyOnAssignment: true,
    },
    branding: {
      primaryColor: '#02658D',
      logoLightUrl: null,
      logoDarkUrl: null,
      iconLightUrl: null,
      iconDarkUrl: null,
      faviconLightVersion: 'default',
      faviconDarkVersion: 'default',
    },
    adminButton: baseColors,
  };
}

const originalGetAll = settingsRepo.getAll;
const originalUpdateAll = settingsRepo.updateAll;
const originalGet = settingsRepo.get;

let baseSettings: AppSettings;
let lastUpdates: Partial<AppSettings> | null;

beforeEach(() => {
  baseSettings = createBaseSettings();
  lastUpdates = null;

  settingsRepo.getAll = async () => baseSettings;
  settingsRepo.updateAll = async (updates: Partial<AppSettings>) => {
    lastUpdates = updates;
    return {
      ...baseSettings,
      ...updates,
    };
  };
  settingsRepo.get = async <T>(key: string) => {
    if (key === 'missing') {
      return null;
    }
    return (baseSettings as unknown as Record<string, T>)[key] ?? null;
  };
});

afterEach(() => {
  settingsRepo.getAll = originalGetAll;
  settingsRepo.updateAll = originalUpdateAll;
  settingsRepo.get = originalGet;
});

describe('settingsService.update', () => {
  it('rejects empty app name', async () => {
    const result = await settingsService.update({ appName: '  ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_APP_NAME');
    }
  });

  it('rejects invalid app URL', async () => {
    const result = await settingsService.update({ appUrl: 'ftp://example.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_APP_URL');
    }
  });

  it('validates numeric bounds', async () => {
    const retention = await settingsService.update({ retentionDays: 5000 });
    expect(retention.success).toBe(false);
    const screenshot = await settingsService.update({ screenshot: { maxScreenshotSize: 0 } });
    expect(screenshot.success).toBe(false);
    const rateLimit = await settingsService.update({ rateLimitPerMinute: 0 });
    expect(rateLimit.success).toBe(false);
    const sessionMax = await settingsService.update({ sessionMaxAgeDays: 0 });
    expect(sessionMax.success).toBe(false);
  });

  it('rejects invalid branding color', async () => {
    const result = await settingsService.update({
      branding: { primaryColor: '#xyzxyz' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_COLOR');
    }
  });

  it('requires SMTP config when enabling SMTP', async () => {
    const result = await settingsService.update({ smtpEnabled: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_SMTP_CONFIG');
    }
  });

  it('requires S3 config when enabling S3', async () => {
    const result = await settingsService.update({ s3Enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_S3_CONFIG');
    }
  });

  it('accepts valid SMTP config and trims inputs', async () => {
    const result = await settingsService.update({
      appName: '  BugPin  ',
      appUrl: ' https://example.com ',
      smtpEnabled: true,
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        from: 'admin@example.com',
      },
    });

    expect(result.success).toBe(true);
    expect(lastUpdates?.appName).toBe('BugPin');
    expect(lastUpdates?.appUrl).toBe('https://example.com');
    expect(lastUpdates?.smtpEnabled).toBe(true);
    expect(lastUpdates?.smtpConfig).toMatchObject({ host: 'smtp.example.com' });
  });
});

describe('settingsService.get', () => {
  it('returns a setting value when present', async () => {
    const result = await settingsService.get('appName');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('BugPin');
    }
  });

  it('returns NOT_FOUND when setting is missing', async () => {
    const result = await settingsService.get('missing');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
    }
  });
});

describe('settingsService.getAll', () => {
  it('returns all settings', async () => {
    const result = await settingsService.getAll();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.appName).toBe('BugPin');
    }
  });
});
