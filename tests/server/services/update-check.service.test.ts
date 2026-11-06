import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { config } from '../../../src/server/config';

const CACHE_KEY = 'update_check_cache';
const SETTING_KEY = 'update_check_enabled';

interface CacheRow {
  latest: string | null;
  tagName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
  nextAttemptAt: string;
  lastError: string | null;
}

interface FakeStore {
  setting: boolean | null;
  cache: CacheRow | null | { __corrupt: true };
}

const originalGet = settingsRepo.get;
const originalSet = settingsRepo.set;
const originalFetch = globalThis.fetch;

let store: FakeStore;
let writes: Array<{ key: string; value: unknown }>;
let fetchCalls: number;
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

function installRepoStubs() {
  settingsRepo.get = async <T>(key: string) => {
    if (key === SETTING_KEY) {
      return store.setting as unknown as T;
    }
    if (key === CACHE_KEY) {
      return store.cache as unknown as T;
    }
    return null;
  };

  settingsRepo.set = async (key: string, value: unknown) => {
    writes.push({ key, value });
    if (key === CACHE_KEY) {
      store.cache = value as CacheRow;
    }
    if (key === SETTING_KEY) {
      store.setting = value as boolean;
    }
  };
}

function installFetchStub() {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1;
    return fetchImpl(input.toString(), init);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeReleasePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tag_name: 'v1.0.7',
    html_url: 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7',
    published_at: '2026-04-22T10:14:00Z',
    prerelease: false,
    draft: false,
    ...overrides,
  };
}

async function loadService() {
  const mod = await import(
    `../../../src/server/services/update-check.service?cachebust=${Math.random()}`
  );
  return mod.updateCheckService;
}

beforeEach(() => {
  store = { setting: true, cache: null };
  writes = [];
  fetchCalls = 0;
  fetchImpl = async () => jsonResponse(makeReleasePayload());
  installRepoStubs();
  installFetchStub();
});

afterEach(() => {
  settingsRepo.get = originalGet;
  settingsRepo.set = originalSet;
  globalThis.fetch = originalFetch;
});

