import { z } from 'zod';
import { Result } from '../utils/result.js';

// Validation Utilities

/**
 * Simple URL validation
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Simple email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Hex color validation (#RRGGBB format)
 */
export function isValidHexColor(color: string): boolean {
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  return hexColorRegex.test(color);
}

// Settings Validation Schemas

export const smtpConfigSchema = z
  .object({
    host: z.string().min(1, 'SMTP host is required'),
    port: z.number().int().min(1).max(65535, 'SMTP port must be between 1 and 65535'),
    user: z.string().optional(),
    password: z.string().optional(),
    from: z.string().email('Valid SMTP from address is required'),
  })
  .partial();

export const s3ConfigSchema = z
  .object({
    bucket: z.string().min(1, 'S3 bucket name is required'),
    region: z.string().min(1, 'S3 region is required'),
    accessKeyId: z.string().min(1, 'S3 access key ID is required'),
    secretAccessKey: z.string().min(1, 'S3 secret access key is required'),
    endpoint: z.string().optional(),
  })
  .partial();

// Theme colors schema (used for widget dialog, admin buttons)
export const themeColorsSchema = z
  .object({
    lightButtonColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    lightTextColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    lightButtonHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    lightTextHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkButtonColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkTextColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkButtonHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkTextHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
  })
  .partial();

// Widget launcher button settings schema
export const widgetLauncherButtonSchema = z
  .object({
    position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).optional(),
    buttonText: z.string().nullable().optional(),
    buttonShape: z.enum(['rectangle', 'round']).optional(),
    buttonIcon: z.string().nullable().optional(),
    buttonIconSize: z.number().optional(),
    buttonIconStroke: z.number().optional(),
    theme: z.enum(['auto', 'light', 'dark']).optional(),
    enableHoverScaleEffect: z.boolean().optional(),
    tooltipEnabled: z.boolean().optional(),
    tooltipText: z.string().nullable().optional(),
    lightButtonColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    lightTextColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    lightButtonHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    lightTextHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkButtonColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkTextColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkButtonHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
    darkTextHoverColor: z.string().refine(isValidHexColor, 'Invalid hex color').optional(),
  })
  .partial();

// Screenshot settings schema
export const screenshotSettingsSchema = z
  .object({
    useScreenCaptureAPI: z.boolean().optional(),
    maxScreenshotSize: z.number().int().min(1).max(50).optional(),
  })
  .partial();

// Notification settings schema
export const notificationSettingsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    notifyOnNewReport: z.boolean().optional(),
    notifyOnStatusChange: z.boolean().optional(),
    notifyOnPriorityChange: z.boolean().optional(),
    notifyOnAssignment: z.boolean().optional(),
    notifyOnDeletion: z.boolean().optional(),
  })
  .partial();

// Branding settings schema
export const brandingSettingsSchema = z
  .object({
    primaryColor: z
      .string()
      .refine(isValidHexColor, 'Invalid hex color format. Must be #RRGGBB')
      .optional(),
    logoLightUrl: z.string().nullable().optional(),
    logoDarkUrl: z.string().nullable().optional(),
    iconLightUrl: z.string().nullable().optional(),
    iconDarkUrl: z.string().nullable().optional(),
    faviconLightVersion: z.string().optional(),
    faviconDarkVersion: z.string().optional(),
  })
  .partial();

// Main settings update schema with nested structure
export const settingsUpdateSchema = z.object({
  // System settings
  appName: z
    .string()
    .min(1, 'App name cannot be empty')
    .max(100, 'App name must be 100 characters or less')
    .optional(),
  appUrl: z
    .string()
    .refine((url) => url === '' || isValidUrl(url), 'Invalid app URL format')
    .optional(),
  retentionDays: z
    .number()
    .int()
    .min(0, 'Retention days must be at least 0')
    .max(3650, 'Retention days must be at most 3650')
    .optional(),
  rateLimitPerMinute: z
    .number()
    .int()
    .min(1, 'Rate limit must be at least 1')
    .max(1000, 'Rate limit must be at most 1000')
    .optional(),
  // SMTP settings
  smtpEnabled: z.boolean().optional(),
  smtpConfig: smtpConfigSchema.optional(),
  // S3 settings
  s3Enabled: z.boolean().optional(),
  s3Config: s3ConfigSchema.optional(),
  // Nested widget settings
  widgetLauncherButton: widgetLauncherButtonSchema.optional(),
  widgetDialog: themeColorsSchema.optional(),
  screenshot: screenshotSettingsSchema.optional(),
  // Notification defaults
  notifications: notificationSettingsSchema.optional(),
  // Branding settings
  branding: brandingSettingsSchema.optional(),
  // Admin Console settings
  adminButton: themeColorsSchema.optional(),
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

// Validation Result Helpers

/**
 * Validate input using a Zod schema and return a Result
 */
export function validateWithSchema<T>(schema: z.ZodSchema<T>, input: unknown): Result<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const firstError = result.error.issues[0];
    const field = firstError.path.join('.');
    const message = field ? `${field}: ${firstError.message}` : firstError.message;
    return Result.fail(message, 'VALIDATION_ERROR');
  }

  return Result.ok(result.data);
}

/**
 * Validate SMTP configuration when enabling SMTP
 */
export function validateSmtpConfig(
  smtpConfig: { host?: string; port?: number; from?: string } | undefined,
): Result<void> {
  if (!smtpConfig?.host || smtpConfig.host.trim().length === 0) {
    return Result.fail('SMTP host is required when enabling SMTP', 'INVALID_SMTP_CONFIG');
  }
  if (!smtpConfig?.port || smtpConfig.port < 1 || smtpConfig.port > 65535) {
    return Result.fail('SMTP port must be between 1 and 65535', 'INVALID_SMTP_CONFIG');
  }
  if (!smtpConfig?.from || !isValidEmail(smtpConfig.from)) {
    return Result.fail('Valid SMTP from address is required', 'INVALID_SMTP_CONFIG');
  }
  return Result.ok(undefined);
}

/**
 * Validate S3 configuration when enabling S3
 */
export function validateS3Config(
  s3Config:
    | { bucket?: string; region?: string; accessKeyId?: string; secretAccessKey?: string }
    | undefined,
): Result<void> {
  if (!s3Config?.bucket || s3Config.bucket.trim().length === 0) {
    return Result.fail('S3 bucket name is required when enabling S3', 'INVALID_S3_CONFIG');
  }
  if (!s3Config?.region || s3Config.region.trim().length === 0) {
    return Result.fail('S3 region is required when enabling S3', 'INVALID_S3_CONFIG');
  }
  if (!s3Config?.accessKeyId || s3Config.accessKeyId.trim().length === 0) {
    return Result.fail('S3 access key ID is required when enabling S3', 'INVALID_S3_CONFIG');
  }
  if (!s3Config?.secretAccessKey || s3Config.secretAccessKey.trim().length === 0) {
    return Result.fail('S3 secret access key is required when enabling S3', 'INVALID_S3_CONFIG');
  }
  return Result.ok(undefined);
}
