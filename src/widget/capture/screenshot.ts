import { toCanvas } from 'html-to-image';
import { withCaptureClone } from './capture-clone';
import { recordScrollbars } from './scrollbars';
import { removeXmlUnsafeAttributes } from './xml-safe-serialization';

type ToCanvasOptions = NonNullable<Parameters<typeof toCanvas>[1]>;

export type CaptureMethod = 'visible' | 'fullpage' | 'element';

export interface CaptureOptions {
  method?: CaptureMethod;
  selector?: string;
  useScreenCaptureAPI?: boolean;
  cacheBust?: boolean;
  // When set, overrides the device pixel ratio used for capture. Lets callers
  // trade resolution for a smaller output, e.g. to fit a server size budget.
  // Still clamped to safe canvas/pixel limits.
  pixelRatioOverride?: number;
}

// Guardrails to prevent crashes
const IMAGE_WAIT_TIMEOUT_MS = 3000;
const MAX_PIXEL_RATIO = 2;
const MAX_CANVAS_DIMENSION = 16384;
const MAX_TOTAL_PIXELS = 40_000_000;

// Data attribute used to exclude elements from capture
const EXCLUDE_ATTRIBUTE = 'data-bugpin-exclude';

/**
 * Wait for fonts to be ready
 */
async function waitForFonts(): Promise<void> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
}

/**
 * Wait for images within an element to be loaded and decoded
 * Uses addEventListener to avoid clobbering existing handlers
 */
async function waitForImages(element: HTMLElement): Promise<void> {
  const images = element.querySelectorAll('img');
  const promises: Promise<void>[] = [];

  images.forEach((img) => {
    promises.push(
      new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          img.removeEventListener('load', onLoad);
          img.removeEventListener('error', finish);
          resolve();
        };
        const onLoad = async () => {
          try {
            await img.decode?.();
          } catch {
            // Failed images must not block capture.
          } finally {
            finish();
          }
        };
        const timer = setTimeout(finish, IMAGE_WAIT_TIMEOUT_MS);
        if (img.complete) {
          void onLoad();
        } else {
          img.addEventListener('load', onLoad, { once: true });
          img.addEventListener('error', finish, { once: true });
        }
      })
    );
  });

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

/**
 * Calculate safe pixel ratio that won't exceed limits
 * Throws if dimensions exceed limits even at DPR 1
 * @param width - Width in CSS pixels (will be rounded up)
 * @param height - Height in CSS pixels (will be rounded up)
 * @param mode - Capture mode for context-specific error messages
 */
function getSafePixelRatio(
  width: number,
  height: number,
  mode: CaptureMethod = 'visible',
  override?: number
): number {
  // Round up to handle float dimensions from getBoundingClientRect
  const w = Math.ceil(width);
  const h = Math.ceil(height);

  // First check if dimensions are impossible even at DPR 1
  if (w > MAX_CANVAS_DIMENSION || h > MAX_CANVAS_DIMENSION) {
    if (mode === 'fullpage') {
      throw new Error(
        `Full page dimensions (${w}x${h}) exceed maximum canvas size (${MAX_CANVAS_DIMENSION}px). ` +
          `This page is too large for full page capture. Use visible viewport mode instead.`
      );
    }
    throw new Error(
      `Screenshot dimensions (${w}x${h}) exceed maximum canvas size (${MAX_CANVAS_DIMENSION}px). ` +
        `Try capturing a smaller element or use visible viewport mode.`
    );
  }

  if (w * h > MAX_TOTAL_PIXELS) {
    if (mode === 'fullpage') {
      throw new Error(
        `Full page total pixels (${w * h}) exceed maximum (${MAX_TOTAL_PIXELS}). ` +
          `This page is too large for full page capture. Use visible viewport mode instead.`
      );
    }
    throw new Error(
      `Screenshot total pixels (${w * h}) exceed maximum (${MAX_TOTAL_PIXELS}). ` +
        `Try capturing a smaller element or use visible viewport mode.`
    );
  }

  const baseDpr =
    typeof override === 'number' && override > 0 ? override : window.devicePixelRatio || 1;
  let dpr = Math.min(baseDpr, MAX_PIXEL_RATIO);

  // Check if output would exceed limits and reduce DPR if needed
  let outputWidth = w * dpr;
  let outputHeight = h * dpr;
  let totalPixels = outputWidth * outputHeight;

  while (
    dpr > 1 &&
    (outputWidth > MAX_CANVAS_DIMENSION ||
      outputHeight > MAX_CANVAS_DIMENSION ||
      totalPixels > MAX_TOTAL_PIXELS)
  ) {
    dpr -= 0.5;
    outputWidth = w * dpr;
    outputHeight = h * dpr;
    totalPixels = outputWidth * outputHeight;
  }

  return Math.max(1, dpr);
}

