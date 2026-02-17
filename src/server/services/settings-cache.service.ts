import type { AppSettings } from '@shared/types';
import type { ISettingsRepository } from '../database/repositories/interfaces.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';

export interface ISettingsCacheService {
  getAll(): Promise<AppSettings>;
  invalidate(): void;
  warmup(): Promise<void>;
}

/**
 * Settings cache service with TTL expiry and cache stampede prevention.
 * Eliminates database queries on every request (critical performance optimization).
 */
export class SettingsCacheService implements ISettingsCacheService {
  private cache: { data: AppSettings; expiresAt: number } | null = null;
  private pending: Promise<AppSettings> | null = null;
  private readonly ttlMs: number;

  constructor(
    private readonly settingsRepo: ISettingsRepository,
    ttlSeconds: number = 300, // 5 minutes default
  ) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Get all settings from cache or database.
   * Automatically deduplicates concurrent requests to prevent cache stampede.
   */
  async getAll(): Promise<AppSettings> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    // Deduplicate concurrent requests (prevent cache stampede)
    if (this.pending) {
      return this.pending;
    }

    // Fetch fresh data
    this.pending = this.settingsRepo
      .getAll()
      .then((data) => {
        // Use fresh timestamp for cache expiry (not stale 'now')
        this.cache = { data, expiresAt: Date.now() + this.ttlMs };
        this.pending = null;
        return data;
      })
      .catch((error) => {
        // Critical: Reset pending to allow retry on next call
        this.pending = null;
        throw error;
      });

    return this.pending;
  }

  /**
   * Invalidate cached settings (forces next getAll() to fetch from DB).
   * Call this when settings are updated via the Admin Portal.
   */
  invalidate(): void {
    this.cache = null;
    this.pending = null;
  }

  /**
   * Warm up the cache on server startup.
   * Fails fast if database is unavailable.
   */
  async warmup(): Promise<void> {
    await this.getAll();
  }
}

// Singleton instance for application-wide use
export const settingsCacheService = new SettingsCacheService(settingsRepo);
