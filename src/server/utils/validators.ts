import { z } from 'zod';
import { Result } from '../utils/result.js';

// Validation Utilities

/**
 * Simple URL validation
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed}`;
}

/**
 * True for absolute http(s) URLs with a conventional host (registrable name, localhost, or IP).
 * Does not use {@link normalizeUrl}; bare host strings are invalid.
 */
function isValidUrlHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) {
    return false;
  }
  if (h === 'localhost') {
    return true;
  }
  if (h.includes('.')) {
    return true;
  }
  // IPv4
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    return true;
  }
  // IPv6 (WHATWG hostname omits brackets)
  if (h.includes(':')) {
    return true;
  }
  return false;
}

export function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return isValidUrlHost(parsed.hostname);
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
  smtpConfig: { host?: string; port?: number; from?: string } | undefined
): Result<void> {
  if (!smtpConfig?.host || smtpConfig.host.trim().length === 0) {
    return Result.fail('SMTP host is required when enabling SMTP', 'INVALID_SMTP_CONFIG');
  }
  // The email service falls back to port 587 when none is stored.
  const port = smtpConfig.port ?? 587;
  if (port < 1 || port > 65535) {
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
    { bucket?: string; region?: string; accessKeyId?: string; secretAccessKey?: string } | undefined
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
