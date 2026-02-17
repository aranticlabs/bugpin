import { JSDOM } from 'jsdom';

type DomGlobals = {
  window: typeof globalThis.window;
  document: typeof globalThis.document;
  navigator: typeof globalThis.navigator;
  HTMLElement: typeof globalThis.HTMLElement;
  Node: typeof globalThis.Node;
  Event: typeof globalThis.Event;
  CustomEvent: typeof globalThis.CustomEvent;
  MouseEvent: typeof globalThis.MouseEvent;
  KeyboardEvent: typeof globalThis.KeyboardEvent;
  getComputedStyle: typeof globalThis.getComputedStyle;
  requestAnimationFrame: typeof globalThis.requestAnimationFrame;
  cancelAnimationFrame: typeof globalThis.cancelAnimationFrame;
};

export function installDom(url = 'https://example.com'): () => void {
  const hadGlobal = {
    window: Object.prototype.hasOwnProperty.call(globalThis, 'window'),
    document: Object.prototype.hasOwnProperty.call(globalThis, 'document'),
    navigator: Object.prototype.hasOwnProperty.call(globalThis, 'navigator'),
    HTMLElement: Object.prototype.hasOwnProperty.call(globalThis, 'HTMLElement'),
    Node: Object.prototype.hasOwnProperty.call(globalThis, 'Node'),
    Event: Object.prototype.hasOwnProperty.call(globalThis, 'Event'),
    CustomEvent: Object.prototype.hasOwnProperty.call(globalThis, 'CustomEvent'),
    MouseEvent: Object.prototype.hasOwnProperty.call(globalThis, 'MouseEvent'),
    KeyboardEvent: Object.prototype.hasOwnProperty.call(globalThis, 'KeyboardEvent'),
    getComputedStyle: Object.prototype.hasOwnProperty.call(globalThis, 'getComputedStyle'),
    requestAnimationFrame: Object.prototype.hasOwnProperty.call(
      globalThis,
      'requestAnimationFrame',
    ),
    cancelAnimationFrame: Object.prototype.hasOwnProperty.call(globalThis, 'cancelAnimationFrame'),
  };

  const original: DomGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    MouseEvent: globalThis.MouseEvent,
    KeyboardEvent: globalThis.KeyboardEvent,
    getComputedStyle: globalThis.getComputedStyle,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
  const { window } = dom;

  globalThis.window = window as unknown as typeof globalThis.window;
  globalThis.document = window.document as unknown as typeof globalThis.document;
  globalThis.navigator = window.navigator as unknown as typeof globalThis.navigator;
  globalThis.HTMLElement = window.HTMLElement as typeof HTMLElement;
  globalThis.Node = window.Node as typeof Node;
  globalThis.Event = window.Event as typeof Event;
  globalThis.CustomEvent = window.CustomEvent as typeof CustomEvent;
  globalThis.MouseEvent = window.MouseEvent as typeof MouseEvent;
  globalThis.KeyboardEvent = window.KeyboardEvent as typeof KeyboardEvent;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame =
    window.requestAnimationFrame?.bind(window) ?? ((cb: FrameRequestCallback) => setTimeout(cb, 0));
  globalThis.cancelAnimationFrame =
    window.cancelAnimationFrame?.bind(window) ?? ((id: number) => clearTimeout(id));

  return () => {
    dom.window.close();
    if (!hadGlobal.window && original.window === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = original.window;
    }
    if (!hadGlobal.document && original.document === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      globalThis.document = original.document;
    }
    if (!hadGlobal.navigator && original.navigator === undefined) {
      delete (globalThis as Record<string, unknown>).navigator;
    } else {
      globalThis.navigator = original.navigator;
    }
    if (!hadGlobal.HTMLElement && original.HTMLElement === undefined) {
      delete (globalThis as Record<string, unknown>).HTMLElement;
    } else {
      globalThis.HTMLElement = original.HTMLElement;
    }
    if (!hadGlobal.Node && original.Node === undefined) {
      delete (globalThis as Record<string, unknown>).Node;
    } else {
      globalThis.Node = original.Node;
    }
    if (!hadGlobal.Event && original.Event === undefined) {
      delete (globalThis as Record<string, unknown>).Event;
    } else {
      globalThis.Event = original.Event;
    }
    if (!hadGlobal.CustomEvent && original.CustomEvent === undefined) {
      delete (globalThis as Record<string, unknown>).CustomEvent;
    } else {
      globalThis.CustomEvent = original.CustomEvent;
    }
    if (!hadGlobal.MouseEvent && original.MouseEvent === undefined) {
      delete (globalThis as Record<string, unknown>).MouseEvent;
    } else {
      globalThis.MouseEvent = original.MouseEvent;
    }
    if (!hadGlobal.KeyboardEvent && original.KeyboardEvent === undefined) {
      delete (globalThis as Record<string, unknown>).KeyboardEvent;
    } else {
      globalThis.KeyboardEvent = original.KeyboardEvent;
    }
    if (!hadGlobal.getComputedStyle && original.getComputedStyle === undefined) {
      delete (globalThis as Record<string, unknown>).getComputedStyle;
    } else {
      globalThis.getComputedStyle = original.getComputedStyle;
    }
    if (!hadGlobal.requestAnimationFrame && original.requestAnimationFrame === undefined) {
      delete (globalThis as Record<string, unknown>).requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = original.requestAnimationFrame;
    }
    if (!hadGlobal.cancelAnimationFrame && original.cancelAnimationFrame === undefined) {
      delete (globalThis as Record<string, unknown>).cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = original.cancelAnimationFrame;
    }
  };
}
