import type { Context, Next } from 'hono';
import { settingsCacheService } from '../services/settings-cache.service.js';

// Types

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  max?: number;
  window?: number; // in seconds
  keyGenerator?: (c: Context) => string;
}

// Rate Limit Store

// In-memory store for rate limiting
// For production with multiple instances, use SQLite or external store
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute
cleanupInterval.unref?.();

// Middleware

/**
 * Rate limiting middleware factory
 *
 * @param options - Rate limit options
 * @returns Middleware function
 */
export function rateLimiter(options: RateLimitOptions = {}) {
  const max = options.max ?? 10; // Default: 10 requests
  const windowSeconds = options.window ?? 60; // Default: 60 seconds
  const windowMs = windowSeconds * 1000;

  const keyGenerator = options.keyGenerator ?? defaultKeyGenerator;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const key = keyGenerator(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
      // Create new entry or reset expired one
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    // Calculate remaining
    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetSeconds.toString());

    // Check if over limit
    if (entry.count > max) {
      c.header('Retry-After', resetSeconds.toString());
      return c.json(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: resetSeconds,
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try to get real IP from headers (for proxied requests)
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',');
    return `ip:${ips[0].trim()}`;
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) {
    return `ip:${realIp}`;
  }

  // Fall back to connection info (may not be available in all environments)
  // For Bun, we can try to get the IP from the request
  const url = new URL(c.req.url);
  return `ip:${url.hostname}`;
}

/**
 * Create key generator for user-based rate limiting
 */
export function userKeyGenerator(c: Context): string {
  const user = c.get('user');
  if (user) {
    return `user:${user.id}`;
  }
  return defaultKeyGenerator(c);
}

/**
 * Create key generator for API key-based rate limiting
 */
export function apiKeyGenerator(c: Context): string {
  // Get API key from header (preferred) or query (deprecated)
  const apiKey = c.req.header('x-api-key') || c.req.query('apiKey');
  if (apiKey) {
    return `apikey:${apiKey}`;
  }
  return defaultKeyGenerator(c);
}

/**
 * Dynamic rate limiter that fetches limit from database settings
 * Uses rateLimitPerMinute setting with 60 second window
 */
export function dynamicRateLimiter(options: { keyGenerator?: (c: Context) => string } = {}) {
  const keyGenerator = options.keyGenerator ?? defaultKeyGenerator;
  const windowMs = 60 * 1000; // 1 minute window

  return async (c: Context, next: Next): Promise<Response | void> => {
    // Fetch current rate limit from settings (cached)
    const settings = await settingsCacheService.getAll();
    const max = settings.rateLimitPerMinute;

    const key = keyGenerator(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    // Calculate remaining
    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetSeconds.toString());

    // Check if over limit
    if (entry.count > max) {
      c.header('Retry-After', resetSeconds.toString());
      return c.json(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retryAfter: resetSeconds,
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Get current rate limit info for a key
 * Uses dynamic rate limit from settings (or provided max for testing)
 */
export async function getRateLimitInfo(
  key: string,
  max?: number,
): Promise<{ count: number; remaining: number; resetAt: number } | null> {
  const entry = rateLimitStore.get(key);
  if (!entry) {
    return null;
  }

  // Use provided max or fetch from settings
  let rateLimit = max;
  if (rateLimit === undefined) {
    const settings = await settingsCacheService.getAll();
    rateLimit = settings.rateLimitPerMinute;
  }

  return {
    count: entry.count,
    remaining: Math.max(0, rateLimit - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for a key (useful for testing)
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limits (useful for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}
