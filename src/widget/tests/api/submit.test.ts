import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;

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

beforeEach(() => {
  setWidgetEnv();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.navigator = originalNavigator;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
});

describe('submit API', () => {
  it('submits report when online', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ success: true, reportId: 'rpt_1' }), { status: 200 });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { submitReport } = await import('../../api/submit');
    globalThis.navigator = { onLine: true } as Navigator;

    const result = await submitReport({
      apiKey: 'proj_key',
      serverUrl: 'https://example.com',
      title: 'Bug report',
      priority: 'medium',
      metadata: {
        url: 'https://example.com',
        browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
        device: { type: 'desktop', os: 'macOS' },
        viewport: { width: 100, height: 100, devicePixelRatio: 1 },
        timestamp: new Date().toISOString(),
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reportId).toBe('rpt_1');
    }
  });

  it('fetches widget config', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          config: {
            projectName: 'Project',
            branding: {},
            features: {
              screenshot: true,
              annotation: true,
              attachments: false,
              consoleCapture: true,
            },
            theme: 'auto',
            position: 'bottom-right',
          },
        }),
        { status: 200 },
      );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const { fetchWidgetConfig } = await import('../../api/submit');

    const result = await fetchWidgetConfig('proj_key', 'https://example.com');
    expect(result.projectName).toBe('Project');
  });
});
