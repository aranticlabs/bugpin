import { hasEEFeature } from '../utils/ee.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { isSecurePortalUrl } from '../utils/portal-url.js';
import { settingsCacheService } from './settings-cache.service.js';
import { cleanupService } from './cleanup.service.js';
import { emailService } from './email.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { reporterPortalLimitsSchema } from '../utils/reporter-portal-limits.js';
import {
  isValidUrl,
  isValidHexColor,
  validateSmtpConfig,
  validateS3Config,
} from '../utils/validators.js';
import type {
  AppSettings,
  GlobalWidgetLauncherButtonSettings,
  GlobalWidgetDialogContentSettings,
  GlobalScreenshotSettings,
  NotificationDefaultSettings,
  BrandingSettings,
  AdminButtonColors,
  ReporterNotificationSettings,
  ProjectLanguageSettings,
  ThemeColors,
  PrivacySettings,
  DiagnosticSettings,
  TwoFactorPolicy,
} from '@shared/types';
import type { PasswordPolicy } from '@shared/password-policy';

// Types

export interface UpdateSettingsInput {
  // System settings
  invitationExpirationDays?: number;
  reporterNotifications?: Partial<ReporterNotificationSettings>;
  language?: ProjectLanguageSettings;
  appName?: string;
  appUrl?: string;
  portalBaseUrl?: string;
  reporterPortalLimits?: Partial<AppSettings['reporterPortalLimits']>;
  retentionDays?: number;
  rateLimitPerMinute?: number;
  sessionMaxAgeDays?: number;
  updateCheckEnabled?: boolean;
  // Security settings
  enforceHttps?: boolean;
  twoFactorPolicy?: TwoFactorPolicy;
  passwordPolicy?: PasswordPolicy;
  // Privacy settings
  privacy?: Partial<PrivacySettings>;
  diagnostics?: Partial<DiagnosticSettings>;
  // SMTP settings
  smtpEnabled?: boolean;
  smtpConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    from?: string;
  };
  // S3 settings
  s3Enabled?: boolean;
  s3Config?: {
    bucket?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
  };
  // Nested widget settings
  widgetLauncherButton?: Partial<GlobalWidgetLauncherButtonSettings>;
  widgetDialog?: Partial<ThemeColors>;
  widgetDialogContent?: Partial<GlobalWidgetDialogContentSettings>;
  screenshot?: Partial<GlobalScreenshotSettings>;
  // Notification defaults
  notifications?: Partial<NotificationDefaultSettings>;
  // Branding settings
  branding?: Partial<BrandingSettings>;
  // Admin Console settings
  adminButton?: Partial<AdminButtonColors>;
}

export interface TestEmailInput {
  smtpConfig: {
    host: string;
    port: number;
    user?: string;
    password?: string;
    from: string;
  };
  testEmail: string;
  appName: string;
}

export interface DeleteAllReportsOutcome {
  deleted: number;
  errors: number;
}

type SmtpConfig = AppSettings['smtpConfig'];
type S3Config = AppSettings['s3Config'];

// Helpers