/**
 * Filter function to exclude BugPin elements from capture
 * Excludes: SCRIPT tags, elements with data-bugpin-exclude attribute
 */
function shouldIncludeNode(node: Node): boolean {
  if (node instanceof HTMLElement) {
    // Exclude script tags
    if (node.tagName === 'SCRIPT') {
      return false;
    }
    // Exclude any element marked with the exclude attribute
    if (node.hasAttribute(EXCLUDE_ATTRIBUTE)) {
      return false;
    }
  }
  return true;
}

/**
 * Render `element` with html-to-image. BugPin's clone is prepared right before
 * serialization: its scrollbars match the live page and its attribute names are
 * valid XML.
 */
function renderToCanvas(
  element: HTMLElement,
  options: ToCanvasOptions
): Promise<HTMLCanvasElement> {
  // html-to-image applies explicit width or height to the root clone itself.
  const rootSizeLocked = options.width !== undefined || options.height !== undefined;
  const scrollbars = recordScrollbars(element, rootSizeLocked);
  return withCaptureClone(
    element,
    (svg, cloneRoot) => {
      scrollbars.apply(cloneRoot);
      removeXmlUnsafeAttributes(svg);
    },
    (style) => toCanvas(element, { ...options, style, filter: scrollbars.observe(options.filter) })
  );
}

/**
 * Find the actual scroll container if the page uses a scrollable div instead of window scroll
 * Returns the scroll container element, or null if window scroll is used
 */
function findScrollContainer(): HTMLElement | null {
  // Check if window is scrolled - if so, use window scroll
  if (window.scrollY > 0 || window.scrollX > 0) {
    return null;
  }

  // Look for elements with overflow:auto or overflow:scroll that are actually scrolled
  const candidates = document.querySelectorAll('*');
  for (const el of candidates) {
    if (!(el instanceof HTMLElement)) continue;

    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;

    // Check if element has scrollable overflow
    const isScrollable =
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowX === 'auto' ||
      overflowX === 'scroll';

    if (isScrollable) {
      // Check if element is actually scrolled or has scrollable content
      const hasVerticalScroll = el.scrollHeight > el.clientHeight && el.scrollTop > 0;
      const hasHorizontalScroll = el.scrollWidth > el.clientWidth && el.scrollLeft > 0;

      if (hasVerticalScroll || hasHorizontalScroll) {
        return el;
      }
    }
  }

  return null;
}

/**
 * Get the background color for the screenshot.
 *
 * Falls back through three layers:
 *   1. `body` background — explicit author CSS.
 *   2. `html` background — explicit author CSS.
 *   3. UA-painted background inferred from `color-scheme` + the system
 *      `prefers-color-scheme` media query. Pages that opt into dark mode via
 *      `color-scheme: dark` (or `light dark` while the system prefers dark)
 *      get a UA dark background that is never exposed through
 *      `getComputedStyle`, so the screenshot has to infer it; otherwise white
 *      text on a white canvas renders as invisible.
 */
function getBackgroundColor(): string {
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;

  const isTransparent = (color: string) =>
    !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';

  if (!isTransparent(bodyBg)) return bodyBg;
  if (!isTransparent(htmlBg)) return htmlBg;

  const rootColorScheme = window.getComputedStyle(document.documentElement).colorScheme || '';
  const allowsDark = /\bdark\b/.test(rootColorScheme);
  const allowsLight = /\blight\b/.test(rootColorScheme);
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (allowsDark && !allowsLight) return '#1c1c1e';
  if (allowsDark && allowsLight && prefersDark) return '#1c1c1e';
  return '#ffffff';
}

// 1x1 transparent PNG used as fallback for cross-origin images that fail to fetch.
// Avoids slow CORS fetch timeouts during screenshot capture.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';

export interface FontSkipResult {
  skip: boolean;
  reason?: string;
}

const FONT_FAMILY_DECLARATION = /font-family\s*:/i;

/**
 * Detect whether the page would crash html-to-image's font-embedding pipeline.
 * Returns a skip signal so the caller can pass `skipFonts: true` to `toCanvas`
 * and bypass the crash entirely.
 *
 * Two known triggers:
 *   1. Cross-origin stylesheet — `cssRules` access throws a SecurityError.
 *   2. `@font-face` rule whose `style.fontFamily` is falsy even though
 *      `cssText` contains the declaration.
 *
 * Short-circuits on first match and never throws.
 */
