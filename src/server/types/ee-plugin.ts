import type { Hono } from 'hono';
import type { Report, WebhookEvent, EmailTemplateType, User } from '@shared/types';
import type { Result } from '../utils/result.js';

/**
 * Storage provider interface for S3 or other storage backends
 */
export interface StorageProvider {
  upload(options: StorageUploadOptions): Promise<Result<StorageUploadResult>>;
  delete(key: string): Promise<Result<void>>;
  exists(key: string): Promise<Result<boolean>>;
  testConnection(): Promise<Result<void>>;
  getStatus(): Promise<Result<StorageStatus>>;
}

export interface StorageUploadOptions {
  key: string;
  body: Buffer | Uint8Array | ReadableStream;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageUploadResult {
  key: string;
  url: string;
  bucket: string;
}

export interface StorageStatus {
  enabled: boolean;
  configured: boolean;
  bucket?: string;
  region?: string;
  endpoint?: string;
}

/**
 * Webhook service interface
 */
export interface WebhookService {
  onReportCreated(report: Report): Promise<void>;
  onReportUpdated(
    report: Report,
    changes: Record<string, { old: unknown; new: unknown }>,
  ): Promise<void>;
  onReportDeleted(report: Report): Promise<void>;
  trigger(
    projectId: string,
    event: WebhookEvent,
    report: Report,
    changes?: Record<string, { old: unknown; new: unknown }>,
  ): Promise<void>;
}

/**
 * API tokens service interface
 */
export interface ApiTokenService {
  isApiAccessEnabled(): boolean;
  validateToken(rawToken: string): Promise<Result<ApiTokenValidationResult>>;
  hasScope(token: ApiTokenInfo, requiredScope: string): boolean;
}

export interface ApiTokenInfo {
  id: string;
  userId: string;
  name: string;
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface ApiTokenValidationResult extends ApiTokenInfo {
  user: User;
}

/**
 * Custom email template
 */
export interface CustomEmailTemplate {
  subject: string;
  html: string;
}

/**
 * Branding service interface for admin branding features
 */
export interface AdminBrandingService {
  uploadLogo(mode: 'light' | 'dark', file: BrandingFileData): Promise<Result<string>>;
  uploadFavicon(mode: 'light' | 'dark', file: BrandingFileData): Promise<Result<FaviconSet>>;
  uploadIcon(mode: 'light' | 'dark', file: BrandingFileData): Promise<Result<string>>;
  updatePrimaryColor(color: string): Promise<Result<void>>;
  updateAdminThemeColors(colors: Record<string, string>): Promise<Result<void>>;
  resetToDefaults(type?: 'logo' | 'icon' | 'favicon' | 'color'): Promise<Result<void>>;
}

export interface BrandingFileData {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface FaviconSet {
  ico: string;
  appleTouchIcon: string;
  androidChrome192: string;
  androidChrome512: string;
  version: string;
}

/**
 * White-label configuration for removing BugPin branding
 */
export interface WhiteLabelConfig {
  enabled: boolean;
  hideFooterBranding: boolean;
  hideEmailBranding: boolean;
  hidePoweredBy: boolean;
  customCopyright?: string;
}

/**
 * White-label service interface
 */
export interface WhiteLabelService {
  getConfig(): Promise<WhiteLabelConfig>;
  updateConfig(updates: Partial<Omit<WhiteLabelConfig, 'enabled'>>): Promise<void>;
  resetConfig(): Promise<void>;
}

/**
 * EE Hooks - extension points for EE features
 *
 * CE code calls these hooks at appropriate points.
 * When EE is available and licensed, these hooks invoke EE functionality.
 * When EE is not available, these are no-ops or return defaults.
 */
export interface EEHooks {
  // Webhook hooks
  onReportCreated(report: Report): Promise<void>;
  onReportUpdated(
    report: Report,
    changes: Record<string, { old: unknown; new: unknown }>,
  ): Promise<void>;
  onReportDeleted(report: Report): Promise<void>;

  // Storage provider hook
  getStorageProvider(): StorageProvider | null;

  // Email template hook
  getCustomEmailTemplate(templateType: EmailTemplateType): Promise<CustomEmailTemplate | null>;

  // API token hooks
  getApiTokenService(): ApiTokenService | null;

  // Admin branding hooks
  getAdminBrandingService(): AdminBrandingService | null;

  // White-label hooks
  getWhiteLabelService(): WhiteLabelService | null;
}

/**
 * EE Plugin interface
 *
 * The EE module exports a plugin that implements this interface.
 * CE uses the plugin to integrate EE features.
 */
export interface EEPlugin {
  /**
   * Plugin name for logging/debugging
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Initialize the plugin
   * Called once at server startup when EE is available
   */
  initialize(): Promise<void>;

  /**
   * Get EE routes to mount on the API router
   * Returns Hono app instances keyed by path prefix
   */
  getRoutes(): Map<string, Hono>;

  /**
   * Get EE hooks for extension points
   */
  getHooks(): EEHooks;

  /**
   * Check if a specific feature is available and licensed
   */
  hasFeature(feature: string): boolean;

  /**
   * Check if any EE license is active
   */
  isLicensed(): boolean;
}

/**
 * Create default no-op hooks for when EE is not available
 */
export function createDefaultHooks(): EEHooks {
  return {
    // Webhook hooks - no-op
    onReportCreated: async () => {},
    onReportUpdated: async () => {},
    onReportDeleted: async () => {},

    // Storage provider - not available
    getStorageProvider: () => null,

    // Email template - not available (use default)
    getCustomEmailTemplate: async () => null,

    // API token service - not available
    getApiTokenService: () => null,

    // Admin branding service - not available
    getAdminBrandingService: () => null,

    // White-label service - not available
    getWhiteLabelService: () => null,
  };
}
