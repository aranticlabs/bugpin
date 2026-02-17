import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { SettingsCacheService } from '../../../src/server/services/settings-cache.service';
import type { ISettingsRepository } from '../../../src/server/database/repositories/interfaces';
import type { AppSettings } from '../../../src/shared/types';

// Mock settings data
const mockSettings: AppSettings = {
  appName: 'BugPin Test',
  appUrl: 'http://localhost:3000',
  retentionDays: 90,
  rateLimitPerMinute: 60,
  sessionMaxAgeDays: 7,
  invitationExpirationDays: 7,
  enforceHttps: false,
  smtpEnabled: false,
  smtpConfig: {},
  s3Enabled: false,
  s3Config: {},
  widgetLauncherButton: {} as any,
  widgetDialog: {} as any,
  screenshot: {} as any,
  notifications: {} as any,
  branding: {} as any,
  adminButton: {} as any,
};

describe('SettingsCacheService', () => {
  let mockSettingsRepo: ISettingsRepository;
  let cache: SettingsCacheService;

  beforeEach(() => {
    // Reset mock before each test
    mockSettingsRepo = {
      getAll: mock(() => Promise.resolve(mockSettings)),
      get: mock(() => Promise.resolve(null)),
      set: mock(() => Promise.resolve()),
      updateAll: mock(() => Promise.resolve(mockSettings)),
    };
    cache = new SettingsCacheService(mockSettingsRepo, 1); // 1 second TTL for testing
  });

  describe('getAll()', () => {
    it('should fetch from DB on first call', async () => {
      const result = await cache.getAll();

      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockSettings);
    });

    it('should return cached data on second call within TTL', async () => {
      await cache.getAll();
      await cache.getAll();

      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1); // Only once
    });

    it('should fetch fresh data after TTL expires', async () => {
      await cache.getAll();

      // Wait for TTL to expire (1 second)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await cache.getAll();

      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(2); // Called twice
    });

    it('should deduplicate concurrent requests (prevent cache stampede)', async () => {
      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => cache.getAll());
      await Promise.all(promises);

      // Should only call DB once (all shared the same pending promise)
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate concurrent requests after cache expiry', async () => {
      // First call - cache populated
      await cache.getAll();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Fire 10 concurrent requests after expiry
      const promises = Array.from({ length: 10 }, () => cache.getAll());
      await Promise.all(promises);

      // Should call DB twice total (once initial, once after expiry - but only once for concurrent requests)
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(2);
    });

    it('should handle DB errors gracefully', async () => {
      const errorMock = mock(() => Promise.reject(new Error('Database error')));
      mockSettingsRepo.getAll = errorMock;
      const errorCache = new SettingsCacheService(mockSettingsRepo, 1);

      await expect(errorCache.getAll()).rejects.toThrow('Database error');
    });
  });

  describe('invalidate()', () => {
    it('should clear cache and force next getAll() to fetch from DB', async () => {
      // First call - populates cache
      await cache.getAll();
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1);

      // Invalidate cache
      cache.invalidate();

      // Second call - should fetch from DB again
      await cache.getAll();
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(2);
    });

    it('should not affect pending requests', async () => {
      // Start a request but don't await
      const promise = cache.getAll();

      // Invalidate while request is pending
      cache.invalidate();

      // Await the original request
      await promise;

      // Should still have called DB only once
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('warmup()', () => {
    it('should populate cache on warmup', async () => {
      await cache.warmup();

      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1);

      // Subsequent call should use cache
      await cache.getAll();
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1); // Still only once
    });

    it('should propagate DB errors during warmup', async () => {
      const errorMock = mock(() => Promise.reject(new Error('Database unavailable')));
      mockSettingsRepo.getAll = errorMock;
      const errorCache = new SettingsCacheService(mockSettingsRepo, 1);

      await expect(errorCache.warmup()).rejects.toThrow('Database unavailable');
    });
  });

  describe('TTL behavior', () => {
    it('should respect custom TTL values', async () => {
      const shortCache = new SettingsCacheService(mockSettingsRepo, 0.1); // 100ms TTL

      await shortCache.getAll();
      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait for expiry
      await shortCache.getAll();

      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(2);
    });

    it('should use default TTL of 300 seconds', async () => {
      const defaultCache = new SettingsCacheService(mockSettingsRepo);

      await defaultCache.getAll();
      await defaultCache.getAll();

      // Should use cache (no expiry in test timeframe)
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache stampede prevention', () => {
    it('should handle mixed cached and expired concurrent requests', async () => {
      // Populate cache
      await cache.getAll();

      // Wait for partial TTL expiry
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Some requests before expiry, some after
      const beforeExpiry1 = cache.getAll();
      await new Promise((resolve) => setTimeout(resolve, 600)); // Total: 1200ms (expired)
      const afterExpiry = cache.getAll();
      const afterExpiry2 = cache.getAll();

      await Promise.all([beforeExpiry1, afterExpiry, afterExpiry2]);

      // Should call DB twice: once initial, once after expiry (deduplicated)
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(2);
    });

    it('should handle rapid invalidation and re-fetch', async () => {
      await cache.getAll();
      cache.invalidate();
      await cache.getAll();
      cache.invalidate();
      await cache.getAll();

      // Should call DB three times (initial + 2 invalidations)
      expect(mockSettingsRepo.getAll).toHaveBeenCalledTimes(3);
    });
  });

  describe('Data consistency', () => {
    it('should return the same data object for cache hits', async () => {
      const result1 = await cache.getAll();
      const result2 = await cache.getAll();

      // Should be the exact same reference (cached)
      expect(result1).toBe(result2);
    });

    it('should return different data objects after invalidation', async () => {
      // Update mock to return new object each time
      mockSettingsRepo.getAll = mock(() => Promise.resolve({ ...mockSettings }));
      const freshCache = new SettingsCacheService(mockSettingsRepo, 1);

      const result1 = await freshCache.getAll();
      freshCache.invalidate();
      const result2 = await freshCache.getAll();

      // Different objects (fresh fetch)
      expect(result1).not.toBe(result2);
      // But equal values
      expect(result1).toEqual(result2);
    });

    it('should handle settings updates correctly', async () => {
      const updatedSettings = { ...mockSettings, appName: 'BugPin Updated' };

      // First fetch
      await cache.getAll();

      // Simulate settings update
      mockSettingsRepo.getAll = mock(() => Promise.resolve(updatedSettings));

      // Should still return old cached data
      const cachedResult = await cache.getAll();
      expect(cachedResult.appName).toBe('BugPin Test');

      // After invalidation, should get new data
      cache.invalidate();
      const freshResult = await cache.getAll();
      expect(freshResult.appName).toBe('BugPin Updated');
    });
  });
});
