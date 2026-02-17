import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalPerformance = globalThis.performance;
const originalXMLHttpRequest = globalThis.XMLHttpRequest;

const listeners = new Map<string, Array<(event: { reason?: unknown }) => void>>();
class BasicEvent {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
}

class BasicCustomEvent<T = unknown> extends BasicEvent {
  detail?: T;
  reason?: unknown;
  constructor(type: string, init?: { detail?: T }) {
    super(type);
    this.detail = init?.detail;
    if (init?.detail && typeof init.detail === 'object' && 'reason' in init.detail) {
      this.reason = (init.detail as { reason?: unknown }).reason;
    }
  }
}

const sharedWindow = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 2,
  location: { href: 'https://example.com/page' },
  Event: BasicEvent,
  CustomEvent: BasicCustomEvent,
  fetch: async () => ({ ok: true, status: 200, statusText: 'OK' }) as Response,
  addEventListener: (event: string, handler: (event: { reason?: unknown }) => void) => {
    const current = listeners.get(event) ?? [];
    current.push(handler);
    listeners.set(event, current);
  },
  removeEventListener: (event: string, handler: (event: { reason?: unknown }) => void) => {
    const current = listeners.get(event);
    if (!current) return;
    listeners.set(
      event,
      current.filter((fn) => fn !== handler),
    );
  },
  dispatchEvent: (event: string | { type?: string }, payload?: { reason?: unknown }) => {
    const eventName = typeof event === 'string' ? event : event?.type;
    if (!eventName) return false;
    const handlers = listeners.get(eventName) ?? [];
    const payloadValue = typeof event === 'string' ? payload : event;
    handlers.forEach((handler) => handler(payloadValue as { reason?: unknown }));
    return handlers.length > 0;
  },
  onerror: null as
    | null
    | ((
        message: unknown,
        source?: string,
        line?: number,
        column?: number,
        error?: unknown,
      ) => boolean),
};

const sharedDocument = {
  title: 'Test Page',
  referrer: 'https://referrer.test',
  addEventListener: () => undefined,
  cookie: '',
};

const sharedNavigator = {
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0',
};

let performanceEntries: Array<{ startTime: number; loadEventEnd: number }> = [
  { startTime: 0, loadEventEnd: 1200 },
];

const sharedPerformance = {
  getEntriesByType: () => performanceEntries,
};

let captureContext:
  | (() => ReturnType<typeof import('../../capture/context').captureContext>)
  | null = null;
let startErrorCapture: (() => void) | null = null;

function configureDom(options?: {
  userAgent?: string;
  width?: number;
  height?: number;
  devicePixelRatio?: number;
  locationHref?: string;
  title?: string;
  referrer?: string;
  performanceEntries?: Array<{ startTime: number; loadEventEnd: number }>;
}) {
  sharedWindow.innerWidth = options?.width ?? 1280;
  sharedWindow.innerHeight = options?.height ?? 720;
  sharedWindow.devicePixelRatio = options?.devicePixelRatio ?? 2;
  sharedWindow.location.href = options?.locationHref ?? 'https://example.com/page';
  sharedDocument.title = options?.title ?? 'Test Page';
  sharedDocument.referrer = options?.referrer ?? 'https://referrer.test';
  sharedNavigator.userAgent = options?.userAgent ?? 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0';
  performanceEntries = options?.performanceEntries ?? [{ startTime: 0, loadEventEnd: 1200 }];
}

beforeAll(async () => {
  globalThis.window = sharedWindow as unknown as typeof globalThis.window;
  globalThis.document = sharedDocument as unknown as typeof globalThis.document;
  globalThis.navigator = sharedNavigator as unknown as typeof globalThis.navigator;
  globalThis.performance = sharedPerformance as unknown as typeof globalThis.performance;

  // Mock XMLHttpRequest
  globalThis.XMLHttpRequest = class MockXMLHttpRequest {
    _bugpinMethod?: string;
    _bugpinUrl?: string;
    status = 200;
    statusText = 'OK';
    open() {}
    send() {}
    addEventListener() {}
  } as unknown as typeof XMLHttpRequest;

  configureDom();

  const mod = await import('../../capture/context');
  captureContext = mod.captureContext;
  startErrorCapture = mod.startErrorCapture;

  // Start error capture after module is loaded
  startErrorCapture();
});

beforeEach(() => {
  configureDom();
});

afterAll(() => {
  // Restore console before restoring globals
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;

  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.navigator = originalNavigator;
  globalThis.performance = originalPerformance;
  globalThis.XMLHttpRequest = originalXMLHttpRequest;
});

describe('capture context', () => {
  it('captures page metadata and environment info', async () => {
    const context = captureContext?.();
    if (!context) {
      throw new Error('captureContext not initialized');
    }
    expect(context.url).toBe('https://example.com/page');
    expect(context.title).toBe('Test Page');
    expect(context.referrer).toBe('https://referrer.test');
    expect(context.browser.name).toBe('Chrome');
    expect(context.viewport.width).toBe(1280);
    expect(context.pageLoadTime).toBe(1200);
  });

  it('captures console errors', async () => {
    console.error('Boom');
    const context = captureContext?.();
    if (!context) {
      throw new Error('captureContext not initialized');
    }
    expect(context.consoleErrors?.length ?? 0).toBeGreaterThan(0);
  });

  it('detects Firefox on Windows and desktop devices', async () => {
    configureDom({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      width: 1440,
      height: 900,
    });

    const context = captureContext?.();
    if (!context) {
      throw new Error('captureContext not initialized');
    }

    expect(context.browser.name).toBe('Firefox');
    expect(context.device.type).toBe('desktop');
    expect(context.device.os).toBe('Windows');
    expect(context.device.osVersion).toBe('10/11');
  });

  it('detects iPad as tablet and captures orientation', async () => {
    configureDom({
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      width: 1024,
      height: 768,
    });

    const context = captureContext?.();
    if (!context) {
      throw new Error('captureContext not initialized');
    }

    expect(context.device.type).toBe('tablet');
    expect(context.device.os).toBe('macOS');
    expect(context.device.osVersion).toBeUndefined();
    expect(context.viewport.orientation).toBe('landscape');
  });

  it('captures window errors and unhandled rejections', async () => {
    if (window.onerror) {
      window.onerror('Boom', 'app.js', 9, 0, new Error('fail'));
    }
    window.dispatchEvent(
      new window.CustomEvent('unhandledrejection', { detail: { reason: 'Promise failed' } }),
    );
    console.warn('Heads up');

    const context = captureContext?.();
    if (!context) {
      throw new Error('captureContext not initialized');
    }
    const messages = (context.consoleErrors ?? []).map((entry) => entry.message);

    expect(messages).toContain('Boom');
    expect(messages).toContain('Unhandled Promise Rejection: Promise failed');
    expect(messages).toContain('Heads up');
  });

  it('returns undefined load time when navigation entries are missing', async () => {
    configureDom({ performanceEntries: [] });
    const context = captureContext?.();
    if (!context) {
      throw new Error('captureContext not initialized');
    }
    expect(context.pageLoadTime).toBeUndefined();
  });
});
