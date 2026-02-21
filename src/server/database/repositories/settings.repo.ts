import { getDb } from '../database.js';
import type {
  AppSettings,
  GlobalWidgetLauncherButtonSettings,
  ThemeColors,
  GlobalScreenshotSettings,
  NotificationDefaultSettings,
  BrandingSettings,
  AdminButtonColors,
} from '@shared/types';

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
  tooltipText: 'Found a bug?',
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
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
};

const DEFAULT_SCREENSHOT: GlobalScreenshotSettings = {
  useScreenCaptureAPI: false,
  maxScreenshotSize: 10,
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
  enforceHttps: 'enforce_https',
  smtpEnabled: 'smtp_enabled',
  smtpConfig: 'smtp_config',
  s3Enabled: 's3_enabled',
  s3Config: 's3_config',
  widgetLauncherButton: 'widget_launcher_button',
  widgetDialog: 'widget_dialog',
  screenshot: 'screenshot',
  notifications: 'notifications',
  branding: 'branding',
  adminButton: 'admin_button',
  emailTemplates: 'email_templates',
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
      [key, jsonValue, now],
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
      // Security settings
      enforceHttps: (settings.enforceHttps as boolean) ?? false,
      // SMTP settings
      smtpEnabled: (settings.smtpEnabled as boolean) ?? false,
      smtpConfig: (settings.smtpConfig as AppSettings['smtpConfig']) ?? {},
      // S3 settings
      s3Enabled: (settings.s3Enabled as boolean) ?? false,
      s3Config: (settings.s3Config as AppSettings['s3Config']) ?? {},
      // Widget settings (nested)
      widgetLauncherButton: {
        ...DEFAULT_WIDGET_LAUNCHER_BUTTON,
        ...(settings.widgetLauncherButton as Partial<GlobalWidgetLauncherButtonSettings>),
      },
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
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
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
    updates: Partial<AppSettings[K]>,
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
