import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const originalIndexedDB = globalThis.indexedDB;
const originalIDBDatabase = globalThis.IDBDatabase;
const originalIDBTransaction = globalThis.IDBTransaction;
const originalIDBObjectStore = globalThis.IDBObjectStore;
const originalIDBIndex = globalThis.IDBIndex;
const originalIDBRequest = globalThis.IDBRequest;
const originalIDBCursor = globalThis.IDBCursor;

function setWidgetEnv() {
  const listeners = new Map<string, Array<() => void>>();
  globalThis.window = {
    addEventListener: (event: string, handler: () => void) => {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
    },
    removeEventListener: () => undefined,
  } as unknown as typeof globalThis.window;

  globalThis.navigator = {
    onLine: false,
  } as Navigator;

  globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as unknown as typeof clearInterval;
}

const baseMetadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop' as const, os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};

beforeEach(() => {
  setWidgetEnv();
  installFakeIndexedDB();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.navigator = originalNavigator;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
  globalThis.indexedDB = originalIndexedDB;
  globalThis.IDBDatabase = originalIDBDatabase;
  globalThis.IDBTransaction = originalIDBTransaction;
  globalThis.IDBObjectStore = originalIDBObjectStore;
  globalThis.IDBIndex = originalIDBIndex;
  globalThis.IDBRequest = originalIDBRequest;
  globalThis.IDBCursor = originalIDBCursor;
});

describe('submit API (offline + errors)', () => {
  it('buffers report immediately when offline', async () => {
    const mockFetch = () => {
      throw new Error('fetch should not be called');
    };
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { submitReport } = await import('../../api/submit');
    const { clearBuffer, getPendingCount } = await import('../../storage/report-buffer');
    await clearBuffer();

    const result = await submitReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('back online');
    expect(await getPendingCount()).toBe(1);
  });

  it('buffers report when fetch throws network error', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    const mockFetch = () => {
      throw new TypeError('fetch failed');
    };
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { submitReport } = await import('../../api/submit');
    const { clearBuffer, getPendingCount } = await import('../../storage/report-buffer');
    await clearBuffer();

    const result = await submitReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('connection');
    expect(await getPendingCount()).toBe(1);
  });

  it('throws for server errors', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    const mockFetch = async () =>
      new Response(JSON.stringify({ success: false, message: 'Nope' }), { status: 400 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { submitReport } = await import('../../api/submit');
    const { clearBuffer, getPendingCount } = await import('../../storage/report-buffer');
    await clearBuffer();

    await expect(
      submitReport({
        apiKey: 'proj_key',
        serverUrl: 'https://example.com',
        title: 'Bug report',
        priority: 'medium',
        metadata: baseMetadata,
      }),
    ).rejects.toThrow('Nope');
    expect(await getPendingCount()).toBe(0);
  });
});

describe('submit API (media + config)', () => {
  it('uploads media attachments and annotations', async () => {
    globalThis.navigator = { onLine: true } as Navigator;

    let capturedNames: string[] = [];
    let capturedData: { mediaCount?: number; mediaAnnotations?: unknown[] } | null = null;

    const mockFetch = async (_url: URL | RequestInfo, options?: RequestInit) => {
      const body = (options?.body ?? null) as FormData | null;
      if (body) {
        const entries = body.getAll('media');
        capturedNames = entries.map((entry) => (entry as File).name ?? 'unknown');
        const rawData = body.get('data');
        if (typeof rawData === 'string') {
          capturedData = JSON.parse(rawData);
        }
      }

      return new Response(JSON.stringify({ success: true, reportId: 'rpt_2' }), { status: 200 });
    };
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { submitReport } = await import('../../api/submit');

    await submitReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
      media: [
        {
          dataUrl: 'data:image/jpeg;base64,AA==',
          mimeType: 'image/jpeg',
          annotations: { note: 'anno' },
        },
        {
          dataUrl: 'data:image/png;base64,AA==',
          mimeType: 'image/png',
        },
      ],
    });

    expect(capturedNames.some((name) => name.startsWith('screenshot-0.'))).toBe(true);
    expect(capturedNames.some((name) => name.startsWith('screenshot-1.'))).toBe(true);
    expect((capturedData as unknown as { mediaCount?: number })?.mediaCount).toBe(2);
    expect(
      (capturedData as unknown as { mediaAnnotations?: unknown[] })?.mediaAnnotations?.length,
    ).toBe(1);
  });

  it('throws when widget config fetch fails', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ success: false, message: 'No config' }), { status: 500 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { fetchWidgetConfig } = await import('../../api/submit');

    await expect(fetchWidgetConfig('proj_key', 'https://example.com')).rejects.toThrow('No config');
  });
});
