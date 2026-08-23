import { getDb } from '../database.js';
import type {
  AppSettings,
  GlobalWidgetLauncherButtonSettings,
  ThemeColors,
  GlobalScreenshotSettings,
  NotificationDefaultSettings,
  BrandingSettings,
  AdminButtonColors,
  ReporterNotificationSettings,
  LocalizedString,
  ProjectLanguageSettings,
  PrivacySettings,
} from '@shared/types';
import {
  wrapLegacyLocalizedString,
  wrapLegacyTooltipText,
} from '../../utils/wrap-legacy-localized-string.js';

// Database Row Type

interface SettingRow {
  key: string;
  value: string; // JSON string
  updated_at: string;
}

// Default values for nested settings

const DEFAULT_WIDGET_LAUNCHER_BUTTON: GlobalWidgetLauncherButtonSettings = {
  position: 'bottom-right',
  buttonText: null,
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 24,
  buttonIconStroke: 2,
  theme: 'auto',
  enableHoverScaleEffect: true,
  tooltipEnabled: true,
  tooltipText: null,
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
};

const DEFAULT_WIDGET_DIALOG: ThemeColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  lightBackgroundColor: '#ffffff',
  lightSecondaryColor: '#f5f5f5',
  lightInputColor: '#ffffff',
  lightForegroundColor: '#0a0a0a',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  darkBackgroundColor: '#0a0a0a',
  darkSecondaryColor: '#262626',
  darkInputColor: '#1a1a1a',
  darkForegroundColor: '#fafafa',
};

const DEFAULT_SCREENSHOT: GlobalScreenshotSettings = {
  useScreenCaptureAPI: false,
  maxScreenshotSize: 10,
  maxImageUploadSizeMb: 10,
  maxVideoUploadSizeMb: 50,
};

const DEFAULT_NOTIFICATIONS: NotificationDefaultSettings = {
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  notifyOnDeletion: true,
};

const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#02658D',
  logoLightUrl: null,
  logoDarkUrl: null,
  iconLightUrl: null,
  iconDarkUrl: null,
  faviconLightVersion: 'default',
  faviconDarkVersion: 'default',
};

const DEFAULT_REPORTER_NOTIFICATIONS: ReporterNotificationSettings = {
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  messagingEnabled: true,
};

const DEFAULT_LANGUAGE: ProjectLanguageSettings = {
  mode: 'auto',
  defaultLanguage: 'en',
};

const DEFAULT_PRIVACY: PrivacySettings = {
  euPrivacyMode: false,
};

const DEFAULT_ADMIN_BUTTON: AdminButtonColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
};

// Key mapping from camelCase to snake_case
const KEY_MAP: Record<string, string> = {
  appName: 'app_name',
  appUrl: 'app_url',
  retentionDays: 'retention_days',
  rateLimitPerMinute: 'rate_limit_per_minute',
  sessionMaxAgeDays: 'session_max_age_days',
  invitationExpirationDays: 'invitation_expiration_days',
  updateCheckEnabled: 'update_check_enabled',
  enforceHttps: 'enforce_https',
  privacy: 'privacy',
  smtpEnabled: 'smtp_enabled',
  smtpConfig: 'smtp_config',
  s3Enabled: 's3_enabled',
  s3Config: 's3_config',
  widgetLauncherButton: 'widget_launcher_button',
  widgetDialog: 'widget_dialog',
  screenshot: 'screenshot',
  notifications: 'notifications',
  branding: 'branding',
  reporterNotifications: 'reporter_notifications',
  adminButton: 'admin_button',
  emailTemplates: 'email_templates',
  language: 'language',
};

// Repository

