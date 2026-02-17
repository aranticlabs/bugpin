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
        onSave={onSave}
        onCancel={onCancel}
      />,
      container,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

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
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
      container,
    );

    await waitFor(
      () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
      'Fabric canvas not ready',
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
          freeDrawingBrush?: { color?: string; width?: number };
          events?: Map<string, unknown>;
        }
      | undefined;
    if (!canvas) {
      throw new Error('Fabric canvas missing');
    }
    await waitFor(() => Boolean(canvas.events?.has('mouse:down')), 'Canvas handlers not ready');

    const selectButton = container.querySelector('button[title="Select"]') as HTMLButtonElement;
    expect(selectButton.className).toContain('text-primary');

    const penButton = container.querySelector('button[title="Pen"]') as HTMLButtonElement;
    penButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[title="Pen"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Pen tool not active',
    );

    const blueButton = container.querySelector('button[title="#3b82f6"]') as HTMLButtonElement;
    blueButton.click();
    await waitFor(() => canvas.freeDrawingBrush?.color === '#3b82f6', 'Brush color not updated');

    const widthButton = container.querySelector('button[title="8px"]') as HTMLButtonElement;
    widthButton.click();
    await waitFor(() => canvas.freeDrawingBrush?.width === 8, 'Brush width not updated');

    const zoomInButton = container.querySelector(
      'button[title="Zoom In - Hold Space to pan when zoomed"]',
    ) as HTMLButtonElement;
    zoomInButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(canvas.getZoom()).toBeGreaterThan(1);

    const zoomResetButton = container.querySelector(
      'button[title^="Reset Zoom"]',
    ) as HTMLButtonElement;
    zoomResetButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(canvas.getZoom()).toBe(1);

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
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
      container,
    );

    await waitFor(
      () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
      'Fabric canvas not ready',
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
      'button[title="Undo (Ctrl+Z)"]',
    ) as HTMLButtonElement;
    const redoButton = container.querySelector(
      'button[title="Redo (Ctrl+Shift+Z)"]',
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
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
      container,
    );

    await waitFor(
      () => Boolean((globalThis as Record<string, unknown>).__fabricCanvasReady),
      'Fabric canvas not ready',
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

    const penButton = container.querySelector('button[title="Pen"]') as HTMLButtonElement;
    penButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[title="Pen"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Pen tool not active',
    );
    await waitFor(() => canvas.isDrawingMode === true, 'Pen drawing mode not enabled');
    expect(canvas.selection).toBe(false);
    expect(canvas.defaultCursor).toBe('crosshair');

    const panButton = container.querySelector(
      'button[title="Pan (or hold Space)"]',
    ) as HTMLButtonElement;
    panButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[title="Pan (or hold Space)"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Pan tool not active',
    );
    await waitFor(() => canvas.isDrawingMode === false, 'Pan should disable drawing');
    expect(canvas.selection).toBe(false);
    expect(canvas.defaultCursor).toBe('grab');

    const selectButton = container.querySelector('button[title="Select"]') as HTMLButtonElement;
    selectButton.click();

    await waitFor(
      () =>
        (
          container.querySelector('button[title="Select"]') as HTMLButtonElement | null
        )?.className.includes('text-primary') ?? false,
      'Select tool not active',
    );
    await waitFor(() => canvas.selection === true, 'Select should enable selection');
    expect(canvas.defaultCursor).toBe('default');

    render(null, container);
    container.remove();
  });
});