export function shouldSkipFontEmbedding(): FontSkipResult {
  try {
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        if (sheet.href) {
          return { skip: true, reason: 'cross-origin stylesheet' };
        }
        return { skip: true, reason: 'unreadable stylesheet' };
      }

      if (!rules) continue;
      try {
        for (let i = 0; i < rules.length; i += 1) {
          const rule = rules[i];
          if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
          const fontFaceRule = rule as CSSFontFaceRule;
          const fontFamily = fontFaceRule.style?.fontFamily;
          if (!fontFamily && FONT_FAMILY_DECLARATION.test(fontFaceRule.cssText)) {
            return {
              skip: true,
              reason: 'browser exposes empty fontFamily on @font-face rule',
            };
          }
        }
      } catch {
        return { skip: true, reason: 'unreadable stylesheet' };
      }
    }
  } catch {
    return { skip: true, reason: 'unreadable stylesheet' };
  }

  return { skip: false };
}

/**
 * Build capture options adapted to the current page. Pages without
 * font-embedding hazards get full font embedding for pixel-perfect screenshots.
 * Pages that match a known crash signature skip font embedding so capture
 * still works with system fallback fonts.
 */
function getCaptureDefaults(): ToCanvasOptions {
  const result = shouldSkipFontEmbedding();
  if (result.skip) {
    console.log(`[BugPin] Skipping font embedding: ${result.reason ?? 'unknown reason'}`);
  }
  return {
    skipFonts: result.skip,
    imagePlaceholder: TRANSPARENT_PIXEL,
    // Prevent html-to-image from rejecting when a cloned <img> fails to render.
    // This handles the case where fetch() succeeds (200) but returns non-image
    // content (e.g. HTML error page from a CORS redirect), producing an invalid
    // data URL that triggers img.onerror.
    onImageErrorHandler: () => {},
  };
}

/**
 * Check whether the Screen Capture API is available in this context.
 * Requires HTTPS, browser support for getDisplayMedia, and a host policy that
 * does not restrict display-capture. Same-origin capture is allowed by default.
 */
function isScreenCaptureAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

/**
 * Capture screenshot using Screen Capture API.
 * Hosts that restrict display capture must allow the page with:
 *   Permissions-Policy: display-capture=(self)
 * @returns Base64 data URL of the screenshot
 */
