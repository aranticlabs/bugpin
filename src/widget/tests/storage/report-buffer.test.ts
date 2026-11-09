import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
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
        current.filter((fn) => fn !== handler)
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

  it('preserves recording metadata through offline storage and retry', async () => {
    const { bufferReport, getPendingCount, getPendingReports, clearBuffer, syncPendingReports } =
      await import('../../storage/report-buffer');
    await clearBuffer();

    const id = await bufferReport({
      submissionId: 'submission-1',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
      media: [
        {
          blob: new Blob([new Uint8Array([1])], { type: 'video/webm' }),
          mimeType: 'video/webm',
          source: 'recording',
          recordingQuality: 'high',
          timestamp: new Date('2026-11-08T14:00:00Z'),
          width: 1920,
          height: 1080,
          durationMs: 24000,
        },
      ],
    });

    const count = await getPendingCount();
    const pending = await getPendingReports();

    expect(count).toBe(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].media?.[0].recordingQuality).toBe('high');
    let submittedMetadata: unknown;
    globalThis.navigator = { onLine: true } as Navigator;
    globalThis.fetch = (async (_input, init) => {
      submittedMetadata = JSON.parse((init?.body as FormData).get('data') as string).mediaMetadata;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    expect(await syncPendingReports()).toMatchObject({ synced: 1, failed: 0 });
    expect(submittedMetadata).toEqual([
      {
        filename: 'recording-0.webm',
        recordingQuality: 'high',
        capturedAt: '2026-11-08T14:00:00.000Z',
        width: 1920,
        height: 1080,
        durationMs: 24000,
      },
    ]);
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
      submissionId: 'submission-1',
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
      submissionId: 'submission-1',
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
    const consoleError = spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        await expect(syncPendingReports()).resolves.toMatchObject({ synced: 0 });
        now += 600000;
      }

      expect(await getPendingCount()).toBe(0);
      expect(consoleError).toHaveBeenCalledWith(
        '[BugPin] Max retries exceeded, removing report:',
        expect.any(String)
      );
    } finally {
      Date.now = originalNow;
      consoleError.mockRestore();
    }
  });

  it('submits a quota-limited buffered report without its video', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();

    await bufferReport({
      submissionId: 'submission-1',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
      media: [
        { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' },
        { dataUrl: 'data:video/mp4;base64,AAAAAGZ0eXA=', mimeType: 'video/mp4' },
      ],
    });

    globalThis.navigator = { onLine: true } as Navigator;
    const mediaTypes: string[][] = [];
    let requestCount = 0;
    globalThis.fetch = (async (_input, init) => {
      const formData = init?.body as FormData;
      mediaTypes.push(
        formData.getAll('media').map((value) => (value instanceof File ? value.type : ''))
      );
      requestCount++;
      if (requestCount === 1) {
        return new Response(
          JSON.stringify({
            error: 'VIDEO_QUOTA_EXCEEDED',
            message: 'The daily video upload limit has been reached for this project.',
          }),
          { status: 429 }
        );
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const result = await syncPendingReports();

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(mediaTypes).toEqual([['image/png', 'video/mp4'], ['image/png']]);
    expect(await getPendingCount()).toBe(0);
  });

  it('starts and stops auto sync', async () => {
    const { startAutoSync, stopAutoSync } = await import('../../storage/report-buffer');
    // Importing api/submit starts auto sync, so another test file may have left an interval running.
    stopAutoSync();

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
    const { bufferReport, clearBuffer, getPendingCount, startAutoSync, stopAutoSync } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      submissionId: 'submission-1',
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

  it('reuses the stored submission ID on every retry', async () => {
    const { bufferReport, syncPendingReports, getPendingReports, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      submissionId: 'submission-retry',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    globalThis.navigator = { onLine: true } as Navigator;
    const sentIds: string[] = [];
    let attempt = 0;
    globalThis.fetch = (async (_input, init) => {
      const data = JSON.parse((init?.body as FormData).get('data') as string);
      sentIds.push(data.submissionId);
      attempt++;
      return attempt === 1
        ? new Response(JSON.stringify({ message: 'Bad gateway' }), { status: 502 })
        : new Response(null, { status: 200 });
    }) as typeof fetch;

    const originalNow = Date.now;
    let now = Date.now();
    Date.now = () => now;
    try {
      await syncPendingReports();
      expect((await getPendingReports())[0]?.submissionId).toBe('submission-retry');
      now += 600000;
      await syncPendingReports();
    } finally {
      Date.now = originalNow;
    }

    expect(sentIds).toEqual(['submission-retry', 'submission-retry']);
    expect(await getPendingReports()).toEqual([]);
  });

  it('assigns and keeps a submission ID for reports buffered without one', async () => {
    const { bufferReport, syncPendingReports, getPendingReports, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    } as Parameters<typeof bufferReport>[0]);

    globalThis.navigator = { onLine: true } as Navigator;
    const sentIds: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      sentIds.push(JSON.parse((init?.body as FormData).get('data') as string).submissionId);
      return new Response(null, { status: 503 });
    }) as typeof fetch;

    await syncPendingReports();

    const stored = (await getPendingReports())[0]?.submissionId;
    expect(stored).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sentIds).toEqual([stored as string]);
  });

  it('treats a duplicate submission response as success', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      submissionId: 'submission-1',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    globalThis.navigator = { onLine: true } as Navigator;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, reportId: 'rpt_1', duplicate: true }), {
        status: 200,
      })) as unknown as typeof fetch;

    expect(await syncPendingReports()).toEqual({ synced: 1, failed: 0 });
    expect(await getPendingCount()).toBe(0);
  });

  it('does not start a second sync while one is in flight', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      submissionId: 'submission-1',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    globalThis.navigator = { onLine: true } as Navigator;
    let releaseUpload!: () => void;
    const uploadDone = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      await uploadDone;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const first = syncPendingReports();
    for (let i = 0; i < 10 && requests === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const second = await syncPendingReports();
    releaseUpload();

    expect(second).toEqual({ synced: 0, failed: 0 });
    expect(await first).toEqual({ synced: 1, failed: 0 });
    expect(requests).toBe(1);
    expect(await getPendingCount()).toBe(0);
  });

  it('skips the sync while another tab holds the sync lock', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      submissionId: 'submission-1',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    const requestedLocks: Array<{ name: string; ifAvailable?: boolean }> = [];
    let lockHeld = true;
    const locks = {
      request: async (
        name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => unknown
      ) => {
        requestedLocks.push({ name, ifAvailable: options.ifAvailable });
        return callback(lockHeld ? null : ({ name, mode: 'exclusive' } as Lock));
      },
    };
    globalThis.navigator = { onLine: true, locks } as unknown as Navigator;
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    expect(await syncPendingReports()).toEqual({ synced: 0, failed: 0 });
    expect(requests).toBe(0);
    expect(await getPendingCount()).toBe(1);

    lockHeld = false;
    expect(await syncPendingReports()).toEqual({ synced: 1, failed: 0 });
    expect(requests).toBe(1);
    expect(requestedLocks).toEqual([
      { name: 'bugpin-report-sync', ifAvailable: true },
      { name: 'bugpin-report-sync', ifAvailable: true },
    ]);
  });

  it('syncs without the lock when the lock request is rejected', async () => {
    const { bufferReport, syncPendingReports, getPendingCount, clearBuffer } =
      await import('../../storage/report-buffer');
    await clearBuffer();
    await bufferReport({
      submissionId: 'submission-1',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: { url: 'https://example.com' },
    });

    const locks = {
      request: async () => {
        throw new DOMException('Opaque origin', 'SecurityError');
      },
    };
    globalThis.navigator = { onLine: true, locks } as unknown as Navigator;
    globalThis.fetch = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch;

    expect(await syncPendingReports()).toEqual({ synced: 1, failed: 0 });
    expect(await getPendingCount()).toBe(0);
  });
});
