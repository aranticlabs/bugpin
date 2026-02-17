import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'preact';
import type { WidgetConfig } from '../../config';
import { installDom } from '../helpers/dom';
import { installFabricMock } from '../helpers/fabric-mock';

installFabricMock();

async function waitFor<T>(resolver: () => T | null | undefined, message: string, timeoutMs = 300) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = resolver();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

const baseConfig: WidgetConfig = {
  apiKey: 'proj_key',
  serverUrl: 'https://example.com',
  position: 'bottom-right',
  buttonText: 'Report issue',
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 18,
  buttonIconStroke: 2,
  theme: 'auto',
  lightButtonColor: '#000000',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#111111',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#000000',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#111111',
  darkTextHoverColor: '#ffffff',
  dialogLightButtonColor: '#000000',
  dialogLightTextColor: '#ffffff',
  dialogLightButtonHoverColor: '#111111',
  dialogLightTextHoverColor: '#ffffff',
  dialogDarkButtonColor: '#000000',
  dialogDarkTextColor: '#ffffff',
  dialogDarkButtonHoverColor: '#111111',
  dialogDarkTextHoverColor: '#ffffff',
  enableHoverScaleEffect: true,
  tooltipEnabled: false,
  tooltipText: null,
  enableScreenshot: true,
  enableAnnotation: true,
  enableConsoleCapture: true,
  captureMethod: 'visible',
  useScreenCaptureAPI: false,
  maxScreenshotSize: 5 * 1024 * 1024,
};

const originalFetch = globalThis.fetch;
const originalNavigator = globalThis.navigator;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const originalFileReader = globalThis.FileReader;
const originalImage = globalThis.Image;
const originalGetBoundingClientRect = globalThis.HTMLElement?.prototype.getBoundingClientRect;

let restoreDom: (() => void) | null = null;
let fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsDataURL(_file: Blob) {
    this.result = 'data:image/png;base64,media';
    const trigger = () => this.onload?.(new window.Event('load') as ProgressEvent<FileReader>);
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(trigger);
    } else {
      setTimeout(trigger, 0);
    }
  }
}

class MockImage {
  width = 100;
  height = 100;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    const trigger = () => this.onload?.();
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(trigger);
    } else {
      setTimeout(trigger, 0);
    }
  }
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__fabricCanvasReady;
  restoreDom = installDom();
  fetchCalls = [];

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push([input, init]);
    return new Response(JSON.stringify({ success: true, reportId: 'rpt_mock' }), { status: 200 });
  };
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  globalThis.navigator = {
    userAgent: 'Mozilla/5.0',
    onLine: false,
  } as Navigator;

  globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as unknown as typeof clearInterval;

  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;

  globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
  globalThis.Image = MockImage as unknown as typeof Image;

  if (globalThis.HTMLElement) {
    globalThis.HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: 800,
      }) as DOMRect;
  }
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;

  globalThis.fetch = originalFetch;
  globalThis.navigator = originalNavigator;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
  globalThis.FileReader = originalFileReader;
  globalThis.Image = originalImage;

  if (globalThis.HTMLElement && originalGetBoundingClientRect) {
    globalThis.HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  }
});

describe('App interactions', () => {
  it('opens the widget and submits a report', async () => {
    const { App } = await import('../../components/App');

    const container = document.createElement('div');
    document.body.appendChild(container);

    render(<App config={baseConfig} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcher?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    const titleInput = container.querySelector('#bugpin-title-input') as HTMLInputElement | null;
    if (titleInput) {
      titleInput.value = 'Test bug';
      titleInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));

    globalThis.navigator = {
      userAgent: 'Mozilla/5.0',
      onLine: true,
    } as Navigator;

    const submitButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Submit Report'),
    );
    submitButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchCalls.length).toBe(1);

    const [, init] = fetchCalls[0] ?? [];
    const body = (init?.body ?? null) as FormData | null;
    const data = body?.get('data');
    const parsed = typeof data === 'string' ? JSON.parse(data) : null;

    expect(parsed?.metadata?.url).toContain('https://example.com');
    expect(parsed?.title).toBe('Test bug');

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.textContent).toContain('Bug report submitted successfully');

    render(null, container);
    container.remove();
  });

  it('annotates uploaded media', async () => {
    const { App } = await import('../../components/App');

    const container = document.createElement('div');
    document.body.appendChild(container);

    render(<App config={baseConfig} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcher?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    const mediaTab = Array.from(container.querySelectorAll('[role="tab"]')).find((tab) =>
      tab.textContent?.includes('Screenshots'),
    );
    mediaTab?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (fileInput) {
      const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
      const fileList = {
        0: file,
        length: 1,
        item: (index: number) => (index === 0 ? file : null),
      } as unknown as FileList;

      Object.defineProperty(fileInput, 'files', { value: fileList, configurable: true });
      fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const annotateButton = await waitFor(
      () => container.querySelector('button[title="Annotate"]') as HTMLButtonElement | null,
      'Annotate button not ready',
    );
    annotateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(
      () => (globalThis as Record<string, unknown>).__fabricCanvasReady,
      'Fabric canvas not ready',
    );

    const doneButton = await waitFor(
      () =>
        Array.from(container.querySelectorAll('button')).find(
          (btn) => btn.textContent?.trim() === 'Done',
        ),
      'Done button not ready',
    );
    doneButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(
      () => (container.textContent ?? '').includes('Annotated'),
      'Annotated badge not shown',
    );
    expect(container.textContent).toContain('Annotated');

    render(null, container);
    container.remove();
  });
});
