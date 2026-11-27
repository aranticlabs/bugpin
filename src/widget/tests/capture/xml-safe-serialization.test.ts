import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { toSvg } from 'html-to-image';
import { installDom } from '../helpers/dom';
import { withCaptureClone } from '../../capture/capture-clone';
import {
  isXmlSafeAttribute,
  removeXmlUnsafeAttributes,
} from '../../capture/xml-safe-serialization';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const FRAMEWORK_MARKUP =
  '<main wire:id="abc" wire:snapshot="{}" x-data="{ open: false }" class="card" style="color: red">' +
  '<a href="/" wire:navigate>Home</a>' +
  '<button x-on:click="open = true" @click="open = true" :class="{ active: open }">Open</button>' +
  '<input wire:model.live="name" value="Ada">' +
  '</main>';

// DOM globals used by this test or by html-to-image that installDom does not provide.
const EXTRA_DOM_GLOBALS = [
  'XMLSerializer',
  'DOMParser',
  'Element',
  'HTMLCanvasElement',
  'HTMLIFrameElement',
  'HTMLImageElement',
  'HTMLInputElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'HTMLVideoElement',
  'SVGElement',
  'SVGImageElement',
] as const;

const globals = globalThis as Record<string, unknown>;
const savedGlobals = new Map(
  EXTRA_DOM_GLOBALS.map((name) => [name, { present: name in globals, value: globals[name] }])
);
let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installDom();
  const windowGlobals = window as unknown as Record<string, unknown>;
  for (const name of EXTRA_DOM_GLOBALS) {
    globals[name] = windowGlobals[name];
  }
  // jsdom does not implement SVGImageElement.
  globals.SVGImageElement ??= class SVGImageElement {};
});

afterEach(() => {
  restoreDom();
  for (const [name, saved] of savedGlobals) {
    if (saved.present) {
      globals[name] = saved.value;
    } else {
      delete globals[name];
    }
  }
});

function hasParserError(markup: string): boolean {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return parsed.getElementsByTagName('parsererror').length > 0;
}

function decodeSvgDataUrl(dataUrl: string): string {
  return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

/** Mirrors the detached wrapper html-to-image builds before serializing. */
function buildCaptureSvg(content: Element): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGSVGElement;
  const foreignObject = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  svg.appendChild(foreignObject);
  foreignObject.appendChild(content);
  return svg;
}

/** Mirrors html-to-image, which applies its `style` option to the root clone before wrapping it. */
function buildOwnedCaptureSvg(
  clone: HTMLElement,
  captureStyle: Partial<CSSStyleDeclaration>
): SVGSVGElement {
  Object.assign(clone.style, captureStyle);
  return buildCaptureSvg(clone);
}

function attributeOf(markup: string): Attr {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.firstElementChild!.attributes[0];
}

describe('isXmlSafeAttribute', () => {
  it.each([
    '<a wire:navigate>',
    '<a x-on:click="x">',
    '<a @click="x">',
    '<a :class="x">',
    '<a x-bind:class="x">',
    '<a foo:bar:baz="x">',
    '<a v-on:click="x">',
  ])('rejects %s', (markup) => {
    expect(isXmlSafeAttribute(attributeOf(markup))).toBe(false);
  });

  it.each([
    '<a class="x">',
    '<a data-id="x">',
    '<a aria-label="x">',
    '<a x-data="x">',
    '<a data-ü="x">',
    '<a xml:lang="en">',
    '<a xmlns:og="http://ogp.me/ns#">',
    '<a xmlns="http://www.w3.org/1999/xhtml">',
  ])('keeps %s', (markup) => {
    expect(isXmlSafeAttribute(attributeOf(markup))).toBe(true);
  });

  it('keeps a prefixed attribute only when its prefix is declared in scope', () => {
    const attribute = attributeOf('<a inkscape:label="Layer 1">');
    expect(isXmlSafeAttribute(attribute)).toBe(false);
    expect(isXmlSafeAttribute(attribute, new Set(['inkscape']))).toBe(true);
    expect(isXmlSafeAttribute(attribute, new Set(['other']))).toBe(false);
  });

  it('rejects a prefix declaration with an empty namespace', () => {
    expect(isXmlSafeAttribute(attributeOf('<a xmlns:og="">'))).toBe(false);
  });

  it('keeps namespaced attributes such as xlink:href on inline SVG', () => {
    const host = document.createElement('div');
    host.innerHTML = '<svg><use xlink:href="#icon"></use></svg>';
    const attribute = host.querySelector('use')!.attributes[0];
    expect(attribute.namespaceURI).toBe('http://www.w3.org/1999/xlink');
    expect(isXmlSafeAttribute(attribute)).toBe(true);
  });
});

