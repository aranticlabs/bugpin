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

class BasicEvent {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
}

class BasicCustomEvent<T = unknown> extends BasicEvent {
  detail?: T;
  constructor(type: string, init?: { detail?: T }) {
    super(type);
    this.detail = init?.detail;
  }
}

function setupWidgetEnv() {
  const listeners = new Map<string, Array<(event?: unknown) => void>>();

  globalThis.window = {
    Event: BasicEvent,
    CustomEvent: BasicCustomEvent,
    addEventListener: (event: string, handler: (event?: unknown) => void) => {
      const current = listeners.get(event) ?? [];
      current.push(handler);
      listeners.set(event, current);
    },
    removeEventListener: (event: string, handler: (event?: unknown) => void) => {
      const current = listeners.get(event);
      if (!current) return;
      listeners.set(
        event,
        current.filter((fn) => fn !== handler),
      );
    },
    dispatchEvent: (event: string | { type?: string }, payload?: unknown) => {
      const eventName = typeof event === 'string' ? event : event?.type;
      if (!eventName) return false;
      const current = listeners.get(eventName) ?? [];
      const payloadValue = typeof event === 'string' ? payload : event;
      current.forEach((handler) => handler(payloadValue));
      return current.length > 0;
    },
  } as unknown as typeof globalThis.window;

  globalThis.navigator = {
    onLine: false,
  } as Navigator;

  globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as unknown as typeof clearInterval;
}

beforeEach(() => {
  setupWidgetEnv();
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

describe('report buffer', () => {
  it('returns empty results when IndexedDB is unavailable', async () => {
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    globalThis.IDBDatabase = undefined as unknown as typeof IDBDatabase;
    globalThis.IDBTransaction = undefined as unknown as typeof IDBTransaction;
    globalThis.IDBObjectStore = undefined as unknown as typeof IDBObjectStore;
    globalThis.IDBIndex = undefined as unknown as typeof IDBIndex;
    globalThis.IDBRequest = undefined as unknown as typeof IDBRequest;
    globalThis.IDBCursor = undefined as unknown as typeof IDBCursor;

    const { getPendingReports, getPendingCount, removeBufferedReport, clearBuffer } =
      await import('../../storage/report-buffer');
    const reports = await getPendingReports();
    const count = await getPendingCount();

    expect(reports).toEqual([]);
    expect(count).toBe(0);

    await removeBufferedReport('missing');
    await clearBuffer();
  });

  it('buffers reports and returns count', async () => {
    const { bufferReport, getPendingCount, getPendingReports, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();

    const id = await bufferReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    const count = await getPendingCount();
    const pending = await getPendingReports();

    expect(count).toBe(1);
    expect(pending[0].id).toBe(id);
  });

  it('skips sync when offline', async () => {
    const { syncPendingReports } = await import('../../storage/report-buffer');
    const result = await syncPendingReports();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('syncs pending reports and clears buffer', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();

    await bufferReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    globalThis.navigator = { onLine: true } as Navigator;
    const mockFetch = async () => new Response(null, { status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await syncPendingReports();
    expect(result.synced).toBe(1);
    expect(await getPendingCount()).toBe(0);
  });

  it('removes report after max retry attempts', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();

    await bufferReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    globalThis.navigator = { onLine: true } as Navigator;
    const mockFetch = async () =>
      new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const originalNow = Date.now;
    let now = Date.now();
    Date.now = () => now;

    for (let attempt = 0; attempt < 6; attempt++) {
      await syncPendingReports();
      now += 600000;
    }

    expect(await getPendingCount()).toBe(0);

    Date.now = originalNow;
  });

  it('starts and stops auto sync', async () => {
    const { startAutoSync, stopAutoSync } = await import('../../storage/report-buffer');

    let intervalStarted = false;
    let intervalCleared = false;
    globalThis.setInterval = (() => {
      intervalStarted = true;
      return 1 as never;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = (() => {
      intervalCleared = true;
      return undefined as never;
    }) as unknown as typeof clearInterval;

    startAutoSync();
    stopAutoSync();

    expect(intervalStarted).toBe(true);
    expect(intervalCleared).toBe(true);
  });

  it('syncs pending reports when online event fires', async () => {
    const { bufferReport, getPendingCount, startAutoSync, stopAutoSync } =
      await import('../../storage/report-buffer');
    await bufferReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    globalThis.navigator = { onLine: true } as Navigator;
    const mockFetch = async () => new Response(null, { status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    startAutoSync();
    window.dispatchEvent(new window.Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await getPendingCount()).toBe(0);
    stopAutoSync();
  });
});
