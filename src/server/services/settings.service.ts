import { settingsRepo } from '../database/repositories/settings.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import {
  isValidUrl,
  isValidHexColor,
  validateSmtpConfig,
  validateS3Config,
} from '../utils/validators.js';
import type {
  AppSettings,
  GlobalWidgetLauncherButtonSettings,
  GlobalScreenshotSettings,
  NotificationDefaultSettings,
  BrandingSettings,
  AdminButtonColors,
  ThemeColors,
} from '@shared/types';

// Types

export interface UpdateSettingsInput {
  // System settings
  appName?: string;
  appUrl?: string;
  retentionDays?: number;
  rateLimitPerMinute?: number;
  sessionMaxAgeDays?: number;
  // Security settings
  enforceHttps?: boolean;
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
  screenshot?: Partial<GlobalScreenshotSettings>;
  // Notification defaults
  notifications?: Partial<NotificationDefaultSettings>;
  // Branding settings
  branding?: Partial<BrandingSettings>;
  // Admin Console settings
  adminButton?: Partial<AdminButtonColors>;
}

// Service

export const settingsService = {
  /**
   * Get all application settings
   */
  async getAll(): Promise<Result<AppSettings>> {
    const settings = await settingsRepo.getAll();
    return Result.ok(settings);
  },

  /**
   * Update application settings
   */
  async update(input: UpdateSettingsInput): Promise<Result<AppSettings>> {
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
          'INVALID_SCREENSHOT_SIZE',
        );
      }
    }

    // Validate rateLimitPerMinute if provided
    if (input.rateLimitPerMinute !== undefined) {
      if (input.rateLimitPerMinute < 1 || input.rateLimitPerMinute > 1000) {
        return Result.fail(
          'Rate limit must be between 1 and 1000 requests per minute',
          'INVALID_RATE_LIMIT',
        );
      }
    }

    // Validate sessionMaxAgeDays if provided
    if (input.sessionMaxAgeDays !== undefined) {
      if (input.sessionMaxAgeDays < 1 || input.sessionMaxAgeDays > 365) {
        return Result.fail(
          'Session max age must be between 1 and 365 days',
          'INVALID_SESSION_MAX_AGE',
        );
      }
    }

    // Validate SMTP config if SMTP is being enabled
    if (input.smtpEnabled === true) {
      const currentSettings = await settingsRepo.getAll();
      const smtpConfig = input.smtpConfig ?? currentSettings.smtpConfig;

      const smtpValidation = validateSmtpConfig(smtpConfig);
      if (!smtpValidation.success) {
        return smtpValidation;
      }
    }

    // Validate S3 config if S3 is being enabled
    if (input.s3Enabled === true) {
      const currentSettings = await settingsRepo.getAll();
      const s3Config = input.s3Config ?? currentSettings.s3Config;

      const s3Validation = validateS3Config(s3Config);
      if (!s3Validation.success) {
        return s3Validation;
      }
    }

    // Validate branding primary color if provided
    if (input.branding?.primaryColor !== undefined) {
      if (!isValidHexColor(input.branding.primaryColor)) {
        return Result.fail('Invalid hex color format. Must be #RRGGBB', 'INVALID_COLOR');
      }
    }

    // Build updates object with nested structure
    const updates: Partial<AppSettings> = {};

    // System settings
    if (input.appName !== undefined) {
      updates.appName = input.appName.trim();
    }
    if (input.appUrl !== undefined) {
      updates.appUrl = input.appUrl.trim();
    }
    if (input.retentionDays !== undefined) {
      updates.retentionDays = input.retentionDays;
    }
    if (input.rateLimitPerMinute !== undefined) {
      updates.rateLimitPerMinute = input.rateLimitPerMinute;
    }
    if (input.sessionMaxAgeDays !== undefined) {
      updates.sessionMaxAgeDays = input.sessionMaxAgeDays;
    }

    // Security settings
    if (input.enforceHttps !== undefined) {
      updates.enforceHttps = input.enforceHttps;
    }

    // SMTP settings
    if (input.smtpEnabled !== undefined) {
      updates.smtpEnabled = input.smtpEnabled;
    }
    if (input.smtpConfig !== undefined) {
      updates.smtpConfig = input.smtpConfig;
    }

    // S3 settings
    if (input.s3Enabled !== undefined) {
      updates.s3Enabled = input.s3Enabled;
    }
    if (input.s3Config !== undefined) {
      updates.s3Config = input.s3Config;
    }

    // Nested widget settings
    if (input.widgetLauncherButton !== undefined) {
      updates.widgetLauncherButton =
        input.widgetLauncherButton as GlobalWidgetLauncherButtonSettings;
    }
    if (input.widgetDialog !== undefined) {
      updates.widgetDialog = input.widgetDialog as ThemeColors;
    }
    if (input.screenshot !== undefined) {
      updates.screenshot = input.screenshot as GlobalScreenshotSettings;
    }

    // Notification defaults
    if (input.notifications !== undefined) {
      updates.notifications = input.notifications as NotificationDefaultSettings;
    }

    // Branding settings
    if (input.branding !== undefined) {
      updates.branding = input.branding as BrandingSettings;
    }

    // Admin Console settings
    if (input.adminButton !== undefined) {
      updates.adminButton = input.adminButton as AdminButtonColors;
    }

    const settings = await settingsRepo.updateAll(updates);

    // Invalidate settings cache to force reload on next access
    settingsCacheService.invalidate();

    logger.info('Settings updated', { updates: Object.keys(updates) });
    return Result.ok(settings);
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
