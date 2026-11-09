import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { settingsService } from '../../src/server/services/settings.service';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { createAppSettings } from '../fixtures/settings';
import type { AppSettings } from '../../src/shared/types';

const originalGetAll = settingsRepo.getAll;
const originalUpdateAll = settingsRepo.updateAll;
const originalGet = settingsRepo.get;

let baseSettings: AppSettings;
let lastUpdates: Partial<AppSettings> | null;

beforeEach(() => {
  baseSettings = createAppSettings();
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
    const videoSize = await settingsService.update({
      screenshot: { maxVideoUploadSizeMb: 101 },
    });
    expect(videoSize.success).toBe(false);
    const rateLimit = await settingsService.update({ rateLimitPerMinute: 0 });
    expect(rateLimit.success).toBe(false);
    const sessionMax = await settingsService.update({ sessionMaxAgeDays: 0 });
    expect(sessionMax.success).toBe(false);
    const videoQuota = await settingsService.update({
      screenshot: { maxVideoUploadMbPerDay: 1048577 },
    });
    expect(videoQuota.success).toBe(false);
    const recordingDuration = await settingsService.update({
      screenshot: { maxRecordingDurationSeconds: 9 },
    });
    expect(recordingDuration.success).toBe(false);
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

  it('passes privacy settings to the repository', async () => {
    const privacy = { euPrivacyMode: true };
    const result = await settingsService.update({ privacy });

    expect(result.success).toBe(true);
    expect(lastUpdates?.privacy).toEqual(privacy);
  });

  it('passes the two-factor and password policies to the repository', async () => {
    const passwordPolicy = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: false,
      requireNumber: true,
      requireSymbol: true,
    };
    const result = await settingsService.update({ twoFactorPolicy: 'everyone', passwordPolicy });

    expect(result.success).toBe(true);
    expect(lastUpdates?.twoFactorPolicy).toBe('everyone');
    expect(lastUpdates?.passwordPolicy).toEqual(passwordPolicy);
  });

  it('persists the global widget language setting', async () => {
    const language = { mode: 'manual' as const, defaultLanguage: 'de' as const };
    const result = await settingsService.update({ language });

    expect(result.success).toBe(true);
    expect(lastUpdates?.language).toEqual(language);
    if (result.success) {
      expect(result.value.language.defaultLanguage).toBe('de');
    }
  });

  it('persists global reporter notification settings', async () => {
    const reporterNotifications = {
      emailEnabled: true,
      notifyOnNewReport: true,
      notifyOnStatusChange: false,
      notifyOnPriorityChange: true,
      notifyOnAssignment: true,
      messagingEnabled: true,
    };
    const result = await settingsService.update({ reporterNotifications });

    expect(result.success).toBe(true);
    expect(lastUpdates?.reporterNotifications).toEqual(reporterNotifications);
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
