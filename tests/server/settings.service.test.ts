import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { settingsService } from '../../src/server/services/settings.service';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { emailService, type SMTPConfig } from '../../src/server/services/email.service';
import { cleanupService } from '../../src/server/services/cleanup.service';
import { getEELicenseService } from '../../src/server/utils/ee';
import { DEFAULT_PASSWORD_POLICY } from '../../src/shared/password-policy';
import type { AppSettings } from '../../src/shared/types';
import { DEFAULT_REPORTER_PORTAL_LIMITS } from '../../src/shared/types';

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
    portalBaseUrl: '',
    reporterPortalLimits: DEFAULT_REPORTER_PORTAL_LIMITS,
    retentionDays: 90,
    rateLimitPerMinute: 10,
    sessionMaxAgeDays: 7,
    invitationExpirationDays: 7,
    updateCheckEnabled: true,
    enforceHttps: false,
    twoFactorPolicy: 'off',
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
    privacy: { euPrivacyMode: false },
    diagnostics: {
      activityCapture: true,
      consoleCapture: true,
      networkCapture: true,
      storageKeysCapture: false,
    },
    smtpEnabled: false,
    smtpConfig: {},
    s3Enabled: false,
    s3Config: {},
    widgetLauncherButton: {
      position: 'bottom-right',
      buttonText: { en: 'Report a bug' },
      buttonShape: 'round',
      buttonIcon: 'bug',
      buttonIconSize: 24,
      buttonIconStroke: 2,
      buttonOffsetX: 0,
      buttonOffsetY: 0,
      buttonSizeUnit: 'px',
      theme: 'auto',
      enableHoverScaleEffect: true,
      tooltipEnabled: true,
      tooltipText: { en: 'Found a bug?' },
      ...baseColors,
    },
    widgetDialog: baseColors,
    widgetDialogContent: {
      title: null,
      titlePlaceholder: null,
      descriptionPlaceholder: null,
      submitButtonText: null,
      showPriority: true,
    },
    screenshot: {
      useScreenCaptureAPI: false,
      maxScreenshotSize: 10,
      maxImageUploadSizeMb: 10,
      maxVideoUploadSizeMb: 50,
      maxVideoUploadMbPerDay: 2048,
      enableScreenRecording: false,
      allowRecordingMicrophone: false,
      maxRecordingDurationSeconds: 180,
      recordingQuality: 'standard',
    },
    notifications: {
      emailEnabled: true,
      notifyOnNewReport: true,
      notifyOnStatusChange: true,
      notifyOnPriorityChange: true,
      notifyOnAssignment: true,
      notifyOnDeletion: true,
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
    reporterNotifications: {
      emailEnabled: true,
      notifyOnNewReport: true,
      notifyOnStatusChange: true,
      notifyOnPriorityChange: true,
      notifyOnAssignment: true,
      messagingEnabled: true,
    },
    language: { mode: 'auto', defaultLanguage: 'en' },
  };
}