async function captureWithScreenCaptureAPI(): Promise<string> {
  if (!isScreenCaptureAvailable()) {
    throw new Error(
      'Screen Capture API is not available. The page must be served over HTTPS, ' +
        'supported by the browser, and allowed by the host permissions policy.'
    );
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
    } as MediaTrackConstraints,
    audio: false,
    // Chrome/Edge 94+: pre-selects the current tab so the user only needs to
    // click Share rather than hunt for their tab in the picker. Firefox and
    // Safari ignore this option gracefully.
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

/**
 * Capture screenshot of the current page using html-to-image
 * @param options Capture options
 * @returns Base64 data URL of the screenshot
 */
export async function captureScreenshot(options: CaptureOptions = {}): Promise<string> {
  const {
    method = 'visible',
    selector,
    useScreenCaptureAPI = false,
    cacheBust,
    pixelRatioOverride,
  } = options;

  // Use Screen Capture API if enabled, fall back to html-to-image on failure
  if (useScreenCaptureAPI) {
    try {
      return await captureWithScreenCaptureAPI();
    } catch (error) {
      console.warn(
        '[BugPin] Screen Capture API unavailable, falling back to DOM capture.',
        'Ensure the page is served over HTTPS and the browser has screen recording permission.',
        `(${error instanceof Error ? error.message : error})`
      );
    }
  }

  // Get the element to capture
  let element: HTMLElement;

  switch (method) {
    case 'element':
      if (!selector) {
        throw new Error('Selector required for element capture');
      }
      const found = document.querySelector(selector);
      if (!found || !(found instanceof HTMLElement)) {
        throw new Error(`Element not found: ${selector}`);
      }
      element = found;
      break;

    case 'fullpage':
    case 'visible':
    default:
      // Use documentElement to capture the true document root including fixed elements
      element = document.documentElement;
      break;
  }

  // Snapshot scroll position and viewport size IMMEDIATELY at trigger time
  // This prevents race conditions if user scrolls during font/image loading

  // Detect if there's a scroll container (element with overflow:auto/scroll that's actually scrolled)
  const scrollContainer = findScrollContainer();

  let scrollX: number;
  let scrollY: number;
  let viewportWidth: number;
  let viewportHeight: number;

  if (
    scrollContainer &&
    scrollContainer !== document.documentElement &&
    scrollContainer !== document.body
  ) {
    // Scroll container detected - use its scroll position
    scrollX = scrollContainer.scrollLeft;
    scrollY = scrollContainer.scrollTop;
    viewportWidth = scrollContainer.clientWidth;
    viewportHeight = scrollContainer.clientHeight;
    // Override element to capture the scroll container
    if (method === 'visible') {
      element = scrollContainer;
    }
  } else {
    // Normal window scrolling
    scrollX = window.scrollX || window.pageXOffset || 0;
    scrollY = window.scrollY || window.pageYOffset || 0;
    viewportWidth = document.documentElement.clientWidth;
    viewportHeight = document.documentElement.clientHeight;
  }

  // Hide all BugPin elements before capture (use visibility to avoid layout shift)
  const bugpinElements = document.querySelectorAll(`[${EXCLUDE_ATTRIBUTE}]`);
  const originalVisibilities: Map<Element, string> = new Map();
  bugpinElements.forEach((el) => {
    if (el instanceof HTMLElement) {
      originalVisibilities.set(el, el.style.visibility);
      el.style.visibility = 'hidden';
    }
  });

  try {
    // Wait for fonts and images to be ready
    await waitForFonts();
    await waitForImages(element);

    // For visible mode: capture area that includes the viewport, then crop
    if (method === 'visible') {
      const dpr = getSafePixelRatio(viewportWidth, viewportHeight, 'visible', pixelRatioOverride);
      const bgColor = getBackgroundColor();

      // Calculate the area we need to capture (from origin to bottom of viewport)
      const captureWidth = scrollX + viewportWidth;
      const captureHeight = scrollY + viewportHeight;

      // Capture from origin to the end of the visible viewport
      const toCanvasOptions: Parameters<typeof toCanvas>[1] = {
        ...getCaptureDefaults(),
        cacheBust: cacheBust ?? false,
        pixelRatio: dpr,
        width: captureWidth,
        height: captureHeight,
        backgroundColor: bgColor,
        filter: shouldIncludeNode,
      };

      const fullCanvas = await renderToCanvas(element, toCanvasOptions);

      // Crop to the visible viewport
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = viewportWidth * dpr;
      croppedCanvas.height = viewportHeight * dpr;

      const ctx = croppedCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Fill background first
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height);

      // Draw the viewport portion (source coordinates are in device pixels)
      ctx.drawImage(
        fullCanvas,
        scrollX * dpr, // source x
        scrollY * dpr, // source y
        viewportWidth * dpr, // source width
        viewportHeight * dpr, // source height
        0, // dest x
        0, // dest y
        viewportWidth * dpr, // dest width
        viewportHeight * dpr // dest height
      );

      return croppedCanvas.toDataURL('image/png');
    }

    // For fullpage mode: capture the entire document
    if (method === 'fullpage') {
      const fullWidth = Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.offsetWidth
      );
      const fullHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );

      const dpr = getSafePixelRatio(fullWidth, fullHeight, 'fullpage', pixelRatioOverride);
      const bgColor = getBackgroundColor();

      const toCanvasOptions: Parameters<typeof toCanvas>[1] = {
        ...getCaptureDefaults(),
        cacheBust: cacheBust ?? true, // Default on for fullpage (more likely to have stale images)
        pixelRatio: dpr,
        width: fullWidth,
        height: fullHeight,
        backgroundColor: bgColor,
        filter: shouldIncludeNode,
      };

      const canvas = await renderToCanvas(element, toCanvasOptions);
      return canvas.toDataURL('image/png');
    }

    // For element mode: capture the specific element
    const rect = element.getBoundingClientRect();
    const dpr = getSafePixelRatio(rect.width, rect.height, 'element', pixelRatioOverride);
    const bgColor = getBackgroundColor();

    const toCanvasOptions: Parameters<typeof toCanvas>[1] = {
      ...getCaptureDefaults(),
      cacheBust: cacheBust ?? false, // Default off for element mode
      pixelRatio: dpr,
      backgroundColor: bgColor,
      filter: shouldIncludeNode,
    };

    const canvas = await renderToCanvas(element, toCanvasOptions);
    return canvas.toDataURL('image/png');
  } finally {
    // Restore visibility of all BugPin elements
    bugpinElements.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.style.visibility = originalVisibilities.get(el) || '';
      }
    });
  }
}