export const settingsRepo = {
  /**
   * Get a single setting by key
   */
  async get<T>(key: string): Promise<T | null> {
    const db = getDb();
    const row = db.query('SELECT value FROM settings WHERE key = ?').get(key) as {
      value: string;
    } | null;

    if (!row) {
      return null;
    }

    return JSON.parse(row.value) as T;
  },

  /**
   * Set a single setting
   */
  async set<T>(key: string, value: T): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();
    const jsonValue = JSON.stringify(value);

    db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, jsonValue, now]
    );
  },

  /**
   * Get all settings as a structured object
   */
  async getAll(): Promise<AppSettings> {
    const db = getDb();
    const rows = db.query('SELECT key, value FROM settings').all() as SettingRow[];

    const settings: Record<string, unknown> = {};

    for (const row of rows) {
      settings[camelCase(row.key)] = JSON.parse(row.value);
    }

    return {
      // System settings
      appName: (settings.appName as string) ?? 'BugPin',
      appUrl: (settings.appUrl as string) ?? '',
      retentionDays: (settings.retentionDays as number) ?? 90,
      rateLimitPerMinute: (settings.rateLimitPerMinute as number) ?? 10,
      sessionMaxAgeDays: (settings.sessionMaxAgeDays as number) ?? 7,
      invitationExpirationDays: (settings.invitationExpirationDays as number) ?? 7,
      updateCheckEnabled: (settings.updateCheckEnabled as boolean) ?? true,
      // Security settings
      enforceHttps: (settings.enforceHttps as boolean) ?? false,
      // Privacy settings
      privacy: {
        ...DEFAULT_PRIVACY,
        ...(settings.privacy as Partial<PrivacySettings>),
      },
      // SMTP settings
      smtpEnabled: (settings.smtpEnabled as boolean) ?? false,
      smtpConfig: (settings.smtpConfig as AppSettings['smtpConfig']) ?? {},
      // S3 settings
      s3Enabled: (settings.s3Enabled as boolean) ?? false,
      s3Config: (settings.s3Config as AppSettings['s3Config']) ?? {},
      // Widget settings (nested)
      widgetLauncherButton: mergeGlobalWidgetLauncherButton(settings.widgetLauncherButton),
      widgetDialog: {
        ...DEFAULT_WIDGET_DIALOG,
        ...(settings.widgetDialog as Partial<ThemeColors>),
      },
      screenshot: {
        ...DEFAULT_SCREENSHOT,
        ...(settings.screenshot as Partial<GlobalScreenshotSettings>),
      },
      // Notification defaults
      notifications: {
        ...DEFAULT_NOTIFICATIONS,
        ...(settings.notifications as Partial<NotificationDefaultSettings>),
      },
      // Reporter notification settings
      reporterNotifications: {
        ...DEFAULT_REPORTER_NOTIFICATIONS,
        ...(settings.reporterNotifications as Partial<ReporterNotificationSettings>),
      },
      // Branding settings
      branding: {
        ...DEFAULT_BRANDING,
        ...(settings.branding as Partial<BrandingSettings>),
      },
      // Admin Console settings
      adminButton: {
        ...DEFAULT_ADMIN_BUTTON,
        ...(settings.adminButton as Partial<AdminButtonColors>),
      },
      // Language defaults
      language: {
        ...DEFAULT_LANGUAGE,
        ...(settings.language as Partial<ProjectLanguageSettings>),
      },
    };
  },

  /**
   * Update multiple settings at once
   */
  async updateAll(updates: Partial<AppSettings>): Promise<AppSettings> {
    const db = getDb();
    const now = new Date().toISOString();

    const stmt = db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );

    for (const [propName, value] of Object.entries(updates)) {
      const dbKey = KEY_MAP[propName];
      if (dbKey && value !== undefined) {
        stmt.run(dbKey, JSON.stringify(value), now);
      }
    }

    return this.getAll();
  },

  /**
   * Update a specific nested setting
   */
  async updateNested<K extends keyof AppSettings>(
    key: K,
    updates: Partial<AppSettings[K]>
  ): Promise<AppSettings> {
    const current = await this.getAll();
    const currentValue = current[key];

    // Merge updates with current value
    const newValue =
      typeof currentValue === 'object' && currentValue !== null
        ? { ...currentValue, ...updates }
        : updates;

    const dbKey = KEY_MAP[key];
    if (dbKey) {
      await this.set(dbKey, newValue);
    }

    return this.getAll();
  },

  /**
   * Delete a setting (reset to default)
   */
  async delete(key: string): Promise<boolean> {
    const db = getDb();
    const result = db.run('DELETE FROM settings WHERE key = ?', [key]);
    return result.changes > 0;
  },
};

// Utilities

/**
 * Convert snake_case to camelCase
 */
function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeGlobalLocalizedField(
  value: unknown,
  field: 'buttonText' | 'tooltipText'
): LocalizedString | null {
  const wrapped =
    field === 'tooltipText' ? wrapLegacyTooltipText(value, true) : wrapLegacyLocalizedString(value);
  return wrapped ?? null;
}

function mergeGlobalWidgetLauncherButton(raw: unknown): GlobalWidgetLauncherButtonSettings {
  const incoming = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const merged: GlobalWidgetLauncherButtonSettings = {
    ...DEFAULT_WIDGET_LAUNCHER_BUTTON,
    ...(incoming as Partial<GlobalWidgetLauncherButtonSettings>),
    buttonText: normalizeGlobalLocalizedField(incoming.buttonText, 'buttonText'),
    tooltipText: normalizeGlobalLocalizedField(incoming.tooltipText, 'tooltipText'),
  };
  return merged;
}
