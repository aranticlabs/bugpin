import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

let lastOptions: Record<string, unknown> | undefined;
const toCanvasSpy = mock(async (_element: unknown, options?: Record<string, unknown>) => {
  lastOptions = options;
  return {
    toDataURL: () => 'data:image/png;base64,stub',
  };
});

// Bun keeps module mocks for later test files, so keep the real exports available.
const actualHtmlToImage = await import('html-to-image');
mock.module('html-to-image', () => ({
  ...actualHtmlToImage,
  toCanvas: toCanvasSpy,
}));

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
const originalHTMLElement = globalThis.HTMLElement;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

class FakeStyle {
  background = '';
  minHeight = '';
  minWidth = '';
  display = '';
  visibility = '';

  removeProperty(prop: string) {
    if (prop === 'background') this.background = '';
    if (prop === 'min-height') this.minHeight = '';
    if (prop === 'min-width') this.minWidth = '';
  }
}

class FakeElement {
  tagName: string;
  id?: string;
  style = new FakeStyle();
  scrollWidth = 1200;
  scrollHeight = 900;
  clientWidth = 800;
  clientHeight = 600;
  offsetWidth = 1200;
  offsetHeight = 900;
  private attributes: Map<string, string> = new Map();

  constructor(tagName: string, id?: string) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelectorAll(_selector: string): FakeElement[] {
    return []; // No images by default
  }

  getBoundingClientRect() {
    return { width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 };
  }
}

function setupDom(options?: { selectorElement?: FakeElement | null }) {
  const html = new FakeElement('html');
  html.clientWidth = 800;
  html.clientHeight = 600;
  const body = new FakeElement('body');
  const widget = new FakeElement('div', 'bugpin-widget');
  widget.setAttribute('data-bugpin-exclude', 'true');
  widget.style.visibility = 'visible';
  const selectorElement =
    options && 'selectorElement' in options
      ? options.selectorElement
      : new FakeElement('div', 'target');

  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;

  class FakeCanvas {
    width = 0;
    height = 0;
    getContext() {
      return {
        drawImage: () => undefined,
        clearRect: () => undefined,
        fillRect: () => undefined,
        fillStyle: '',
        scale: () => undefined,
      };
    }
    toDataURL() {
      return 'data:image/png;base64,stub';
    }
  }

  globalThis.document = {
    documentElement: html,
    body,
    querySelector: (selector: string) => (selector === '#target' ? selectorElement : null),
    querySelectorAll: (selector: string) => (selector === '[data-bugpin-exclude]' ? [widget] : []),
    getElementById: (id: string) => (id === 'bugpin-widget' ? widget : null),
    createElement: (tag: string) => (tag === 'canvas' ? new FakeCanvas() : new FakeElement('div')),
    fonts: { ready: Promise.resolve() },
  } as unknown as Document;
  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 2,
    getComputedStyle: () => ({ backgroundColor: 'rgb(1, 2, 3)', background: 'rgb(1, 2, 3)' }),
  } as unknown as typeof globalThis.window;

  return { html, body, widget, selectorElement };
}

beforeEach(() => {
  lastOptions = undefined;
  toCanvasSpy.mockClear();
});

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.navigator = originalNavigator;
  globalThis.HTMLElement = originalHTMLElement;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

