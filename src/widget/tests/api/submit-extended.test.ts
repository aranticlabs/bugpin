import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';
import { installMockXMLHttpRequest } from '../helpers/xhr';
import { t } from '../../i18n/index';

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
const originalXMLHttpRequest = globalThis.XMLHttpRequest;

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
  globalThis.XMLHttpRequest = originalXMLHttpRequest;
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

    expect(result).toMatchObject({ success: true, queued: true, message: t('submit.queued') });
    expect(await getPendingCount()).toBe(1);
  });

  it('queues the report when neither the upload nor the server can be reached', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest((request) => request.fail());
    const probes: Array<{ url: string; cache?: RequestCache }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      probes.push({ url: String(input), cache: init?.cache });
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const { submitReport } = await import('../../api/submit');
    const { clearBuffer, getPendingReports } = await import('../../storage/report-buffer');
    await clearBuffer();

    const result = await submitReport({
      submissionId: 'submission-offline',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    expect(result).toMatchObject({ success: true, queued: true, message: t('submit.queued') });
    expect(probes[0]).toEqual({
      url: 'https://example.com/api/widget/config/proj_key',
      cache: 'no-store',
    });
    const pending = await getPendingReports();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.submissionId).toBe('submission-offline');
  });

  it('reports a rejected upload without queueing it when the server is reachable', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest((request) => request.fail());
    let probes = 0;
    globalThis.fetch = (async () => {
      probes++;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;

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
      })
    ).rejects.toThrow(t('submit.error.rejected'));
    expect(probes).toBe(1);
    expect(await getPendingCount()).toBe(0);
  });

  it('treats a server error status from the probe as a reachable server', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest((request) => request.fail());
    globalThis.fetch = (async () => new Response('', { status: 502 })) as unknown as typeof fetch;

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
      })
    ).rejects.toThrow(t('submit.error.rejected'));
    expect(await getPendingCount()).toBe(0);
  });

  it('sends the submission ID and accepts a duplicate response as success', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    let sentId: unknown;
    installMockXMLHttpRequest((request) => {
      sentId = JSON.parse((request.body as FormData).get('data') as string).submissionId;
      request.respond(200, JSON.stringify({ success: true, reportId: 'rpt_1', duplicate: true }));
    });

    const { submitReport } = await import('../../api/submit');
    const result = await submitReport({
      submissionId: 'submission-repeat',
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    expect(sentId).toBe('submission-repeat');
    expect(result).toMatchObject({ success: true, reportId: 'rpt_1', duplicate: true });
    expect(result.queued).toBeUndefined();
  });

  it('generates a submission ID when the caller does not provide one', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    let sentId: unknown;
    installMockXMLHttpRequest((request) => {
      sentId = JSON.parse((request.body as FormData).get('data') as string).submissionId;
      request.respond(200, JSON.stringify({ success: true, reportId: 'rpt_1' }));
    });

    const { submitReport } = await import('../../api/submit');
    await submitReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    expect(sentId).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/));
  });

  it('throws for server errors', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest((request) => {
      request.respond(400, JSON.stringify({ success: false, message: 'Nope' }));
    });

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
      })
    ).rejects.toThrow('Nope');
    expect(await getPendingCount()).toBe(0);
  });

  it('reports a useful error for a non-JSON 413 response', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest((request) => request.respond(413, ''));

    const { submitReport } = await import('../../api/submit');

    await expect(
      submitReport({
        apiKey: 'proj_key',
        serverUrl: 'https://example.com',
        title: 'Bug report',
        priority: 'medium',
        metadata: baseMetadata,
      })
    ).rejects.toThrow('too large');
  });

  it('localizes the video quota error code', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest((request) =>
      request.respond(
        429,
        JSON.stringify({
          success: false,
          error: 'VIDEO_QUOTA_EXCEEDED',
          message: 'Server quota message',
        })
      )
    );

    const { submitReport } = await import('../../api/submit');
    await expect(
      submitReport({
        apiKey: 'proj_key',
        serverUrl: 'https://example.com',
        title: 'Bug report',
        priority: 'medium',
        metadata: baseMetadata,
      })
    ).rejects.toThrow('Video uploads are paused for this project');
  });

  it('aborts without buffering the report', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    installMockXMLHttpRequest(() => undefined);

    const { submitReport } = await import('../../api/submit');
    const { clearBuffer, getPendingCount } = await import('../../storage/report-buffer');
    await clearBuffer();
    const controller = new AbortController();
    const submission = submitReport(
      {
        apiKey: 'proj_key',
        serverUrl: 'https://example.com',
        title: 'Bug report',
        priority: 'medium',
        metadata: baseMetadata,
      },
      { signal: controller.signal }
    );

    controller.abort();

    await expect(submission).rejects.toMatchObject({ name: 'AbortError' });
    expect(await getPendingCount()).toBe(0);
  });

  it('rejects an already aborted submission without sending XHR', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    let opened = false;
    installMockXMLHttpRequest(() => {
      opened = true;
    });
    const controller = new AbortController();
    controller.abort();

    const { submitReport } = await import('../../api/submit');

    await expect(
      submitReport(
        {
          apiKey: 'proj_key',
          serverUrl: 'https://example.com',
          title: 'Bug report',
          priority: 'medium',
          metadata: baseMetadata,
        },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(opened).toBe(false);
  });
});

