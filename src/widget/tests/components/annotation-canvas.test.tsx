import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render } from 'preact';
import { installDom } from '../helpers/dom';
import { installFabricMock } from '../helpers/fabric-mock';

installFabricMock();

let restoreDom: (() => void) | null = null;
let originalGetBoundingClientRect: (() => DOMRect) | undefined;
const originalMatchMedia = globalThis.window?.matchMedia;

async function waitFor(condition: () => boolean, message: string, timeoutMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__fabricCanvasReady;
  restoreDom = installDom();
  if (globalThis.window?.matchMedia) {
    globalThis.window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia;
  }
  if (globalThis.HTMLElement) {
    originalGetBoundingClientRect = globalThis.HTMLElement.prototype.getBoundingClientRect;
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
  if (globalThis.HTMLElement && originalGetBoundingClientRect) {
    globalThis.HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  }
  if (globalThis.window && originalMatchMedia) {
    globalThis.window.matchMedia = originalMatchMedia;
  }
  restoreDom?.();
  restoreDom = null;
});

describe('AnnotationCanvas', () => {
  it('renders and triggers save/cancel actions', async () => {
    const { AnnotationCanvas } = await import('../../annotate/AnnotationCanvas');

    const onSave = mock(() => undefined);
    const onCancel = mock(() => undefined);

    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <AnnotationCanvas
        screenshot="data:image/png;base64,stub"
        isMaximized={false}
        onToggleMaximize={() => undefined}
        onSave={onSave}
        onCancel={onCancel}
      />,
      container
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const canvasLayer = container.querySelector('canvas')?.parentElement;
    const canvasRegion = canvasLayer?.parentElement;
    const annotationRoot = canvasRegion?.parentElement;

    expect(canvasLayer?.classList.contains('absolute')).toBe(true);
    expect(canvasLayer?.classList.contains('inset-0')).toBe(true);
    expect(canvasRegion?.classList.contains('overflow-hidden')).toBe(true);

    expect(annotationRoot?.classList.contains('h-full')).toBe(true);
    expect(annotationRoot?.classList.contains('min-h-0')).toBe(true);
    expect(canvasRegion?.classList.contains('flex-auto')).toBe(true);
    expect(canvasRegion?.classList.contains('min-h-0')).toBe(true);
    expect(canvasRegion?.classList.contains('min-h-[600px]')).toBe(false);

    const buttons = Array.from(container.querySelectorAll('button'));
    const cancelButton = buttons.find((btn) => btn.textContent?.trim() === 'Cancel');
    const doneButton = buttons.find((btn) => btn.textContent?.trim() === 'Done');

    cancelButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    doneButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith('data:image/png;base64,stub', { objects: [] });

    render(null, container);
    container.remove();
  });

  it('switches tools, colors, and zooms the canvas', async () => {
    const { AnnotationCanvas } = await import('../../annotate/AnnotationCanvas');

    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <AnnotationCanvas
        screenshot="data:image/png;base64,stub"
        isMaximized={false}
        onToggleMaximize={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
      container
    );

    await waitFor(
      () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
      'Fabric canvas not ready'
    );

    const canvasEl = container.querySelector('canvas') as HTMLCanvasElement & {
      __fabricCanvas?: {
        getZoom: () => number;
        freeDrawingBrush?: { color?: string; width?: number };
      };
    };
    const canvas = canvasEl.__fabricCanvas as
      | {
          getZoom: () => number;
          backgroundImage?: unknown;
          freeDrawingBrush?: { color?: string; width?: number };
          events?: Map<string, unknown>;
        }
      | undefined;
    if (!canvas) {
      throw new Error('Fabric canvas missing');
    }
    await waitFor(() => Boolean(canvas.events?.has('mouse:down')), 'Canvas handlers not ready');

    const selectButton = container.querySelector(
      'button[aria-label="Select"]'
    ) as HTMLButtonElement;
    expect(selectButton.className).toContain('text-primary');

    const penButton = container.querySelector('button[aria-label="Pen"]') as HTMLButtonElement;
    penButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[aria-label="Pen"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Pen tool not active'
    );

    const blueButton = container.querySelector('button[aria-label="Blue"]') as HTMLButtonElement;
    expect(blueButton.getAttribute('aria-pressed')).toBe('false');
    blueButton.click();
    await waitFor(() => canvas.freeDrawingBrush?.color === '#3b82f6', 'Brush color not updated');
    expect(blueButton.getAttribute('aria-pressed')).toBe('true');

    const widthButton = container.querySelector('button[aria-label="8px"]') as HTMLButtonElement;
    widthButton.click();
    await waitFor(() => canvas.freeDrawingBrush?.width === 8, 'Brush width not updated');

    await waitFor(() => Boolean(canvas.backgroundImage), 'Screenshot not loaded');
    const fittedZoom = canvas.getZoom();

    const zoomInButton = container.querySelector(
      'button[aria-label="Zoom in"]'
    ) as HTMLButtonElement;
    zoomInButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(canvas.getZoom()).toBeGreaterThan(fittedZoom);

    const fitButton = container.querySelector(
      'button[aria-label="Fit to screen"]'
    ) as HTMLButtonElement;
    fitButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(canvas.getZoom()).toBe(fittedZoom);

    render(null, container);
    container.remove();
  });

  it('enables undo/redo after a drawing event', async () => {
    const { AnnotationCanvas } = await import('../../annotate/AnnotationCanvas');

    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <AnnotationCanvas
        screenshot="data:image/png;base64,stub"
        isMaximized={false}
        onToggleMaximize={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
      container
    );

    await waitFor(
      () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
      'Fabric canvas not ready'
    );

    const canvasEl = container.querySelector('canvas') as HTMLCanvasElement & {
      __fabricCanvas?: {
        getObjects: () => Array<{ width?: number; height?: number }>;
        trigger: (event: string, payload?: unknown) => void;
      };
    };
    const canvas = canvasEl.__fabricCanvas as
      | {
          trigger: (event: string, payload?: unknown) => void;
          events?: Map<string, unknown>;
        }
      | undefined;
    if (!canvas) {
      throw new Error('Fabric canvas missing');
    }
    await waitFor(() => Boolean(canvas.events?.has('mouse:down')), 'Canvas handlers not ready');

    const undoButton = container.querySelector(
      'button[aria-label="Undo (Ctrl+Z)"]'
    ) as HTMLButtonElement;
    const redoButton = container.querySelector(
      'button[aria-label="Redo (Ctrl+Shift+Z)"]'
    ) as HTMLButtonElement;

    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(true);

    canvas.trigger('path:created');
    await waitFor(() => undoButton.disabled === false, 'Undo button not enabled');

    undoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    await waitFor(() => redoButton.disabled === false, 'Redo button not enabled');

    render(null, container);
    container.remove();
  });

  it('updates cursor and drawing mode when switching tools', async () => {
    const { AnnotationCanvas } = await import('../../annotate/AnnotationCanvas');

    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <AnnotationCanvas
        screenshot="data:image/png;base64,stub"
        isMaximized={false}
        onToggleMaximize={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
      container
    );

    await waitFor(
      () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
      'Fabric canvas not ready'
    );

    const canvasEl = container.querySelector('canvas') as HTMLCanvasElement & {
      __fabricCanvas?: {
        isDrawingMode?: boolean;
        selection?: boolean;
        defaultCursor?: string;
        events?: Map<string, unknown>;
      };
    };
    const canvas = canvasEl.__fabricCanvas;
    if (!canvas) {
      throw new Error('Fabric canvas missing');
    }

    await waitFor(() => Boolean(canvas.events?.has('mouse:down')), 'Canvas handlers not ready');

    const penButton = container.querySelector('button[aria-label="Pen"]') as HTMLButtonElement;
    penButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[aria-label="Pen"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Pen tool not active'
    );
    await waitFor(() => canvas.isDrawingMode === true, 'Pen drawing mode not enabled');
    expect(canvas.selection).toBe(false);
    expect(canvas.defaultCursor).toBe('crosshair');

    const panButton = container.querySelector(
      'button[aria-label="Pan (or hold Space)"]'
    ) as HTMLButtonElement;
    panButton.click();

    await waitFor(
      () =>
        (
          container.querySelector(
            'button[aria-label="Pan (or hold Space)"]'
          ) as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Pan tool not active'
    );
    await waitFor(() => canvas.isDrawingMode === false, 'Pan should disable drawing');
    expect(canvas.selection).toBe(false);
    expect(canvas.defaultCursor).toBe('grab');

    const selectButton = container.querySelector(
      'button[aria-label="Select"]'
    ) as HTMLButtonElement;
    selectButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[aria-label="Select"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Select tool not active'
    );
    await waitFor(() => canvas.selection === true, 'Select should enable selection');
    expect(canvas.defaultCursor).toBe('default');

    render(null, container);
    container.remove();
  });

  describe('viewport', () => {
    type Vpt = [number, number, number, number, number, number];
    type MockCanvas = {
      viewportTransform: Vpt;
      backgroundImage?: unknown;
      defaultCursor?: string;
      events?: Map<string, unknown>;
      getZoom: () => number;
      getObjects: () => unknown[];
      add: (obj: unknown) => void;
      remove: (obj: unknown) => void;
      loadFromJSON: (json: unknown) => Promise<void>;
      trigger: (event: string, payload?: unknown) => void;
      lastExport: { options?: Record<string, unknown>; viewportTransform: Vpt } | null;
    };

    let restoreSize: (() => void) | null = null;
    let pendingCleanup: (() => void) | null = null;
    let viewSize = { width: 832, height: 632 };
    let resizeCallback: (() => void) | null = null;
    const originalResizeObserver = (globalThis as Record<string, unknown>).ResizeObserver;

    beforeEach(() => {
      // 832 x 632 leaves 800 x 600 inside the fit padding, so the 1600 x 1200 mock
      // screenshot loads at half scale and fits at zoom 1.
      viewSize = { width: 832, height: 632 };
      const proto = window.HTMLElement.prototype;
      const width = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
      const height = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
      Object.defineProperty(proto, 'clientWidth', {
        configurable: true,
        get: () => viewSize.width,
      });
      Object.defineProperty(proto, 'clientHeight', {
        configurable: true,
        get: () => viewSize.height,
      });
      restoreSize = () => {
        if (width) Object.defineProperty(proto, 'clientWidth', width);
        if (height) Object.defineProperty(proto, 'clientHeight', height);
      };
      (globalThis as Record<string, unknown>).ResizeObserver = class {
        constructor(callback: () => void) {
          resizeCallback = callback;
        }
        observe() {}
        disconnect() {}
      };
    });

    afterEach(() => {
      // Runs even when a test fails before its own cleanup, so no canvas leaks into later tests.
      pendingCleanup?.();
      pendingCleanup = null;
      restoreSize?.();
      restoreSize = null;
      resizeCallback = null;
      (globalThis as Record<string, unknown>).ResizeObserver = originalResizeObserver;
    });

    function resizeView(width: number, height: number) {
      viewSize = { width, height };
      resizeCallback?.();
    }

    async function renderCanvas(onSave: (image: string, annotations: object) => void = () => {}) {
      const { AnnotationCanvas } = await import('../../annotate/AnnotationCanvas');
      const container = document.createElement('div');
      document.body.appendChild(container);
      render(
        <AnnotationCanvas
          screenshot="data:image/png;base64,stub"
          isMaximized={false}
          onToggleMaximize={() => undefined}
          onSave={onSave}
          onCancel={() => undefined}
        />,
        container
      );
      await waitFor(
        () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
        'Fabric canvas not ready'
      );
      const canvasEl = container.querySelector('canvas') as HTMLCanvasElement & {
        __fabricCanvas?: MockCanvas;
      };
      const canvas = canvasEl.__fabricCanvas;
      if (!canvas) throw new Error('Fabric canvas missing');
      await waitFor(() => Boolean(canvas.backgroundImage), 'Screenshot not loaded');
      await waitFor(() => Boolean(canvas.events?.has('mouse:down')), 'Canvas handlers not ready');
      const fitButton = () =>
        container.querySelector('button[aria-label="Fit to screen"]') as HTMLButtonElement;
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        render(null, container);
        container.remove();
      };
      pendingCleanup = cleanup;
      return { container, canvas, canvasEl, fitButton, cleanup };
    }

    /** Waits until the tool is active and its Fabric `mouse:down` handler is registered. */
    async function selectTool(container: HTMLElement, canvas: MockCanvas, label: string) {
      const handlers = () => [...((canvas.events?.get('mouse:down') ?? []) as Set<unknown>)];
      const previous = handlers();
      const button = () =>
        container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
      button()!.click();
      await waitFor(
        () =>
          (button()?.className.includes('text-primary') ?? false) &&
          handlers().some((handler) => !previous.includes(handler)),
        `${label} tool not ready`
      );
    }

    function touchDispatcher(target: HTMLElement) {
      return (type: string, points: Array<[number, number]>, targets: Array<EventTarget> = []) => {
        const event = new window.Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', {
          value: points.map(([clientX, clientY], index) => ({
            clientX,
            clientY,
            target: targets[index] ?? target,
          })),
        });
        target.dispatchEvent(event);
        return event;
      };
    }

    function wheel(
      canvas: MockCanvas,
      init: { deltaY: number; ctrlKey?: boolean; offsetX?: number; offsetY?: number }
    ) {
      canvas.trigger('mouse:wheel', {
        e: {
          deltaX: 0,
          deltaMode: 0,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
          preventDefault: () => undefined,
          ...init,
        },
      });
    }

    it('fits the screenshot, zooms with ctrl + wheel, pans with the wheel and refits', async () => {
      const { canvas, fitButton, cleanup } = await renderCanvas();

      expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 16, 16]);
      expect(fitButton().textContent).toBe('50%');

      // A mouse notch is capped at a 1.25x step.
      wheel(canvas, { deltaY: -100, ctrlKey: true, offsetX: 416, offsetY: 316 });
      await waitFor(() => fitButton().textContent === '63%', 'Ctrl + wheel did not zoom in');
      const zoomed = [...canvas.viewportTransform];
      expect(zoomed[0]).toBeGreaterThan(1);
      // The scene point under the pointer stays put.
      expect((416 - zoomed[4]) / zoomed[0]).toBeCloseTo(400);

      wheel(canvas, { deltaY: 50 });
      expect(canvas.viewportTransform[0]).toBe(zoomed[0]);
      expect(canvas.viewportTransform[5]).toBeCloseTo(zoomed[5] - 50);

      fitButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await waitFor(() => fitButton().textContent === '50%', 'Fit did not restore the zoom');
      expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 16, 16]);

      cleanup();
    });

    it('refits on resize while fitted and keeps a user zoom otherwise', async () => {
      const { canvas, cleanup } = await renderCanvas();

      // The fitted screenshot cannot pan, so this wheel changes nothing and the view
      // stays fitted.
      wheel(canvas, { deltaY: 50 });
      resizeView(1032, 632);
      expect(canvas.viewportTransform).toEqual([1, 0, 0, 1, 116, 16]);

      wheel(canvas, { deltaY: -100, ctrlKey: true, offsetX: 516, offsetY: 316 });
      const zoomed = canvas.viewportTransform[0];
      expect(zoomed).toBeCloseTo(1.25);

      resizeView(1232, 832);
      expect(canvas.viewportTransform[0]).toBe(zoomed);
      // The screenshot now fits, so the axis is centered rather than shifted.
      expect(canvas.viewportTransform[4]).toBeCloseTo((1232 - 800 * zoomed) / 2);

      cleanup();
    });

    it('exports the screenshot area at its original resolution while zoomed', async () => {
      const onSave = mock(() => undefined);
      const { container, canvas, cleanup } = await renderCanvas(onSave);

      wheel(canvas, { deltaY: -300, ctrlKey: true, offsetX: 100, offsetY: 100 });
      const zoomedViewport = [...canvas.viewportTransform];

      const doneButton = Array.from(container.querySelectorAll('button')).find(
        (btn) => btn.textContent?.trim() === 'Done'
      );
      doneButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      expect(canvas.lastExport?.options).toMatchObject({
        left: 0,
        top: 0,
        width: 1600,
        height: 1200,
        multiplier: 1,
      });
      expect(canvas.lastExport?.viewportTransform).toEqual([2, 0, 0, 2, 0, 0]);
      expect(canvas.viewportTransform).toEqual(zoomedViewport as Vpt);
      expect(onSave).toHaveBeenCalled();

      cleanup();
    });

    it('cancels the shape in progress and zooms when a second finger pinches', async () => {
      const { container, canvas, canvasEl, cleanup } = await renderCanvas();

      await selectTool(container, canvas, 'Rectangle');
      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });
      expect(canvas.getObjects()).toHaveLength(1);

      const reachedCanvas: string[] = [];
      ['touchstart', 'touchmove', 'touchend'].forEach((type) =>
        canvasEl.addEventListener(type, () => reachedCanvas.push(type))
      );
      const touch = touchDispatcher(canvasEl);

      const start = touch('touchstart', [
        [366, 316],
        [466, 316],
      ]);
      expect(start.defaultPrevented).toBe(true);
      expect(canvas.getObjects()).toHaveLength(0);

      touch('touchmove', [
        [316, 316],
        [516, 316],
      ]);
      expect(canvas.getZoom()).toBeCloseTo(2);

      touch('touchend', []);
      // Fabric never sees the second finger, but the final touchend reaches it so it can
      // release its listeners.
      expect(reachedCanvas).toEqual(['touchend']);
      cleanup();
    });

    it('keeps a pinch anchored when the view resizes between finger moves', async () => {
      const { canvas, canvasEl, cleanup } = await renderCanvas();
      const touch = touchDispatcher(canvasEl);
      touch('touchstart', [
        [300, 300],
        [500, 300],
      ]);
      touch('touchmove', [
        [200, 300],
        [600, 300],
      ]);
      resizeView(1032, 632);
      const afterResize: Vpt = [...canvas.viewportTransform];
      touch('touchmove', [
        [200, 300],
        [600, 300],
      ]);
      expect(canvas.viewportTransform).toEqual(afterResize);
      cleanup();
    });

    it('removes a text box the first finger created when the touch becomes a pinch', async () => {
      const { container, canvas, canvasEl, cleanup } = await renderCanvas();
      const objectsBefore = canvas.getObjects().length;

      await selectTool(container, canvas, 'Text');

      const touch = touchDispatcher(canvasEl);
      touch('touchstart', [[300, 300]]);
      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });
      expect(canvas.getObjects()).toHaveLength(objectsBefore + 1);

      const zoom = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!;
      touchDispatcher(zoom)(
        'touchstart',
        [
          [300, 300],
          [500, 500],
        ],
        [canvasEl, zoom]
      );
      touch(
        'touchstart',
        [
          [300, 300],
          [500, 500],
          [400, 300],
        ],
        [canvasEl, zoom, canvasEl]
      );
      expect(canvas.getObjects()).toHaveLength(objectsBefore);

      touch('touchend', []);
      cleanup();
    });

    it('keeps a finished annotation when a later pinch starts', async () => {
      const { container, canvas, canvasEl, cleanup } = await renderCanvas();
      const objectsBefore = canvas.getObjects().length;
      await selectTool(container, canvas, 'Text');

      const touch = touchDispatcher(canvasEl);
      touch('touchstart', [[300, 300]]);
      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });
      touch('touchend', []);
      expect(canvas.getObjects()).toHaveLength(objectsBefore + 1);

      touch('touchstart', [
        [300, 300],
        [400, 300],
      ]);
      expect(canvas.getObjects()).toHaveLength(objectsBefore + 1);

      touch('touchend', []);
      cleanup();
    });

    it('preserves restored annotations when undo completes before a touch becomes a pinch', async () => {
      const { container, canvas, canvasEl, cleanup } = await renderCanvas();
      await selectTool(container, canvas, 'Text');

      const originalAnnotation = { id: 'original' };
      canvas.add(originalAnnotation);
      canvas.trigger('path:created');

      const undoButton = container.querySelector(
        'button[aria-label="Undo (Ctrl+Z)"]'
      ) as HTMLButtonElement;
      await waitFor(() => undoButton.disabled === false, 'Undo button not enabled');

      let finishRestore!: () => void;
      const restoredAnnotation = { id: 'restored' };
      canvas.loadFromJSON = () =>
        new Promise<void>((resolve) => {
          finishRestore = () => {
            canvas
              .getObjects()
              .slice()
              .forEach((obj) => canvas.remove(obj));
            canvas.add(restoredAnnotation);
            resolve();
          };
        });

      undoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      // First finger lands while loadFromJSON is still pending.
      const touch = touchDispatcher(canvasEl);
      touch('touchstart', [[300, 300]]);

      // Undo resolves and replaces the canvas objects with new instances.
      finishRestore();
      await Promise.resolve();
      await Promise.resolve();

      // A text box created during the current touch after restoration should still be canceled.
      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });
      expect(canvas.getObjects()).toHaveLength(2);

      // Second finger turns the touch into a pinch.
      touch('touchstart', [
        [300, 300],
        [400, 300],
      ]);
      expect(canvas.getObjects()).toEqual([restoredAnnotation]);

      touch('touchend', []);
      cleanup();
    });

    it('clears a detached in-progress shape when undo resolves mid-drag', async () => {
      const { container, canvas, canvasEl, cleanup } = await renderCanvas();
      await selectTool(container, canvas, 'Rectangle');

      const originalAnnotation = { id: 'original' };
      canvas.add(originalAnnotation);
      canvas.trigger('path:created');

      const undoButton = container.querySelector(
        'button[aria-label="Undo (Ctrl+Z)"]'
      ) as HTMLButtonElement;
      const redoButton = container.querySelector(
        'button[aria-label="Redo (Ctrl+Shift+Z)"]'
      ) as HTMLButtonElement;
      await waitFor(() => undoButton.disabled === false, 'Undo button not enabled');

      let finishRestore!: () => void;
      const restoredAnnotation = { id: 'restored' };
      canvas.loadFromJSON = () =>
        new Promise<void>((resolve) => {
          finishRestore = () => {
            canvas
              .getObjects()
              .slice()
              .forEach((obj) => canvas.remove(obj));
            canvas.add(restoredAnnotation);
            resolve();
          };
        });

      undoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

      // Start dragging a rectangle before loadFromJSON resolves.
      const touch = touchDispatcher(canvasEl);
      touch('touchstart', [[300, 300]]);
      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });
      expect(canvas.getObjects()).toHaveLength(2);

      // Undo resolves and clears the in-progress rectangle.
      finishRestore();
      await waitFor(() => redoButton.disabled === false, 'Redo button not enabled');

      // Finishing the interrupted drag must not commit stale drawing state or clear redo.
      canvas.trigger('mouse:up', { e: {} });
      expect(redoButton.disabled).toBe(false);
      expect(canvas.getObjects()).toEqual([restoredAnnotation]);

      // Turning the touch into a pinch still preserves the restored annotation.
      touch('touchstart', [
        [300, 300],
        [400, 300],
      ]);
      expect(canvas.getObjects()).toEqual([restoredAnnotation]);

      touch('touchend', []);
      cleanup();
    });

    it('ignores a second finger resting outside the canvas or on the zoom controls', async () => {
      const { container, canvas, canvasEl, cleanup } = await renderCanvas();
      const objectsBefore = canvas.getObjects().length;
      await selectTool(container, canvas, 'Text');
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      const zoomButton = container.querySelector(
        'button[aria-label="Zoom in"]'
      ) as HTMLButtonElement;

      const touch = touchDispatcher(canvasEl);
      touch('touchstart', [[300, 300]]);
      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });

      const start = touch(
        'touchstart',
        [
          [20, 20],
          [300, 300],
        ],
        [outside, canvasEl]
      );
      expect(start.defaultPrevented).toBe(false);
      expect(canvas.getObjects()).toHaveLength(objectsBefore + 1);

      const onZoom = touch(
        'touchstart',
        [
          [700, 600],
          [300, 300],
        ],
        [zoomButton, canvasEl]
      );
      expect(onZoom.defaultPrevented).toBe(false);
      expect(canvas.getObjects()).toHaveLength(objectsBefore + 1);

      touch('touchend', []);
      outside.remove();
      cleanup();
    });

    it('does not start text in the margin around the screenshot', async () => {
      const { container, canvas, cleanup } = await renderCanvas();
      const objectsBefore = canvas.getObjects().length;
      await selectTool(container, canvas, 'Text');

      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: -5, y: 10 } });
      expect(canvas.getObjects()).toHaveLength(objectsBefore);

      canvas.trigger('mouse:down', { e: {}, scenePoint: { x: 10, y: 10 } });
      expect(canvas.getObjects()).toHaveLength(objectsBefore + 1);
      cleanup();
    });

    it('does not start pan mode when Space is pressed on a focused Zoom in button', async () => {
      const { container, canvas, cleanup } = await renderCanvas();
      const zoomInButton = container.querySelector(
        'button[aria-label="Zoom in"]'
      ) as HTMLButtonElement;
      expect(zoomInButton.disabled).toBe(false);

      zoomInButton.focus();
      expect(document.activeElement).toBe(zoomInButton);

      const space = new window.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      zoomInButton.dispatchEvent(space);

      expect(space.defaultPrevented).toBe(false);
      expect(canvas.defaultCursor).toBe('default');
      cleanup();
    });

    it('redoes with Ctrl+Shift+Z, which reports an uppercase key', async () => {
      const { container, canvas, cleanup } = await renderCanvas();
      const button = (label: string) =>
        container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

      canvas.trigger('path:created');
      await waitFor(() => !button('Undo (Ctrl+Z)').disabled, 'Undo button not enabled');
      button('Undo (Ctrl+Z)').click();
      await waitFor(() => !button('Redo (Ctrl+Shift+Z)').disabled, 'Redo button not enabled');

      const redo = new window.KeyboardEvent('keydown', {
        key: 'Z',
        ctrlKey: true,
        shiftKey: true,
        cancelable: true,
      });
      window.dispatchEvent(redo);
      expect(redo.defaultPrevented).toBe(true);
      await waitFor(() => button('Redo (Ctrl+Shift+Z)').disabled, 'Ctrl+Shift+Z did not redo');
      expect(button('Undo (Ctrl+Z)').disabled).toBe(false);
      cleanup();
    });

    it('prevents mouse focus on tool buttons so Space starts pan mode', async () => {
      const { container, canvas, cleanup } = await renderCanvas();
      const rectangleButton = container.querySelector(
        'button[aria-label="Rectangle"]'
      ) as HTMLButtonElement;

      const mouseDown = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
      rectangleButton.dispatchEvent(mouseDown);
      expect(mouseDown.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(document.body);

      rectangleButton.click();
      await waitFor(() => canvas.defaultCursor === 'crosshair', 'Rectangle tool not active');

      const space = new window.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      document.body.dispatchEvent(space);

      expect(space.defaultPrevented).toBe(true);
      expect(canvas.defaultCursor).toBe('grab');
      cleanup();
    });
  });
});
