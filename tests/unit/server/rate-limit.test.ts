import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  apiKeyGenerator,
  clearAllRateLimits,
  dynamicRateLimiter,
  getRateLimitInfo,
  rateLimiter,
  resetRateLimit,
  userKeyGenerator,
} from '../../../src/server/middleware/rate-limit';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';

type TestContext = {
  req: {
    url: string;
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
  header: (name: string, value: string) => void;
  json: (body: unknown, status: number) => Response;
  get: (key: string) => unknown;
  _headers: Map<string, string>;
};

function createContext({
  url = 'https://example.com/api',
  headers = {},
  queryParams = {},
  user,
}: {
  url?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  user?: { id: string };
} = {}): TestContext {
  const headerStore = new Map<string, string>();
  const headerLookup = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    req: {
      url,
      header: (name: string) => headerLookup.get(name.toLowerCase()),
      query: (name: string) => queryParams[name],
    },
    header: (name: string, value: string) => {
      headerStore.set(name, value);
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: Object.fromEntries(headerStore.entries()),
      }),
    get: (key: string) => {
      if (key === 'user') return user;
      return undefined;
    },
    _headers: headerStore,
  };
}

const originalSettingsRepo = { ...settingsRepo };

beforeEach(() => {
  clearAllRateLimits();
});

afterEach(() => {
  Object.assign(settingsRepo, originalSettingsRepo);
});

describe('rateLimiter', () => {
  it('allows requests until the limit is exceeded', async () => {
    const limiter = rateLimiter({
      max: 2,
      window: 60,
      keyGenerator: () => 'key:fixed',
    });

    const next = async () => {
      return;
    };

    const first = createContext();
    await limiter(first as unknown as never, next);
    expect(first._headers.get('X-RateLimit-Remaining')).toBe('1');

    const second = createContext();
    await limiter(second as unknown as never, next);
    expect(second._headers.get('X-RateLimit-Remaining')).toBe('0');

    const third = createContext();
    const response = await limiter(third as unknown as never, next);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(429);
    const payload = await (response as Response).json();
    expect(payload).toMatchObject({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
    });
  });
});

describe('key generators', () => {
  it('uses forwarded-for when present', () => {
    const ctx = createContext({ headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } });
    expect(apiKeyGenerator(ctx as unknown as never)).toBe('ip:203.0.113.1');
  });

  it('uses x-real-ip when forwarded-for is missing', () => {
    const ctx = createContext({ headers: { 'x-real-ip': '192.168.1.10' } });
    expect(userKeyGenerator(ctx as unknown as never)).toBe('ip:192.168.1.10');
  });

  it('uses apiKey when available', () => {
    const ctx = createContext({ queryParams: { apiKey: 'proj_test' } });
    expect(apiKeyGenerator(ctx as unknown as never)).toBe('apikey:proj_test');
  });

  it('uses user id when available', () => {
    const ctx = createContext({ user: { id: 'user_123' } });
    expect(userKeyGenerator(ctx as unknown as never)).toBe('user:user_123');
  });

  it('falls back to hostname when no user or api key', () => {
    const ctx = createContext({ url: 'https://bugpin.local/api' });
    expect(apiKeyGenerator(ctx as unknown as never)).toBe('ip:bugpin.local');
  });
});

describe('dynamicRateLimiter', () => {
  it('enforces settings-based limits', async () => {
    settingsRepo.getAll = async () => ({ rateLimitPerMinute: 1 }) as never;
    const limiter = dynamicRateLimiter({ keyGenerator: () => 'key:dyn' });

    const first = createContext();
    await limiter(first as unknown as never, async () => undefined);

    const second = createContext();
    const response = await limiter(second as unknown as never, async () => undefined);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(429);
    expect(second._headers.get('X-RateLimit-Limit')).toBe('1');
  });
});

describe('rate limit store helpers', () => {
  it('returns rate limit info for an existing key', async () => {
    const limiter = rateLimiter({
      max: 10,
      window: 60,
      keyGenerator: () => 'key:info',
    });

    await limiter(createContext() as unknown as never, async () => undefined);

    const info = await getRateLimitInfo('key:info', 10);
    expect(info).not.toBeNull();
    expect(info?.count).toBe(1);
    expect(info?.remaining).toBe(9);
  });

  it('can reset and clear rate limits', async () => {
    const limiter = rateLimiter({
      max: 10,
      window: 60,
      keyGenerator: () => 'key:reset',
    });

    await limiter(createContext() as unknown as never, async () => undefined);

    expect(await getRateLimitInfo('key:reset', 10)).not.toBeNull();
    resetRateLimit('key:reset');
    expect(await getRateLimitInfo('key:reset', 10)).toBeNull();
    clearAllRateLimits();
    expect(await getRateLimitInfo('key:reset', 10)).toBeNull();
  });
});