/** Shallow merge that ignores keys whose patch value is undefined; null is kept as a value */
function mergeDefined<T extends object>(current: T, patch: Partial<T> | undefined): T {
  const merged: T = { ...current };
  if (!patch) return merged;
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** An empty or missing password keeps the stored one; the read-only flag is never stored */
function mergeSmtpConfig(
  current: SmtpConfig,
  patch: UpdateSettingsInput['smtpConfig']
): SmtpConfig {
  const { passwordSet: _passwordSet, ...stored } = current;
  const { password, ...rest } = patch ?? {};
  return { ...mergeDefined(stored, rest), ...(password ? { password } : {}) };
}

/** An empty or missing secret keeps the stored one; the read-only flag is never stored */
function mergeS3Config(current: S3Config, patch: UpdateSettingsInput['s3Config']): S3Config {
  const { secretAccessKeySet: _secretAccessKeySet, ...stored } = current;
  const { secretAccessKey, ...rest } = patch ?? {};
  return { ...mergeDefined(stored, rest), ...(secretAccessKey ? { secretAccessKey } : {}) };
}

/** Settings as sent to clients: secrets are replaced by flags saying whether one is stored */
function redactSecrets(settings: AppSettings): AppSettings {
  const { password, passwordSet: _passwordSet, ...smtpConfig } = settings.smtpConfig;
  const {
    secretAccessKey,
    secretAccessKeySet: _secretAccessKeySet,
    ...s3Config
  } = settings.s3Config;
  return {
    ...settings,
    smtpConfig: { ...smtpConfig, passwordSet: Boolean(password) },
    s3Config: { ...s3Config, secretAccessKeySet: Boolean(secretAccessKey) },
  };
}

// Service

export const settingsService = {
  /**
   * Get all application settings, including stored secrets (server-side use only)
   */
  async getAll(): Promise<Result<AppSettings>> {
    const settings = await settingsRepo.getAll();
    return Result.ok(settings);
  },

  /**
   * Get all application settings with secrets redacted, for API responses
   */
  async getAllRedacted(): Promise<Result<AppSettings>> {
    const settings = await settingsRepo.getAll();
    return Result.ok(redactSecrets(settings));
  },

  /**
   * Update application settings
   */
  async update(input: UpdateSettingsInput): Promise<Result<AppSettings>> {
    if (
      input.reporterPortalLimits !== undefined &&
      !reporterPortalLimitsSchema.safeParse(input.reporterPortalLimits).success
    ) {
      return Result.fail('Invalid reporter portal limits', 'VALIDATION_ERROR');
    }
    // Validate appName if provided
    if (input.appName !== undefined) {
      if (input.appName.trim().length < 1) {
        return Result.fail('App name cannot be empty', 'INVALID_APP_NAME');
      }
      if (input.appName.length > 100) {
        return Result.fail('App name must be 100 characters or less', 'INVALID_APP_NAME');
      }
    }

    // Validate appUrl if provided
    if (input.appUrl !== undefined && input.appUrl.length > 0) {
      if (!isValidUrl(input.appUrl)) {
        return Result.fail('Invalid app URL format', 'INVALID_APP_URL');
      }
    }

    // Validate retentionDays if provided (0 = never delete)
    if (input.retentionDays !== undefined) {
      if (input.retentionDays < 0 || input.retentionDays > 3650) {
        return Result.fail('Retention days must be between 0 and 3650', 'INVALID_RETENTION');
      }
    }

    // Validate screenshot settings if provided
    if (input.screenshot?.maxScreenshotSize !== undefined) {
      if (input.screenshot.maxScreenshotSize < 1 || input.screenshot.maxScreenshotSize > 50) {
        return Result.fail(
          'Max screenshot size must be between 1 and 50 MB',
          'INVALID_SCREENSHOT_SIZE'
        );
      }
    }

    if (input.screenshot?.maxImageUploadSizeMb !== undefined) {
      if (input.screenshot.maxImageUploadSizeMb < 1 || input.screenshot.maxImageUploadSizeMb > 50) {
        return Result.fail('Max upload size must be between 1 and 50 MB', 'INVALID_UPLOAD_SIZE');
      }
    }

    if (input.screenshot?.maxVideoUploadSizeMb !== undefined) {
      if (
        input.screenshot.maxVideoUploadSizeMb < 1 ||
        input.screenshot.maxVideoUploadSizeMb > 100
      ) {
        return Result.fail(
          'Max video upload size must be between 1 and 100 MB',
          'INVALID_VIDEO_UPLOAD_SIZE'
        );
      }
    }

    if (input.screenshot?.maxVideoUploadMbPerDay !== undefined) {
      if (
        input.screenshot.maxVideoUploadMbPerDay < 0 ||
        input.screenshot.maxVideoUploadMbPerDay > 1048576
      ) {
        return Result.fail(
          'Daily video upload limit must be between 0 and 1048576 MB',
          'INVALID_VIDEO_UPLOAD_QUOTA'
        );
      }
    }

    if (input.screenshot?.maxRecordingDurationSeconds !== undefined) {
      if (
        input.screenshot.maxRecordingDurationSeconds < 10 ||
        input.screenshot.maxRecordingDurationSeconds > 600
      ) {
        return Result.fail(
          'Max recording duration must be between 10 and 600 seconds',
          'INVALID_RECORDING_DURATION'
        );
      }
    }

    // Validate rateLimitPerMinute if provided
    if (input.rateLimitPerMinute !== undefined) {
      if (input.rateLimitPerMinute < 1 || input.rateLimitPerMinute > 1000) {
        return Result.fail(
          'Rate limit must be between 1 and 1000 requests per minute',
          'INVALID_RATE_LIMIT'
        );
      }
    }

    // Validate sessionMaxAgeDays if provided
    if (input.sessionMaxAgeDays !== undefined) {
      if (input.sessionMaxAgeDays < 1 || input.sessionMaxAgeDays > 365) {
        return Result.fail(
          'Session max age must be between 1 and 365 days',
          'INVALID_SESSION_MAX_AGE'
        );
      }
    }

    // Validate branding primary color if provided
    if (input.branding?.primaryColor !== undefined) {
      if (!isValidHexColor(input.branding.primaryColor)) {
        return Result.fail('Invalid hex color format. Must be #RRGGBB', 'INVALID_COLOR');
      }
    }

    const current = await settingsRepo.getAll();

    const smtpConfig =
      input.smtpConfig !== undefined
        ? mergeSmtpConfig(current.smtpConfig, input.smtpConfig)
        : current.smtpConfig;
    const smtpEnabled = input.smtpEnabled ?? current.smtpEnabled;
    if (smtpEnabled && (input.smtpEnabled !== undefined || input.smtpConfig !== undefined)) {
      const smtpValidation = validateSmtpConfig(smtpConfig);
      if (!smtpValidation.success) {
        return smtpValidation;
      }
    }

    const s3Config =
      input.s3Config !== undefined
        ? mergeS3Config(current.s3Config, input.s3Config)
        : current.s3Config;
    const s3Enabled = input.s3Enabled ?? current.s3Enabled;
    if (s3Enabled && (input.s3Enabled !== undefined || input.s3Config !== undefined)) {
      const s3Validation = validateS3Config(s3Config);
      if (!s3Validation.success) {
        return s3Validation;
      }
    }

    if (
      (input.branding !== undefined || input.adminButton !== undefined) &&
      !hasEEFeature('custom-branding')
    )
      return Result.fail('Custom branding requires Enterprise license', 'FEATURE_NOT_LICENSED');
    if (
      (input.s3Config !== undefined || input.s3Enabled !== undefined) &&
      !hasEEFeature('s3-storage')
    )
      return Result.fail('S3 storage requires Enterprise license', 'FEATURE_NOT_LICENSED');

    let portalBaseUrl = input.portalBaseUrl?.trim() ?? current.portalBaseUrl;
    const appUrl = input.appUrl?.trim() ?? current.appUrl;
    let appHostname: string | undefined;
    if (portalBaseUrl && appUrl) {
      if (!isValidUrl(appUrl)) return Result.fail('Invalid app URL format', 'INVALID_APP_URL');
      appHostname = new URL(appUrl).hostname;
    }
    if (portalBaseUrl) {
      try {
        const portal = new URL(portalBaseUrl);
        if (portal.pathname !== '/' || portal.search || portal.hash)
          return Result.fail(
            'Portal Base URL must be an origin without a path, query, or fragment',
            'INVALID_PORTAL_BASE_URL'
          );
        if (
          !['http:', 'https:'].includes(portal.protocol) ||
          portal.username ||
          portal.password ||
          portal.hostname === appHostname
        )
          return Result.fail(
            'Portal Base URL must use HTTP or HTTPS on a different host from the Application URL',
            'INVALID_PORTAL_BASE_URL'
          );
        portalBaseUrl = portal.origin;
      } catch {
        return Result.fail('Invalid Portal Base URL', 'INVALID_PORTAL_BASE_URL');
      }
    }
    const secureAppUrl = isSecurePortalUrl(appUrl);
    const securePortalUrl = !portalBaseUrl || isSecurePortalUrl(portalBaseUrl);
    if ((!secureAppUrl || !securePortalUrl) && projectsRepo.hasEnabledReporterPortal()) {
      if (!secureAppUrl)
        return Result.fail(
          'A secure Application URL is required while a reporter portal is enabled',
          'INVALID_APP_URL'
        );
      if (!securePortalUrl)
        return Result.fail(
          'A secure Portal Base URL is required while a reporter portal is enabled',
          'INVALID_PORTAL_BASE_URL'
        );
    }
    const updates: Partial<AppSettings> = {};

    // System settings
    if (input.invitationExpirationDays !== undefined)
      updates.invitationExpirationDays = input.invitationExpirationDays;
    if (input.language !== undefined) updates.language = input.language;
    if (input.appName !== undefined) updates.appName = input.appName.trim();
    if (input.appUrl !== undefined) updates.appUrl = input.appUrl.trim();
    if (input.portalBaseUrl !== undefined) updates.portalBaseUrl = portalBaseUrl;
    if (input.reporterPortalLimits !== undefined) {
      updates.reporterPortalLimits = mergeDefined(
        current.reporterPortalLimits,
        input.reporterPortalLimits
      );
    }
    if (input.retentionDays !== undefined) updates.retentionDays = input.retentionDays;
    if (input.rateLimitPerMinute !== undefined)
      updates.rateLimitPerMinute = input.rateLimitPerMinute;
    if (input.sessionMaxAgeDays !== undefined) updates.sessionMaxAgeDays = input.sessionMaxAgeDays;
    if (input.updateCheckEnabled !== undefined)
      updates.updateCheckEnabled = input.updateCheckEnabled;

    // Security settings
    if (input.enforceHttps !== undefined) updates.enforceHttps = input.enforceHttps;
    if (input.twoFactorPolicy !== undefined) updates.twoFactorPolicy = input.twoFactorPolicy;
    if (input.passwordPolicy !== undefined) updates.passwordPolicy = input.passwordPolicy;

    // Nested settings: a partial payload only changes the fields it contains
    if (input.privacy !== undefined) updates.privacy = mergeDefined(current.privacy, input.privacy);
    if (input.diagnostics !== undefined)
      updates.diagnostics = mergeDefined(current.diagnostics, input.diagnostics);
    if (input.reporterNotifications !== undefined)
      updates.reporterNotifications = mergeDefined(
        current.reporterNotifications,
        input.reporterNotifications
      );
    if (input.widgetLauncherButton !== undefined)
      updates.widgetLauncherButton = mergeDefined(
        current.widgetLauncherButton,
        input.widgetLauncherButton
      );
    if (input.widgetDialogContent !== undefined)
      updates.widgetDialogContent = mergeDefined(
        current.widgetDialogContent,
        input.widgetDialogContent
      );
    if (input.widgetDialog !== undefined)
      updates.widgetDialog = mergeDefined(current.widgetDialog, input.widgetDialog);
    if (input.screenshot !== undefined)
      updates.screenshot = mergeDefined(current.screenshot, input.screenshot);
    if (input.notifications !== undefined)
      updates.notifications = mergeDefined(current.notifications, input.notifications);
    if (input.branding !== undefined)
      updates.branding = mergeDefined(current.branding, input.branding);
    if (input.adminButton !== undefined)
      updates.adminButton = mergeDefined(current.adminButton, input.adminButton);

    // SMTP and S3 settings
    if (input.smtpEnabled !== undefined) updates.smtpEnabled = input.smtpEnabled;
    if (input.smtpConfig !== undefined) updates.smtpConfig = smtpConfig;
    if (input.s3Enabled !== undefined) updates.s3Enabled = input.s3Enabled;
    if (input.s3Config !== undefined) updates.s3Config = s3Config;

    const settings = await settingsRepo.updateAll(updates);

    // Invalidate settings cache to force reload on next access
    settingsCacheService.invalidate();

    logger.info('Settings updated', { updates: Object.keys(updates) });
    return Result.ok(redactSecrets(settings));
  },

  /**
   * Send a test email; an empty password falls back to the stored SMTP password
   */
  async sendTestEmail(input: TestEmailInput): Promise<Result<void>> {
    const smtpConfig = input.smtpConfig.password
      ? input.smtpConfig
      : { ...input.smtpConfig, password: (await settingsRepo.getAll()).smtpConfig.password };

    const sent = await emailService.sendTestEmail(smtpConfig, input.testEmail, input.appName);
    if (!sent.success) {
      return Result.fail(sent.error || 'Failed to send test email', 'SMTP_ERROR');
    }
    return Result.ok(undefined);
  },

  /**
   * Delete every report and its files immediately
   */
  async deleteAllReports(): Promise<Result<DeleteAllReportsOutcome>> {
    try {
      return Result.ok(await cleanupService.deleteAllReports());
    } catch (error) {
      logger.error('Failed to delete all reports', error);
      return Result.fail('Failed to delete reports', 'DELETE_DATA_FAILED');
    }
  },

  /**
   * Get a single setting by key
   */
  async get<T>(key: string): Promise<Result<T>> {
    const value = await settingsRepo.get<T>(key);

    if (value === null) {
      return Result.fail('Setting not found', 'NOT_FOUND');
    }

    return Result.ok(value);
  },
};
