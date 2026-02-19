import { toCanvas } from 'html-to-image';

type ToCanvasOptions = NonNullable<Parameters<typeof toCanvas>[1]>;

export type CaptureMethod = 'visible' | 'fullpage' | 'element';

export interface CaptureOptions {
  method?: CaptureMethod;
  selector?: string;
  useScreenCaptureAPI?: boolean;
  cacheBust?: boolean;
}

// Guardrails to prevent crashes
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
    if (!img.complete) {
      // Image not yet loaded - wait for load then decode
      promises.push(
        new Promise<void>((resolve) => {
          const onLoad = async () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            // Decode after load for proper rendering
            if (img.decode) {
              try {
                await img.decode();
              } catch {
                // Ignore decode errors
              }
            }
            resolve();
          };
          const onError = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onError);
            resolve(); // Don't block on failed images
          };
          img.addEventListener('load', onLoad, { once: true });
          img.addEventListener('error', onError, { once: true });
        }),
      );
    } else if (img.decode) {
      // Image already loaded - just decode
      promises.push(img.decode().catch(() => {}));
    }
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
function getSafePixelRatio(width: number, height: number, mode: CaptureMethod = 'visible'): number {
  // Round up to handle float dimensions from getBoundingClientRect
  const w = Math.ceil(width);
  const h = Math.ceil(height);

  // First check if dimensions are impossible even at DPR 1
  if (w > MAX_CANVAS_DIMENSION || h > MAX_CANVAS_DIMENSION) {
    if (mode === 'fullpage') {
      throw new Error(
        `Full page dimensions (${w}x${h}) exceed maximum canvas size (${MAX_CANVAS_DIMENSION}px). ` +
          `This page is too large for full page capture. Use visible viewport mode instead.`,
      );
    }
    throw new Error(
      `Screenshot dimensions (${w}x${h}) exceed maximum canvas size (${MAX_CANVAS_DIMENSION}px). ` +
        `Try capturing a smaller element or use visible viewport mode.`,
    );
  }

  if (w * h > MAX_TOTAL_PIXELS) {
    if (mode === 'fullpage') {
      throw new Error(
        `Full page total pixels (${w * h}) exceed maximum (${MAX_TOTAL_PIXELS}). ` +
          `This page is too large for full page capture. Use visible viewport mode instead.`,
      );
    }
    throw new Error(
      `Screenshot total pixels (${w * h}) exceed maximum (${MAX_TOTAL_PIXELS}). ` +
        `Try capturing a smaller element or use visible viewport mode.`,
    );
  }

  let dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

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
 * Get the background color for the screenshot
 */
function getBackgroundColor(): string {
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;

  // Check if color is transparent
  const isTransparent = (color: string) =>
    !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';

  if (!isTransparent(bodyBg)) return bodyBg;
  if (!isTransparent(htmlBg)) return htmlBg;
  return '#ffffff';
}

// 1x1 transparent PNG used as fallback for cross-origin images that fail to fetch.
// Avoids slow CORS fetch timeouts during screenshot capture.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==';

/**
 * Detect whether the page has cross-origin stylesheets that html-to-image
 * cannot read. Accessing `cssRules` on a cross-origin sheet throws a
 * SecurityError - this is what triggers the .trim() crash in html-to-image's
 * font embedding code.
 */
function hasCrossOriginStyleSheets(): boolean {
  try {
    for (const sheet of document.styleSheets) {
      if (sheet.href) {
        try {
          void sheet.cssRules;
        } catch {
          return true;
        }
      }
    }
  } catch {
    return true;
  }
  return false;
}

/**
 * Build capture options adapted to the current page. Same-origin pages get
 * full font embedding for pixel-perfect screenshots. Pages with cross-origin
 * stylesheets (WordPress, sites with CDN assets) skip font embedding to avoid
 * crashes and slow CORS timeouts.
 */
function getCaptureDefaults(): ToCanvasOptions {
  const crossOrigin = hasCrossOriginStyleSheets();
  if (crossOrigin) {
    console.log('[BugPin] Cross-origin stylesheets detected, skipping font embedding');
  }
  return {
    skipFonts: crossOrigin,
    imagePlaceholder: TRANSPARENT_PIXEL,
  };
}

/**
 * Capture screenshot using Screen Capture API
 * Requires user permission to select tab/window to capture
 * Provides pixel-perfect screenshots including videos, canvas, WebGL
 * @returns Base64 data URL of the screenshot
 */
async function captureWithScreenCaptureAPI(): Promise<string> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',
      } as MediaTrackConstraints,
      audio: false,
    });

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
    stream.getTracks().forEach((track) => track.stop());

    return canvas.toDataURL('image/png');
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      throw new Error('Screen capture permission denied');
    }
    throw error;
  }
}

/**
 * Capture screenshot of the current page using html-to-image
 * @param options Capture options
 * @returns Base64 data URL of the screenshot
 */
export async function captureScreenshot(options: CaptureOptions = {}): Promise<string> {
  const { method = 'visible', selector, useScreenCaptureAPI = false, cacheBust } = options;

  // Use Screen Capture API if enabled
  if (useScreenCaptureAPI) {
    return captureWithScreenCaptureAPI();
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
      const dpr = getSafePixelRatio(viewportWidth, viewportHeight, 'visible');
      const bgColor = getBackgroundColor();

      // Calculate the area we need to capture (from origin to bottom of viewport)
      const captureWidth = scrollX + viewportWidth;
      const captureHeight = scrollY + viewportHeight;

      // Debug logging
      console.log('[BugPin] Capture debug:', {
        scrollX,
        scrollY,
        viewportWidth,
        viewportHeight,
        captureWidth,
        captureHeight,
        dpr,
      });

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

      const fullCanvas = await toCanvas(element, toCanvasOptions);

      // Debug: log actual canvas dimensions
      console.log('[BugPin] Canvas captured:', {
        canvasWidth: fullCanvas.width,
        canvasHeight: fullCanvas.height,
        expectedWidth: captureWidth * dpr,
        expectedHeight: captureHeight * dpr,
      });

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
        viewportHeight * dpr, // dest height
      );

      return croppedCanvas.toDataURL('image/png');
    }

    // For fullpage mode: capture the entire document
    if (method === 'fullpage') {
      const fullWidth = Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.offsetWidth,
      );
      const fullHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
      );

      const dpr = getSafePixelRatio(fullWidth, fullHeight, 'fullpage');
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

      const canvas = await toCanvas(element, toCanvasOptions);
      return canvas.toDataURL('image/png');
    }

    // For element mode: capture the specific element
    const rect = element.getBoundingClientRect();
    const dpr = getSafePixelRatio(rect.width, rect.height, 'element');
    const bgColor = getBackgroundColor();

    const toCanvasOptions: Parameters<typeof toCanvas>[1] = {
      ...getCaptureDefaults(),
      cacheBust: cacheBust ?? false, // Default off for element mode
      pixelRatio: dpr,
      backgroundColor: bgColor,
      filter: shouldIncludeNode,
    };

    const canvas = await toCanvas(element, toCanvasOptions);
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

/**
 * Convert data URL to Blob
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binaryString = atob(parts[1]);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

/**
 * Get file extension from data URL
 */
export function getExtensionFromDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/webp')) {
    return 'webp';
  } else if (dataUrl.startsWith('data:image/jpeg')) {
    return 'jpg';
  } else if (dataUrl.startsWith('data:image/gif')) {
    return 'gif';
  }
  return 'png';
}