describe('submit API (media + config)', () => {
  it('uploads media attachments and annotations', async () => {
    globalThis.navigator = { onLine: true } as Navigator;

    let capturedNames: string[] = [];
    let capturedRecordings: string[] = [];
    let capturedData: { mediaCount?: number; mediaAnnotations?: unknown[] } | null = null;
    const progress: number[] = [];

    installMockXMLHttpRequest((request) => {
      const body = request.body as FormData | null;
      if (body) {
        const entries = body.getAll('media');
        capturedNames = entries.map((entry) => (entry as File).name ?? 'unknown');
        capturedRecordings = body
          .getAll('recording')
          .map((entry) => (entry as File).name ?? 'unknown');
        const rawData = body.get('data');
        if (typeof rawData === 'string') {
          capturedData = JSON.parse(rawData);
        }
      }
      request.progress(50, 100);
      request.respond(200, JSON.stringify({ success: true, reportId: 'rpt_2' }));
    });

    const { submitReport } = await import('../../api/submit');

    await submitReport(
      {
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
          {
            blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/quicktime' }),
            mimeType: 'video/quicktime',
          },
          {
            blob: new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' }),
            mimeType: 'video/mp4',
            source: 'recording',
          },
        ],
      },
      { onProgress: (fraction) => progress.push(fraction) }
    );

    expect(capturedNames.some((name) => name.startsWith('screenshot-0.'))).toBe(true);
    expect(capturedNames.some((name) => name.startsWith('screenshot-1.'))).toBe(true);
    expect(capturedNames).toContain('video-2.mov');
    expect(capturedRecordings).toEqual(['recording-3.mp4']);
    expect((capturedData as unknown as { mediaCount?: number })?.mediaCount).toBe(4);
    expect(
      (capturedData as unknown as { mediaAnnotations?: unknown[] })?.mediaAnnotations?.length
    ).toBe(1);
    expect(progress).toEqual([0.5]);
  });

  it('includes the submission ID in the data field', async () => {
    const { buildSubmitFormData } = await import('../../api/submit-form');
    const { formData } = buildSubmitFormData({
      submissionId: 'submission-form',
      title: 'Bug report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    expect(JSON.parse(formData.get('data') as string).submissionId).toBe('submission-form');
  });

  it('creates submission IDs the server accepts, with or without randomUUID', async () => {
    const { createSubmissionId } = await import('../../api/submit-form');
    const pattern = /^[A-Za-z0-9_-]{8,64}$/;
    expect(createSubmissionId()).toMatch(pattern);

    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto) },
      configurable: true,
    });
    try {
      const first = createSubmissionId();
      expect(first).toMatch(pattern);
      expect(createSubmissionId()).not.toBe(first);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    }
  });

  it('counts the JSON field in the request size', async () => {
    const { buildSubmitFormData } = await import('../../api/submit-form');
    const { formData, byteSize } = buildSubmitFormData({
      title: 'Bug report',
      description: 'Description',
      priority: 'medium',
      metadata: baseMetadata,
      media: [
        {
          blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
          mimeType: 'video/mp4',
        },
      ],
    });
    const data = formData.get('data');

    expect(typeof data).toBe('string');
    expect(byteSize).toBe(new TextEncoder().encode(data as string).byteLength + 3);
  });

  it('rejects media larger than the request limit before opening XHR', async () => {
    globalThis.navigator = { onLine: true } as Navigator;
    let opened = false;
    installMockXMLHttpRequest(() => {
      opened = true;
    });
    const oversized = new Blob([]);
    Object.defineProperty(oversized, 'size', { value: 256 * 1024 * 1024 + 1 });

    const { submitReport } = await import('../../api/submit');

    await expect(
      submitReport({
        apiKey: 'proj_key',
        serverUrl: 'https://example.com',
        title: 'Bug report',
        priority: 'medium',
        metadata: baseMetadata,
        media: [{ blob: oversized, mimeType: 'video/mp4' }],
      })
    ).rejects.toThrow('too large');
    expect(opened).toBe(false);
  });

  it('throws when widget config fetch fails', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ success: false, message: 'No config' }), { status: 500 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { fetchWidgetConfig } = await import('../../api/submit');

    await expect(fetchWidgetConfig('proj_key', 'https://example.com')).rejects.toThrow('No config');
  });
});