describe('updateCheckService.getStatus', () => {
  it('returns checkEnabled=false when the setting is off', async () => {
    store.setting = false;
    const service = await loadService();
    const result = await service.getStatus();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.checkEnabled).toBe(false);
    }
    expect(fetchCalls).toBe(0);
  });

  it('fetches when cache is cold and persists the response', async () => {
    const service = await loadService();
    const result = await service.getStatus();

    expect(fetchCalls).toBe(1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.latest).toBe('1.0.7');
      expect(result.value.releaseUrl).toBe(
        'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7'
      );
    }
    const cacheWrites = writes.filter((w) => w.key === CACHE_KEY);
    expect(cacheWrites).toHaveLength(1);
    const written = cacheWrites[0]!.value as CacheRow;
    expect(written.latest).toBe('1.0.7');
    expect(written.lastError).toBeNull();
    expect(written.checkedAt).not.toBeNull();
  });

  it('does not fetch when cache is within TTL', async () => {
    store.cache = {
      latest: '1.0.7',
      tagName: 'v1.0.7',
      releaseUrl: 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7',
      publishedAt: '2026-04-22T10:14:00Z',
      checkedAt: new Date().toISOString(),
      nextAttemptAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      lastError: null,
    };

    const service = await loadService();
    const result = await service.getStatus();

    expect(fetchCalls).toBe(0);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.latest).toBe('1.0.7');
    }
  });

  it('refreshes when TTL has elapsed', async () => {
    store.cache = {
      latest: '1.0.5',
      tagName: 'v1.0.5',
      releaseUrl: 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.5',
      publishedAt: '2026-01-01T00:00:00Z',
      checkedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      nextAttemptAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastError: null,
    };

    const service = await loadService();
    const result = await service.getStatus();

    expect(fetchCalls).toBe(1);
    if (result.success) {
      expect(result.value.latest).toBe('1.0.7');
    }
  });

  it('preserves previous cache fields when fetch fails', async () => {
    store.cache = {
      latest: '1.0.5',
      tagName: 'v1.0.5',
      releaseUrl: 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.5',
      publishedAt: '2026-01-01T00:00:00Z',
      checkedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      nextAttemptAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastError: null,
    };
    fetchImpl = async () => jsonResponse({ error: 'boom' }, 503);

    const service = await loadService();
    const result = await service.getStatus();

    expect(result.success).toBe(true);
    const cacheWrite = writes.findLast((w) => w.key === CACHE_KEY)?.value as CacheRow;
    expect(cacheWrite.latest).toBe('1.0.5');
    expect(cacheWrite.releaseUrl).toBe('https://github.com/aranticlabs/bugpin/releases/tag/v1.0.5');
    expect(cacheWrite.lastError).toContain('503');
    if (result.success) {
      expect(result.value.latest).toBe('1.0.5');
    }
  });

  it('returns null latest when there is no prior cache and fetch fails', async () => {
    fetchImpl = async () => {
      throw new Error('network down');
    };

    const service = await loadService();
    const result = await service.getStatus();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.latest).toBeNull();
      expect(result.value.updateAvailable).toBe(false);
    }
    const cacheWrite = writes.findLast((w) => w.key === CACHE_KEY)?.value as CacheRow;
    expect(cacheWrite.latest).toBeNull();
    expect(cacheWrite.lastError).toContain('network down');
  });

  it('skips fetch while inside the failure cooldown window', async () => {
    store.cache = {
      latest: null,
      tagName: null,
      releaseUrl: null,
      publishedAt: null,
      checkedAt: null,
      nextAttemptAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      lastError: 'previous failure',
    };

    const service = await loadService();
    await service.getStatus();
    await service.getStatus();

    expect(fetchCalls).toBe(0);
  });

  it('coalesces concurrent refreshes into one outbound fetch', async () => {
    let resolveFetch: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    fetchImpl = async () => {
      await gate;
      return jsonResponse(makeReleasePayload());
    };

    const service = await loadService();
    const calls = Promise.all([
      service.getStatus(),
      service.getStatus(),
      service.getStatus(),
      service.getStatus(),
      service.getStatus(),
    ]);
    resolveFetch!();
    const results = await calls;

    expect(fetchCalls).toBe(1);
    for (const r of results) {
      if (r.success) {
        expect(r.value.latest).toBe('1.0.7');
      }
    }
  });

  it('refetches after an earlier dedupe completes when cache is stale again', async () => {
    const service = await loadService();
    await service.getStatus();
    expect(fetchCalls).toBe(1);

    // Manually expire the cache
    store.cache = {
      ...(store.cache as CacheRow),
      checkedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      nextAttemptAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };

    await service.getStatus();
    expect(fetchCalls).toBe(2);
  });

  it('treats a corrupt cache row as missing and records the failure', async () => {
    settingsRepo.get = async <T>(key: string) => {
      if (key === SETTING_KEY) return true as unknown as T;
      if (key === CACHE_KEY) return 'not-json-shape' as unknown as T;
      return null as unknown as T;
    };
    fetchImpl = async () => {
      throw new Error('still down');
    };

    const service = await loadService();
    const result = await service.getStatus();

    expect(result.success).toBe(true);
    const cacheWrite = writes.findLast((w) => w.key === CACHE_KEY)?.value as CacheRow;
    expect(cacheWrite.lastError).toContain('still down');
  });

  it('rejects prerelease entries from GitHub', async () => {
    fetchImpl = async () => jsonResponse(makeReleasePayload({ prerelease: true }));

    const service = await loadService();
    const result = await service.getStatus();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.latest).toBeNull();
    }
    const cacheWrite = writes.findLast((w) => w.key === CACHE_KEY)?.value as CacheRow;
    expect(cacheWrite.lastError).toContain('draft or prerelease');
  });

  it('treats fetch abort as a failure', async () => {
    fetchImpl = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };

    const service = await loadService();
    const result = await service.getStatus();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.latest).toBeNull();
    }
    const cacheWrite = writes.findLast((w) => w.key === CACHE_KEY)?.value as CacheRow;
    expect(cacheWrite.lastError).toContain('aborted');
  });

  it('reports updateAvailable when latest is newer than current', async () => {
    fetchImpl = async () => jsonResponse(makeReleasePayload({ tag_name: 'v999.0.0' }));

    const originalVersion = config.version;
    Object.assign(config, { version: '1.0.0' });
    try {
      const service = await loadService();
      const result = await service.getStatus();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.updateAvailable).toBe(true);
      }
    } finally {
      Object.assign(config, { version: originalVersion });
    }
  });
});