describe('captureScreenshot', () => {
  for (const state of ['pending', 'decoding', 'load-decoding', 'loaded', 'error'] as const) {
    it(`continues capture and cleans up image listeners when an image is ${state}`, async () => {
      const { html, widget } = setupDom();
      // Track only the image wait timer; timers left by other test files may still fire.
      const imageWaitTimers: unknown[] = [];
      globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        const id = originalSetTimeout(handler, timeout, ...args);
        if (timeout === 3000) imageWaitTimers.push(id);
        return id;
      }) as unknown as typeof setTimeout;
      const clearTimeoutSpy = mock(originalClearTimeout);
      globalThis.clearTimeout = clearTimeoutSpy as typeof clearTimeout;
      const events = new EventTarget();
      const image = Object.assign(new FakeElement('img'), {
        complete: state === 'decoding',
        loading: 'lazy',
        decode: mock(() =>
          state.includes('decoding') ? new Promise<void>(() => {}) : Promise.resolve()
        ),
        addEventListener: mock((type: string, listener: EventListener) => {
          events.addEventListener(type, listener);
          if (type === 'error' && state !== 'pending') {
            queueMicrotask(() =>
              events.dispatchEvent(new Event(state === 'error' ? 'error' : 'load'))
            );
          }
        }),
        removeEventListener: mock((type: string, listener: EventListener) =>
          events.removeEventListener(type, listener)
        ),
      });
      html.querySelectorAll = (selector: string) => (selector === 'img' ? [image] : []);
      const { captureScreenshot } = await import('../../capture/screenshot');

      expect(await captureScreenshot({ method: 'visible' })).toBe('data:image/png;base64,stub');
      expect(widget.style.visibility).toBe('visible');
      expect(image.loading).toBe('lazy');
      expect(imageWaitTimers).toHaveLength(1);
      expect(clearTimeoutSpy.mock.calls.filter(([id]) => id === imageWaitTimers[0])).toHaveLength(
        1
      );
      expect(image.removeEventListener).toHaveBeenCalledWith('load', expect.any(Function));
      expect(image.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
      const decodeCalls = image.decode.mock.calls.length;
      events.dispatchEvent(new Event('load'));
      expect(image.decode.mock.calls.length).toBe(decodeCalls);
    });
  }

  it('uses Screen Capture API when enabled', async () => {
    let trackStopped = false;
    const track = {
      stop: () => {
        trackStopped = true;
      },
    };
    const stream = { getTracks: () => [track] };

    const video = {
      videoWidth: 640,
      videoHeight: 480,
      set onloadedmetadata(handler: () => void) {
        queueMicrotask(handler);
      },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toDataURL: () => 'data:image/png;base64,screen',
    };

    globalThis.document = {
      createElement: (tag: string) => (tag === 'video' ? video : canvas),
    } as unknown as Document;
    globalThis.navigator = {
      mediaDevices: {
        getDisplayMedia: async () => stream,
      },
    } as unknown as Navigator;
    globalThis.setTimeout = ((handler: () => void, ms = 0) => {
      if (ms <= 100) handler();
      return 0 as unknown as number;
    }) as typeof setTimeout;

    const { captureScreenshot } = await import('../../capture/screenshot');
    const result = await captureScreenshot({ method: 'visible', useScreenCaptureAPI: true });

    expect(result).toBe('data:image/png;base64,screen');
    expect(trackStopped).toBe(true);
  });

  it('downscales Screen Capture API frames when pixelRatioOverride is set', async () => {
    const track = { stop: mock() };
    const stream = { getTracks: () => [track] };
    const video = {
      videoWidth: 1600,
      videoHeight: 1200,
      set onloadedmetadata(handler: () => void) {
        queueMicrotask(handler);
      },
    };
    const drawImage = mock();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'data:image/png;base64,scaled',
    };

    globalThis.window = { devicePixelRatio: 2 } as unknown as Window & typeof globalThis;
    globalThis.document = {
      createElement: (tag: string) => (tag === 'video' ? video : canvas),
    } as unknown as Document;
    globalThis.navigator = {
      mediaDevices: {
        getDisplayMedia: async () => stream,
      },
    } as unknown as Navigator;
    globalThis.setTimeout = ((handler: () => void, ms = 0) => {
      if (ms <= 100) handler();
      return 0 as unknown as number;
    }) as typeof setTimeout;

    const { captureScreenshot } = await import('../../capture/screenshot');
    const result = await captureScreenshot({
      method: 'visible',
      useScreenCaptureAPI: true,
      pixelRatioOverride: 1,
    });

    expect(result).toBe('data:image/png;base64,scaled');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 800, 600);
  });

  it('grabs the frame from an open screen capture session without a new picker', async () => {
    let pickerOpened = false;
    globalThis.navigator = {
      mediaDevices: {
        getDisplayMedia: async () => {
          pickerOpened = true;
          throw new Error('unexpected');
        },
      },
    } as unknown as Navigator;
    const session = { grabFrame: async () => 'data:image/png;base64,session', stop: mock() };

    const { captureScreenshot } = await import('../../capture/screenshot');
    const result = await captureScreenshot({
      useScreenCaptureAPI: true,
      screenCaptureSession: session,
    });

    expect(result).toBe('data:image/png;base64,session');
    expect(pickerOpened).toBe(false);
    expect(session.stop).not.toHaveBeenCalled();
  });

  it('falls back to DOM capture when sharing was stopped before the frame grab', async () => {
    const track = { readyState: 'live', stop: () => undefined };
    const stream = { getTracks: () => [track] };
    const video = {
      videoWidth: 640,
      videoHeight: 480,
      set onloadedmetadata(handler: () => void) {
        queueMicrotask(handler);
      },
    };
    setupDom();
    const fakeDocument = globalThis.document as unknown as Record<string, unknown>;
    const createElement = fakeDocument.createElement as (tag: string) => unknown;
    fakeDocument.createElement = (tag: string) => (tag === 'video' ? video : createElement(tag));
    globalThis.navigator = {
      mediaDevices: { getDisplayMedia: async () => stream },
    } as unknown as Navigator;
    globalThis.setTimeout = ((handler: () => void, ms = 0) => {
      if (ms <= 100) handler();
      return 0 as unknown as number;
    }) as typeof setTimeout;

    const { captureScreenshot, openScreenCaptureSession } =
      await import('../../capture/screenshot');
    const session = await openScreenCaptureSession();
    track.readyState = 'ended';

    await expect(session.grabFrame()).rejects.toThrow('Screen sharing was stopped');
    const result = await captureScreenshot({
      useScreenCaptureAPI: true,
      screenCaptureSession: session,
    });
    expect(result).toBe('data:image/png;base64,stub');
    expect(toCanvasSpy).toHaveBeenCalled();
  });

  it('falls back to DOM capture when the shared tab has no decoded frame yet', async () => {
    const track = { readyState: 'live', stop: () => undefined };
    const stream = { getTracks: () => [track] };
    const video = {
      readyState: 1,
      videoWidth: 640,
      videoHeight: 480,
      set onloadedmetadata(handler: () => void) {
        queueMicrotask(handler);
      },
    };
    setupDom();
    const fakeDocument = globalThis.document as unknown as Record<string, unknown>;
    const createElement = fakeDocument.createElement as (tag: string) => unknown;
    fakeDocument.createElement = (tag: string) => (tag === 'video' ? video : createElement(tag));
    globalThis.navigator = {
      mediaDevices: { getDisplayMedia: async () => stream },
    } as unknown as Navigator;
    globalThis.setTimeout = ((handler: () => void, ms = 0) => {
      if (ms <= 100) handler();
      return 0 as unknown as number;
    }) as typeof setTimeout;

    const { captureScreenshot, openScreenCaptureSession } =
      await import('../../capture/screenshot');
    const session = await openScreenCaptureSession();

    await expect(session.grabFrame()).rejects.toThrow('Screen sharing has no frame yet');
    const result = await captureScreenshot({
      useScreenCaptureAPI: true,
      screenCaptureSession: session,
    });
    expect(result).toBe('data:image/png;base64,stub');
    expect(toCanvasSpy).toHaveBeenCalled();
  });

  for (const failure of ['error', 'ended', 'timeout'] as const) {
    it(`stops sharing and rejects when the shared video ${failure === 'timeout' ? 'never loads' : `fires ${failure}`}`, async () => {
      const stop = mock();
      const track: { stop: () => void; onended?: () => void } = { stop };
      const stream = { getTracks: () => [track] };
      const video: { onerror?: () => void } = {};
      let expire: (() => void) | undefined;
      globalThis.document = {
        createElement: () => video,
      } as unknown as Document;
      globalThis.navigator = {
        mediaDevices: { getDisplayMedia: async () => stream },
      } as unknown as Navigator;
      globalThis.setTimeout = ((handler: () => void) => {
        expire = handler;
        return 0 as unknown as number;
      }) as typeof setTimeout;

      const { openScreenCaptureSession } = await import('../../capture/screenshot');
      const opening = openScreenCaptureSession();
      await Promise.resolve();
      await Promise.resolve();
      if (failure === 'error') video.onerror?.();
      else if (failure === 'ended') track.onended?.();
      else expire?.();

      await expect(opening).rejects.toThrow('Screen sharing could not start');
      expect(stop).toHaveBeenCalledTimes(1);
    });
  }

  it('captures visible viewport and restores visibility', async () => {
    const { html, widget } = setupDom();
    const { captureScreenshot } = await import('../../capture/screenshot');

    const result = await captureScreenshot({ method: 'visible' });

    expect(result).toBe('data:image/png;base64,stub');
    expect(toCanvasSpy).toHaveBeenCalled();
    // Widget visibility should be restored
    expect(widget.style.visibility).toBe('visible');
    // Should capture documentElement (true document root including fixed elements)
    expect(toCanvasSpy).toHaveBeenCalledWith(html, expect.any(Object));
    expect(lastOptions?.width).toBe(800);
    expect(lastOptions?.height).toBe(600);

    const filter = lastOptions?.filter as (node: unknown) => boolean;
    const scriptNode = new FakeElement('script');
    expect(filter(scriptNode)).toBe(false);
    // Widget should be excluded via data-bugpin-exclude attribute
    expect(filter(widget)).toBe(false);
  });

  it('captures a specific element when selector matches', async () => {
    const selectorElement = new FakeElement('div', 'target');
    setupDom({ selectorElement });
    const { captureScreenshot } = await import('../../capture/screenshot');

    await captureScreenshot({ method: 'element', selector: '#target' });
    expect(toCanvasSpy).toHaveBeenCalledWith(selectorElement, expect.any(Object));
  });

  it('throws for missing or invalid element selector', async () => {
    setupDom({ selectorElement: null });
    const { captureScreenshot } = await import('../../capture/screenshot');

    await expect(captureScreenshot({ method: 'element' })).rejects.toThrow('Selector required');
    await expect(captureScreenshot({ method: 'element', selector: '#missing' })).rejects.toThrow(
      'Element not found: #missing'
    );
  });
});