const originalGetAll = settingsRepo.getAll;
const originalUpdateAll = settingsRepo.updateAll;
const originalGet = settingsRepo.get;
const originalSendTestEmail = emailService.sendTestEmail;
const originalDeleteAllReports = cleanupService.deleteAllReports;

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
  emailService.sendTestEmail = originalSendTestEmail;
  cleanupService.deleteAllReports = originalDeleteAllReports;
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

  it('merges partial diagnostics defaults with the stored ones', async () => {
    const result = await settingsService.update({ diagnostics: { networkCapture: false } });

    expect(result.success).toBe(true);
    expect(lastUpdates?.diagnostics).toEqual({
      activityCapture: true,
      consoleCapture: true,
      networkCapture: false,
      storageKeysCapture: false,
    });
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

  it('enables SMTP without a stored port, which defaults to 587', async () => {
    const result = await settingsService.update({
      smtpEnabled: true,
      smtpConfig: { host: 'smtp.example.com', from: 'admin@example.com' },
    });

    expect(result.success).toBe(true);
    expect(lastUpdates?.smtpEnabled).toBe(true);
  });

  it('accepts valid SMTP config and trims the app name and URL', async () => {
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

describe('settingsService nested merge', () => {
  it('keeps untouched screenshot fields on a partial update', async () => {
    const result = await settingsService.update({ screenshot: { maxScreenshotSize: 20 } });

    expect(result.success).toBe(true);
    expect(lastUpdates?.screenshot).toEqual({ ...baseSettings.screenshot, maxScreenshotSize: 20 });
  });

  it('keeps untouched launcher button fields on a partial update', async () => {
    const result = await settingsService.update({ widgetLauncherButton: { position: 'top-left' } });

    expect(result.success).toBe(true);
    expect(lastUpdates?.widgetLauncherButton).toEqual({
      ...baseSettings.widgetLauncherButton,
      position: 'top-left',
    });
  });

  it('lets an explicit null clear a localized launcher text', async () => {
    const result = await settingsService.update({ widgetLauncherButton: { buttonText: null } });

    expect(result.success).toBe(true);
    expect(lastUpdates?.widgetLauncherButton?.buttonText).toBeNull();
    expect(lastUpdates?.widgetLauncherButton?.tooltipText).toBe(
      baseSettings.widgetLauncherButton.tooltipText
    );
  });

  it('keeps untouched dialog content and notification fields on a partial update', async () => {
    baseSettings.widgetDialogContent = {
      title: { en: 'Report' },
      titlePlaceholder: null,
      descriptionPlaceholder: null,
      submitButtonText: null,
      showPriority: true,
    };

    const result = await settingsService.update({
      widgetDialogContent: { showPriority: false },
      notifications: { notifyOnDeletion: false },
      widgetDialog: { lightButtonColor: '#abcdef' },
    });

    expect(result.success).toBe(true);
    expect(lastUpdates?.widgetDialogContent).toEqual({
      title: { en: 'Report' },
      titlePlaceholder: null,
      descriptionPlaceholder: null,
      submitButtonText: null,
      showPriority: false,
    });
    expect(lastUpdates?.notifications).toEqual({
      ...baseSettings.notifications,
      notifyOnDeletion: false,
    });
    expect(lastUpdates?.widgetDialog).toEqual({
      ...baseSettings.widgetDialog,
      lightButtonColor: '#abcdef',
    });
  });

  it('keeps untouched SMTP fields on a partial update', async () => {
    baseSettings.smtpConfig = {
      host: 'smtp.example.com',
      port: 587,
      user: 'mailer',
      password: 'stored-secret',
      from: 'bugs@example.com',
    };

    const result = await settingsService.update({ smtpConfig: { port: 465 } });

    expect(result.success).toBe(true);
    expect(lastUpdates?.smtpConfig).toEqual({ ...baseSettings.smtpConfig, port: 465 });
  });
});

describe('settingsService secrets', () => {
  beforeEach(() => {
    baseSettings.smtpConfig = {
      host: 'smtp.example.com',
      port: 587,
      user: 'mailer',
      password: 'stored-secret',
      from: 'bugs@example.com',
    };
    baseSettings.s3Config = {
      bucket: 'bucket',
      region: 'eu-central-1',
      accessKeyId: 'AKIA',
      secretAccessKey: 'stored-key',
    };
  });

  it('omits secrets from getAllRedacted and reports that they are set', async () => {
    const result = await settingsService.getAllRedacted();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.smtpConfig).not.toHaveProperty('password');
      expect(result.value.smtpConfig.passwordSet).toBe(true);
      expect(result.value.s3Config).not.toHaveProperty('secretAccessKey');
      expect(result.value.s3Config.secretAccessKeySet).toBe(true);
    }
  });

  it('reports unset secrets as false', async () => {
    baseSettings.smtpConfig = {};
    baseSettings.s3Config = {};
    const result = await settingsService.getAllRedacted();

    expect(result.success && result.value.smtpConfig.passwordSet).toBe(false);
    expect(result.success && result.value.s3Config.secretAccessKeySet).toBe(false);
  });

  it('keeps the stored SMTP password when the update sends an empty one', async () => {
    const result = await settingsService.update({
      smtpConfig: { host: 'smtp2.example.com', password: '' },
    });

    expect(result.success).toBe(true);
    expect(lastUpdates?.smtpConfig?.password).toBe('stored-secret');
    expect(lastUpdates?.smtpConfig?.host).toBe('smtp2.example.com');
    expect(lastUpdates?.smtpConfig).not.toHaveProperty('passwordSet');
    if (result.success) {
      expect(result.value.smtpConfig).not.toHaveProperty('password');
      expect(result.value.smtpConfig.passwordSet).toBe(true);
    }
  });

  it('replaces the stored SMTP password when the update sends a new one', async () => {
    const result = await settingsService.update({ smtpConfig: { password: 'new-secret' } });

    expect(result.success).toBe(true);
    expect(lastUpdates?.smtpConfig?.password).toBe('new-secret');
  });

  it('never writes the read-only flags back to the database', async () => {
    baseSettings.smtpConfig = { ...baseSettings.smtpConfig, passwordSet: true };
    baseSettings.s3Config = { ...baseSettings.s3Config, secretAccessKeySet: true };

    const licenseService = getEELicenseService()!;
    const originalHasFeature = licenseService.hasFeature;
    licenseService.hasFeature = () => true;
    try {
      const result = await settingsService.update({
        smtpConfig: { port: 2525 },
        s3Config: { bucket: 'other', secretAccessKey: '' },
      });

      expect(result.success).toBe(true);
      expect(lastUpdates?.smtpConfig).not.toHaveProperty('passwordSet');
      expect(lastUpdates?.smtpConfig?.password).toBe('stored-secret');
      expect(lastUpdates?.s3Config).not.toHaveProperty('secretAccessKeySet');
      expect(lastUpdates?.s3Config?.secretAccessKey).toBe('stored-key');
      expect(lastUpdates?.s3Config?.bucket).toBe('other');
    } finally {
      licenseService.hasFeature = originalHasFeature;
    }
  });

  it('falls back to the stored SMTP password for a test email without one', async () => {
    let usedConfig: SMTPConfig | undefined;
    emailService.sendTestEmail = async (config) => {
      usedConfig = config;
      return { success: true };
    };

    const result = await settingsService.sendTestEmail({
      smtpConfig: { host: 'smtp.example.com', port: 587, user: 'mailer', from: 'a@example.com' },
      testEmail: 'to@example.com',
      appName: 'BugPin',
    });

    expect(result.success).toBe(true);
    expect(usedConfig?.password).toBe('stored-secret');
  });

  it('uses the password from the test email request when one is given', async () => {
    let usedConfig: SMTPConfig | undefined;
    emailService.sendTestEmail = async (config) => {
      usedConfig = config;
      return { success: true };
    };

    await settingsService.sendTestEmail({
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        user: 'mailer',
        password: 'typed',
        from: 'a@example.com',
      },
      testEmail: 'to@example.com',
      appName: 'BugPin',
    });

    expect(usedConfig?.password).toBe('typed');
  });

  it('returns SMTP_ERROR when the test email fails', async () => {
    emailService.sendTestEmail = async () => ({ success: false, error: 'SMTP down' });

    const result = await settingsService.sendTestEmail({
      smtpConfig: { host: 'smtp.example.com', port: 587, from: 'a@example.com' },
      testEmail: 'to@example.com',
      appName: 'BugPin',
    });

    expect(result).toEqual({ success: false, error: 'SMTP down', code: 'SMTP_ERROR' });
  });
});

describe('settingsService SMTP enable validation', () => {
  it('rejects enabling SMTP when the merged config has no host', async () => {
    baseSettings.smtpConfig = { port: 587, from: 'bugs@example.com' };
    const result = await settingsService.update({ smtpEnabled: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_SMTP_CONFIG');
    }
  });

  it('rejects enabling SMTP when the from address is invalid', async () => {
    const result = await settingsService.update({
      smtpEnabled: true,
      smtpConfig: { host: 'smtp.example.com', port: 587, from: 'not-an-email' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_SMTP_CONFIG');
    }
  });

  it('rejects clearing the host while SMTP stays enabled', async () => {
    baseSettings.smtpEnabled = true;
    baseSettings.smtpConfig = { host: 'smtp.example.com', port: 587, from: 'bugs@example.com' };

    const result = await settingsService.update({ smtpConfig: { host: '' } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_SMTP_CONFIG');
    }
  });

  it('accepts enabling SMTP when the stored config completes the payload', async () => {
    baseSettings.smtpConfig = { host: 'smtp.example.com', port: 587 };
    const result = await settingsService.update({
      smtpEnabled: true,
      smtpConfig: { from: 'bugs@example.com' },
    });

    expect(result.success).toBe(true);
  });

  it('saves an incomplete config while SMTP is disabled', async () => {
    const result = await settingsService.update({
      smtpEnabled: false,
      smtpConfig: { host: '', from: '' },
    });

    expect(result.success).toBe(true);
    expect(lastUpdates?.smtpEnabled).toBe(false);
  });
});

describe('settingsService.deleteAllReports', () => {
  it('returns the cleanup counts', async () => {
    cleanupService.deleteAllReports = async () => ({ deleted: 3, errors: 1 });

    const result = await settingsService.deleteAllReports();

    expect(result).toEqual({ success: true, value: { deleted: 3, errors: 1 } });
  });

  it('returns DELETE_DATA_FAILED when the cleanup throws', async () => {
    cleanupService.deleteAllReports = async () => {
      throw new Error('disk gone');
    };

    const result = await settingsService.deleteAllReports();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('DELETE_DATA_FAILED');
    }
  });
});