describe('withCaptureClone with XML cleanup', () => {
  it('produces well-formed XML for its own capture SVG with framework attributes', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    const unsafeClone = main.cloneNode(true) as Element;

    expect(
      hasParserError(new XMLSerializer().serializeToString(buildCaptureSvg(unsafeClone)))
    ).toBe(true);

    const markup = await withCaptureClone(main, removeXmlUnsafeAttributes, async (captureStyle) =>
      new XMLSerializer().serializeToString(
        buildOwnedCaptureSvg(main.cloneNode(true) as HTMLElement, captureStyle)
      )
    );

    expect(hasParserError(markup)).toBe(false);
    expect(markup).not.toContain('wire:');
    expect(markup).not.toContain('@click');
    expect(markup).not.toContain(':class');
    expect(markup).not.toContain('bugpin-capture');
    expect(markup).toContain('x-data=');
    expect(markup).toContain('class="card"');
    expect(markup).toContain('color: red');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('value="Ada"');
  });

  it('puts back the live animation-name it uses as the capture marker', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    main.style.animationName = 'fade-in';
    const clone = main.cloneNode(true) as HTMLElement;

    await withCaptureClone(main, removeXmlUnsafeAttributes, async (captureStyle) => {
      const svg = buildOwnedCaptureSvg(clone, captureStyle);
      expect(clone.style.animationName).toStartWith('bugpin-capture-');
      new XMLSerializer().serializeToString(svg);
    });

    expect(clone.style.animationName).toBe('fade-in');
  });

  it('never modifies the live page', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    const before = document.body.innerHTML;

    const liveMarkup = await withCaptureClone(
      main,
      removeXmlUnsafeAttributes,
      async (captureStyle) => {
        const serializer = new XMLSerializer();
        serializer.serializeToString(
          buildOwnedCaptureSvg(main.cloneNode(true) as HTMLElement, captureStyle)
        );
        return serializer.serializeToString(main);
      }
    );

    expect(document.body.innerHTML).toBe(before);
    expect(liveMarkup).toContain('wire:navigate');
  });

  it('leaves SVGs it does not own untouched, including capture-shaped ones', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const main = document.querySelector('main')!;
    const hostExport = buildCaptureSvg(main.cloneNode(true) as Element);
    const detached = document.createElement('div');
    detached.innerHTML = FRAMEWORK_MARKUP;

    const [exportMarkup, divMarkup] = await withCaptureClone(
      main,
      removeXmlUnsafeAttributes,
      async () => {
        const serializer = new XMLSerializer();
        return [serializer.serializeToString(hostExport), serializer.serializeToString(detached)];
      }
    );

    expect(exportMarkup).toContain('wire:navigate');
    expect(hostExport.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
    expect(divMarkup).toContain('wire:navigate');
    expect(detached.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
  });

  it('leaves another export of the same element untouched, whichever starts first', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };
    const capture = () =>
      withCaptureClone(target, removeXmlUnsafeAttributes, (style) =>
        toSvg(target, { ...options, style })
      );

    const [captureFirst, exportSecond] = await Promise.all([capture(), toSvg(target, options)]);
    const [exportFirst, captureSecond] = await Promise.all([toSvg(target, options), capture()]);

    for (const own of [captureFirst, captureSecond].map(decodeSvgDataUrl)) {
      expect(hasParserError(own)).toBe(false);
      expect(own).not.toContain('bugpin-capture');
    }
    for (const other of [exportFirst, exportSecond].map(decodeSvgDataUrl)) {
      expect(other).toContain('wire:navigate');
    }
  });

  it('leaves a concurrent export of a different element untouched', async () => {
    document.body.innerHTML =
      FRAMEWORK_MARKUP + '<section><a href="/" wire:navigate>Other</a></section>';
    const target = document.querySelector('main') as HTMLElement;
    const other = document.querySelector('section') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };

    const [own, unrelated] = await Promise.all([
      withCaptureClone(target, removeXmlUnsafeAttributes, (style) =>
        toSvg(target, { ...options, style })
      ),
      toSvg(other, options),
    ]);

    expect(hasParserError(decodeSvgDataUrl(own))).toBe(false);
    expect(decodeSvgDataUrl(unrelated)).toContain('wire:navigate');
  });

  it('cleans every clone when captures of the same element overlap', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };
    const capture = () =>
      withCaptureClone(target, removeXmlUnsafeAttributes, (style) =>
        toSvg(target, { ...options, style })
      );

    const results = await Promise.all([capture(), capture()]);

    for (const result of results.map(decodeSvgDataUrl)) {
      expect(hasParserError(result)).toBe(false);
      expect(result).not.toContain('bugpin-capture');
    }
  });

  it('restores the original serializer after success and failure', async () => {
    const root = document.body;
    const original = XMLSerializer.prototype.serializeToString;

    await withCaptureClone(root, removeXmlUnsafeAttributes, async () => {
      expect(XMLSerializer.prototype.serializeToString).not.toBe(original);
    });
    expect(XMLSerializer.prototype.serializeToString).toBe(original);

    await expect(
      withCaptureClone(root, removeXmlUnsafeAttributes, async () => {
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');
    expect(XMLSerializer.prototype.serializeToString).toBe(original);
  });

  it('keeps the patch until the last overlapping capture settles', async () => {
    const root = document.body;
    const original = XMLSerializer.prototype.serializeToString;
    let releaseFirst: () => void = () => {};
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withCaptureClone(root, removeXmlUnsafeAttributes, () => firstDone);
    await withCaptureClone(root, removeXmlUnsafeAttributes, async () => {});
    expect(XMLSerializer.prototype.serializeToString).not.toBe(original);

    releaseFirst();
    await first;
    expect(XMLSerializer.prototype.serializeToString).toBe(original);
  });

  it('does not overwrite a serializer the host page installed during capture', async () => {
    const original = XMLSerializer.prototype.serializeToString;
    const hostSerialize = function (this: XMLSerializer, node: Node) {
      return original.call(this, node);
    };

    await withCaptureClone(document.body, removeXmlUnsafeAttributes, async () => {
      XMLSerializer.prototype.serializeToString = hostSerialize;
    });

    expect(XMLSerializer.prototype.serializeToString).toBe(hostSerialize);
    XMLSerializer.prototype.serializeToString = original;
  });

  it('runs the capture without a marker when XMLSerializer is unavailable', async () => {
    const root = document.body;
    delete globals.XMLSerializer;
    await expect(
      withCaptureClone(root, removeXmlUnsafeAttributes, async (style) => style)
    ).resolves.toEqual({});
  });

  it('runs the capture unpatched and unmarked when the host page froze the serializer', async () => {
    const prototype = XMLSerializer.prototype;
    const original = prototype.serializeToString;
    Object.defineProperty(prototype, 'serializeToString', {
      value: original,
      writable: false,
      configurable: true,
    });

    try {
      const style = await withCaptureClone(
        document.body,
        removeXmlUnsafeAttributes,
        async (captureStyle) => {
          expect(prototype.serializeToString).toBe(original);
          return captureStyle;
        }
      );
      expect(style).toEqual({});
      expect(prototype.serializeToString).toBe(original);
    } finally {
      Object.defineProperty(prototype, 'serializeToString', {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });

  it('leaves invalid host calls to the native serializer during capture', async () => {
    /** Captures the serializer's error message for a null node without interrupting the test. */
    const serializeNull = (): string => {
      try {
        new XMLSerializer().serializeToString(null as unknown as Node);
        return 'no error';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };

    const nativeMessage = serializeNull();
    const wrappedMessage = await withCaptureClone(
      document.body,
      removeXmlUnsafeAttributes,
      async () => serializeNull()
    );

    expect(nativeMessage).not.toBe('no error');
    expect(wrappedMessage).toBe(nativeMessage);
  });

  it('keeps prefixed attributes that a declaration in the output binds', async () => {
    document.body.innerHTML =
      '<div id="icons">' +
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">' +
      '<g inkscape:label="Layer 1" wire:key="g1"><use id="scripted"></use></g>' +
      '</svg><a href="/" wire:navigate>Home</a></div>';
    document.getElementById('scripted')!.setAttribute('xlink:href', '#dot');
    const root = document.getElementById('icons')!;

    const markup = await withCaptureClone(root, removeXmlUnsafeAttributes, async (captureStyle) =>
      new XMLSerializer().serializeToString(
        buildOwnedCaptureSvg(root.cloneNode(true) as HTMLElement, captureStyle)
      )
    );

    expect(hasParserError(markup)).toBe(false);
    expect(markup).toContain('inkscape:label="Layer 1"');
    expect(markup).toContain('xlink:href="#dot"');
    expect(markup).not.toContain('wire:key');
    expect(markup).not.toContain('wire:navigate');
  });

  it('removes prefixed attributes whose prefix is declared only outside the captured element', async () => {
    document.body.innerHTML =
      '<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><g id="layer" inkscape:label="Layer 1"></g></svg>';
    const root = document.getElementById('layer')!;

    const markup = await withCaptureClone(root, removeXmlUnsafeAttributes, async (captureStyle) =>
      new XMLSerializer().serializeToString(
        buildOwnedCaptureSvg(root.cloneNode(true) as HTMLElement, captureStyle)
      )
    );

    expect(hasParserError(markup)).toBe(false);
    expect(markup).not.toContain('inkscape:label');
  });

  it('cleans the clone when the capture target is an iframe', async () => {
    document.body.innerHTML = '<iframe id="frame"></iframe>';
    const frame = document.getElementById('frame') as HTMLIFrameElement;
    frame.contentDocument!.body.innerHTML = FRAMEWORK_MARKUP;
    const options = { skipFonts: true, width: 200, height: 100 };

    const unsafe = decodeSvgDataUrl(await toSvg(frame, options));
    const safe = decodeSvgDataUrl(
      await withCaptureClone(frame, removeXmlUnsafeAttributes, (style) =>
        toSvg(frame, { ...options, style })
      )
    );

    expect(hasParserError(unsafe)).toBe(true);
    expect(hasParserError(safe)).toBe(false);
    expect(safe).not.toContain('bugpin-capture');
  });

  // Fails if html-to-image stops applying its style option to the root clone or stops
  // serializing through XMLSerializer, the two behaviors capture cleanup relies on.
  it('makes html-to-image output decodable on framework markup', async () => {
    document.body.innerHTML = FRAMEWORK_MARKUP;
    const target = document.querySelector('main') as HTMLElement;
    const options = { skipFonts: true, width: 200, height: 100 };

    const unsafe = decodeSvgDataUrl(await toSvg(target, options));
    const safe = decodeSvgDataUrl(
      await withCaptureClone(target, removeXmlUnsafeAttributes, (style) =>
        toSvg(target, { ...options, style })
      )
    );

    expect(hasParserError(unsafe)).toBe(true);
    expect(hasParserError(safe)).toBe(false);
    expect(safe).not.toContain('bugpin-capture');
    expect(target.querySelector('a')!.hasAttribute('wire:navigate')).toBe(true);
  });
});
