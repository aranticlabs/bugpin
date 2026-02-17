import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

let lastOptions: Record<string, unknown> | undefined;
const toCanvasSpy = mock(async (_element: unknown, options?: Record<string, unknown>) => {
  lastOptions = options;
  return {
    toDataURL: () => 'data:image/png;base64,stub',
  };
});

mock.module('html-to-image', () => ({
  toCanvas: toCanvasSpy,
}));

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
const originalHTMLElement = globalThis.HTMLElement;
const originalSetTimeout = globalThis.setTimeout;

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
});

describe('captureScreenshot', () => {
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
    } as Navigator;
    globalThis.setTimeout = ((handler: () => void) => {
      handler();
      return 0 as unknown as number;
    }) as typeof setTimeout;

    const { captureScreenshot } = await import('../../capture/screenshot');
    const result = await captureScreenshot({ method: 'visible', useScreenCaptureAPI: true });

    expect(result).toBe('data:image/png;base64,screen');
    expect(trackStopped).toBe(true);
  });

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
      'Element not found: #missing',
    );
  });
});
