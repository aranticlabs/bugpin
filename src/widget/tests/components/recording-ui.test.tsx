import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ComponentChild, render } from 'preact';
import { useState } from 'preact/hooks';
import {
  formatDuration,
  RecordingBar,
  type RecordingBarPosition,
} from '../../components/RecordingBar';
import { ScreenCaptureConsentDialog } from '../../components/ScreenCaptureConsentDialog';
import { ScreenRecordingPanel } from '../../components/ScreenRecordingPanel';
import type { CapturedMedia } from '../../components/ScreenshotManager';
import { WidgetDialog } from '../../components/WidgetDialog';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { t } from '../../i18n/index';
import { Tooltip } from '../../components/ui/tooltip';
import { installDom } from '../helpers/dom';

const noop = () => undefined;

let restoreDom: (() => void) | null = null;
let container: HTMLElement;
const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
let objectUrlIndex = 0;

async function mount(node: ComponentChild): Promise<void> {
  render(node, container);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const button = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function clip(id: string, source?: 'recording'): CapturedMedia {
  return {
    id,
    blob: new Blob([new Uint8Array(1024 * 1024)], { type: 'video/webm' }),
    timestamp: new Date('2026-11-02T10:00:00Z'),
    annotated: false,
    mimeType: 'video/webm',
    durationMs: 65_000,
    source,
  };
}

function image(id: string): CapturedMedia {
  return {
    id,
    dataUrl: 'data:image/png;base64,media',
    timestamp: new Date('2026-11-02T10:00:00Z'),
    annotated: false,
    mimeType: 'image/png',
  };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: noop,
  };
}

function mockPenContext() {
  const calls = { translate: mock(noop), moveTo: mock(noop), clip: mock(noop) };
  const context = {
    setTransform: noop,
    clearRect: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    quadraticCurveTo: noop,
    lineTo: noop,
    stroke: noop,
    rect: noop,
    ...calls,
  };
  const getContext = spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  return { ...calls, restore: () => getContext.mockRestore() };
}

function sized(
  node: HTMLElement,
  size: Partial<Record<'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight', number>>
): HTMLElement {
  Object.entries(size).forEach(([key, value]) =>
    Object.defineProperty(node, key, { configurable: true, value })
  );
  return node;
}

function scrollMock(node: HTMLElement, max: { left?: number; top?: number } = {}) {
  const scrollBy = mock(({ left, top }: ScrollToOptions) => {
    node.scrollLeft = Math.min(max.left ?? Infinity, node.scrollLeft + (left ?? 0));
    node.scrollTop = Math.min(max.top ?? Infinity, node.scrollTop + (top ?? 0));
  });
  Object.defineProperty(node, 'scrollBy', { configurable: true, value: scrollBy });
  return scrollBy;
}

function pointAt(target: Element): void {
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
}

async function mountPen(): Promise<HTMLCanvasElement> {
  await mount(<RecordingBar {...barProps} />);
  button(t('recording.tool.pen'))?.click();
  await settle();
  return container.querySelector('[data-recording-pen]') as HTMLCanvasElement;
}

function pointer(type: string, clientX: number, clientY: number) {
  return new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
}

function wheel(deltaX: number, deltaY: number): WheelEvent {
  return new window.WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 50,
    clientY: 50,
    deltaX,
    deltaY,
  });
}

const barProps = {
  isReady: false,
  isCountingDown: false,
  countdown: 3,
  elapsedMs: 5000,
  maxDurationMs: 180_000,
  isPaused: false,
  hasMicrophone: false,
  isWholeScreen: false,
  position: null,
  onPositionChange: noop,
  onStart: noop,
  onPause: noop,
  onResume: noop,
  onStop: noop,
  onDiscard: noop,
};

const dialogProps = {
  onClose: noop,
  onSubmit: noop,
  onCaptureScreenshot: noop,
  onAnnotateMedia: noop,
  onAddMedia: noop,
  onRemoveMedia: noop,
  isSubmitting: false,
  uploadProgress: null,
  onCancelSubmit: noop,
  isCapturing: false,
  enableAnnotation: true,
  onActiveTabChange: noop,
  formData: {
    title: '',
    description: '',
    priority: 'medium' as const,
    reporterEmail: '',
    reporterName: '',
  },
  onFormDataChange: noop,
  showScreenCaptureConsent: false,
  onConsentConfirm: noop,
  onConsentCancel: noop,
  reduceScreenshotQuality: false,
  onReduceScreenshotQualityChange: noop,
  oversizedCapture: null,
  onDismissOversizedCapture: noop,
};

beforeEach(() => {
  restoreDom = installDom();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  objectUrlIndex = 0;
  globalThis.URL.createObjectURL = (() =>
    `blob:recording-${++objectUrlIndex}`) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  render(null, container);
  restoreDom?.();
  restoreDom = null;
  globalThis.URL.createObjectURL = originalCreateObjectURL;
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('RecordingBar', () => {
  it('formats durations as minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_900)).toBe('1:05');
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('keeps the tools available with a compact record action before recording', async () => {
    const onStart = mock(noop);
    await mount(<RecordingBar {...barProps} isReady onStart={onStart} />);
    expect(container.textContent).not.toContain('READY');
    expect(container.textContent).not.toContain('0:05');
    expect(button(t('recording.pause'))?.disabled).toBe(true);
    expect(button(t('recording.stop'))).toBeNull();
    button(t('recording.tool.pen'))?.click();
    await settle();
    expect(button(t('recording.tool.pen'))?.getAttribute('aria-pressed')).toBe('true');
    expect(button(t('recording.record'))?.textContent).toBe(t('recording.startShort'));
    expect(container.querySelector('[data-recording-indicator]')).toBeNull();
    button(t('recording.record'))?.click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows the countdown with discard as the only control', async () => {
    await mount(<RecordingBar {...barProps} isCountingDown countdown={2} />);

    expect(container.textContent).toContain(t('recording.countdown', { seconds: 2 }));
    expect(button(t('recording.discard'))).not.toBeNull();
    expect(button(t('recording.stop'))).toBeNull();
    expect(button(t('recording.pause'))).toBeNull();
  });

  it('starts at top center until it is dragged', async () => {
    await mount(<RecordingBar {...barProps} />);
    const bar = container.querySelector('[data-bugpin-exclude]') as HTMLElement;

    for (const name of ['left-1/2', 'top-5', '-translate-x-1/2']) {
      expect(bar.classList.contains(name)).toBe(true);
    }
    expect(bar.style.left).toBe('');
    expect(bar.style.top).toBe('');
    expect(bar.classList.contains('rounded-xl')).toBe(true);
    expect(container.querySelector('[data-recording-drag-handle]')).not.toBeNull();
  });

  it('opens tooltips below the bar at the top and above it once dragged lower', async () => {
    const tooltip = () =>
      button(t('recording.pause'))?.parentElement?.querySelector('[role="tooltip"]') as HTMLElement;
    await mount(<RecordingBar {...barProps} />);
    expect(tooltip().classList.contains('top-[calc(100%+6px)]')).toBe(true);
    expect(tooltip().classList.contains('bottom-[calc(100%+6px)]')).toBe(false);

    await mount(<RecordingBar {...barProps} position={{ x: 100, y: 500 }} />);
    expect(tooltip().classList.contains('bottom-[calc(100%+6px)]')).toBe(true);
    expect(tooltip().classList.contains('top-[calc(100%+6px)]')).toBe(false);
  });

  it('shows elapsed and maximum time outside any live region', async () => {
    await mount(<RecordingBar {...barProps} />);

    expect(container.textContent).toContain('0:05 / 3:00');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(button(t('recording.pause'))?.tagName).toBe('BUTTON');
    expect(button(t('recording.stop'))?.tagName).toBe('BUTTON');
    expect(button(t('recording.stop'))?.textContent).toBe(t('recording.stop'));
    expect(
      container.querySelector('[data-recording-indicator]')?.classList.contains('animate-pulse')
    ).toBe(true);
    expect(button(t('recording.discard'))?.tagName).toBe('BUTTON');
  });

  it('offers resume while paused', async () => {
    const onResume = mock(noop);
    await mount(<RecordingBar {...barProps} isPaused onResume={onResume} />);

    button(t('recording.resume'))?.click();

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(button(t('recording.pause'))).toBeNull();
    expect(container.textContent).not.toContain('PAUSED');
    expect(button(t('recording.resume'))?.classList.contains('bg-warning')).toBe(true);
    const indicator = container.querySelector('[data-recording-indicator]');
    expect(indicator?.classList.contains('animate-pulse')).toBe(false);
    expect(indicator?.classList.contains('text-muted-foreground')).toBe(true);
  });

  it('anchors pen strokes to the page when the window scrolls', async () => {
    const translate = mock(noop);
    const moveTo = mock(noop);
    const context = {
      setTransform: noop,
      clearRect: noop,
      save: noop,
      restore: noop,
      translate,
      beginPath: noop,
      moveTo,
      quadraticCurveTo: noop,
      lineTo: noop,
      stroke: noop,
    };
    const getContext = spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    await mount(<RecordingBar {...barProps} />);
    button(t('recording.tool.pen'))?.click();
    await settle();
    const pen = container.querySelector('[data-recording-pen]') as HTMLCanvasElement;
    pen.dispatchEvent(
      new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 20 })
    );
    pen.dispatchEvent(
      new window.MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 20 })
    );
    await settle();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 50 });
    window.dispatchEvent(new window.Event('scroll'));
    expect(translate).toHaveBeenLastCalledWith(-0, -50);
    expect(moveTo).toHaveBeenLastCalledWith(10, 20);
    getContext.mockRestore();
  });

  it('anchors strokes inside a scrolling panel and forwards wheel input through the pen', async () => {
    const translate = mock(noop);
    const moveTo = mock(noop);
    const clip = mock(noop);
    const context = {
      setTransform: noop,
      clearRect: noop,
      save: noop,
      restore: noop,
      translate,
      beginPath: noop,
      moveTo,
      quadraticCurveTo: noop,
      lineTo: noop,
      stroke: noop,
      rect: noop,
      clip,
    };
    const getContext = spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    const target = document.createElement('div');
    panel.append(target);
    document.body.append(panel);
    panel.getBoundingClientRect = () => rect(0, 0, 400, 200);
    Object.defineProperties(panel, {
      clientWidth: { value: 400 },
      clientHeight: { value: 200 },
      scrollHeight: { value: 800 },
      scrollBy: {
        value: mock(({ top }: ScrollToOptions) => {
          panel.scrollTop += top ?? 0;
        }),
      },
    });
    target.getBoundingClientRect = () => ({
      x: 100,
      y: 100 - panel.scrollTop,
      left: 100,
      top: 100 - panel.scrollTop,
      right: 200,
      bottom: 200 - panel.scrollTop,
      width: 100,
      height: 100,
      toJSON: noop,
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });
    await mount(<RecordingBar {...barProps} />);
    button(t('recording.tool.pen'))?.click();
    await settle();
    const pen = container.querySelector('[data-recording-pen]') as HTMLCanvasElement;
    pen.dispatchEvent(
      new window.MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 110,
        clientY: 120,
      })
    );
    pen.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
    await settle();

    const wheel = new window.WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 110,
      clientY: 120,
      deltaY: 60,
    });
    pen.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(panel.scrollTop).toBe(60);
    panel.dispatchEvent(new window.Event('scroll'));
    expect(translate).toHaveBeenLastCalledWith(100, 40);
    expect(moveTo).toHaveBeenLastCalledWith(10, 20);
    expect(clip).toHaveBeenCalled();

    panel.scrollTop = 0;
    panel.dispatchEvent(new window.Event('scroll'));
    expect(translate).toHaveBeenLastCalledWith(100, 100);
    expect(moveTo).toHaveBeenLastCalledWith(10, 20);
    getContext.mockRestore();
  });

  it('stops clipping a stroke to an element it was drawn outside of', async () => {
    const pen = mockPenContext();
    const label = document.createElement('span');
    label.setAttribute('style', 'overflow-x: hidden; overflow-y: hidden');
    label.getBoundingClientRect = () => rect(100, 100, 50, 20);
    sized(label, { clientWidth: 50, clientHeight: 20 });
    document.body.append(label);
    pointAt(label);
    const canvas = await mountPen();

    canvas.dispatchEvent(pointer('pointerdown', 110, 105));
    canvas.dispatchEvent(pointer('pointermove', 300, 300));
    canvas.dispatchEvent(pointer('pointerup', 300, 300));
    await settle();
    pen.clip.mockClear();
    window.dispatchEvent(new window.Event('resize'));

    expect(pen.clip).not.toHaveBeenCalled();
    expect(pen.translate).toHaveBeenLastCalledWith(100, 100);
    expect(pen.moveTo).toHaveBeenLastCalledWith(10, 5);
    pen.restore();
  });

  it('keeps a stroke that slightly overshoots its scroller moving with the content', async () => {
    const pen = mockPenContext();
    const panel = sized(document.createElement('div'), { clientWidth: 400, clientHeight: 200 });
    panel.style.overflowY = 'auto';
    panel.getBoundingClientRect = () => rect(0, 100, 400, 200);
    const item = document.createElement('div');
    item.getBoundingClientRect = () => rect(20, 110 - panel.scrollTop, 100, 30);
    panel.append(item);
    document.body.append(panel);
    pointAt(item);
    const canvas = await mountPen();

    canvas.dispatchEvent(pointer('pointerdown', 40, 115));
    canvas.dispatchEvent(pointer('pointermove', 60, 90));
    canvas.dispatchEvent(pointer('pointerup', 60, 90));
    await settle();
    panel.scrollTop = 50;
    window.dispatchEvent(new window.Event('resize'));

    expect(pen.translate).toHaveBeenLastCalledWith(20, 60);
    expect(pen.clip).toHaveBeenCalled();
    pen.restore();
  });

  it('keeps a stroke where it was last seen when its element leaves the page', async () => {
    const pen = mockPenContext();
    const target = document.createElement('div');
    target.getBoundingClientRect = () => rect(100, 100, 50, 50);
    document.body.append(target);
    pointAt(target);
    const canvas = await mountPen();

    canvas.dispatchEvent(pointer('pointerdown', 110, 120));
    canvas.dispatchEvent(pointer('pointerup', 110, 120));
    await settle();
    target.remove();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 30 });
    window.dispatchEvent(new window.Event('resize'));

    expect(pen.translate).toHaveBeenLastCalledWith(100, 70);
    expect(pen.moveTo).toHaveBeenLastCalledWith(10, 20);
    pen.restore();
  });

  it('routes each wheel axis to the container that can scroll on it', async () => {
    const page = sized(document.createElement('div'), { clientHeight: 400, scrollHeight: 900 });
    page.style.overflowY = 'auto';
    const table = sized(document.createElement('div'), { clientWidth: 300, scrollWidth: 900 });
    table.style.overflowX = 'auto';
    const cell = document.createElement('div');
    table.append(cell);
    page.append(table);
    document.body.append(page);
    const scrollPage = scrollMock(page);
    const scrollTable = scrollMock(table);
    pointAt(cell);
    const canvas = await mountPen();

    const event = wheel(2, 40);
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollTable).toHaveBeenCalledWith({ behavior: 'instant', left: 2 });
    expect(scrollPage).toHaveBeenCalledWith({ behavior: 'instant', top: 40 });
  });

  it('keeps a wheel gesture on its scroller until the gesture ends', async () => {
    const now = spyOn(performance, 'now').mockReturnValue(1000);
    const outer = sized(document.createElement('div'), { clientHeight: 400, scrollHeight: 900 });
    outer.style.overflowY = 'auto';
    const inner = sized(document.createElement('div'), { clientHeight: 100, scrollHeight: 300 });
    inner.style.overflowY = 'auto';
    inner.scrollTop = 190;
    outer.append(inner);
    document.body.append(outer);
    const scrollOuter = scrollMock(outer);
    const scrollInner = scrollMock(inner, { top: 200 });
    pointAt(inner);
    const canvas = await mountPen();

    canvas.dispatchEvent(wheel(0, 40));
    now.mockReturnValue(1050);
    const latched = wheel(0, 40);
    canvas.dispatchEvent(latched);

    expect(latched.defaultPrevented).toBe(true);
    expect(scrollInner).toHaveBeenCalledTimes(2);
    expect(scrollOuter).not.toHaveBeenCalled();

    now.mockReturnValue(2000);
    canvas.dispatchEvent(wheel(0, 40));
    expect(scrollOuter).toHaveBeenCalledWith({ behavior: 'instant', top: 40 });
    now.mockRestore();
  });

  it('leaves wheel input over plain page content to the browser', async () => {
    const block = document.createElement('div');
    document.body.append(block);
    pointAt(block);
    const canvas = await mountPen();

    const event = wheel(0, 40);
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('carries keyboard focus from record through the countdown to stop', async () => {
    const onStart = mock(noop);
    await mount(<RecordingBar {...barProps} isReady onStart={onStart} />);
    const record = button(t('recording.record'));
    record?.focus();
    record?.click();
    expect(onStart).toHaveBeenCalledTimes(1);

    await mount(<RecordingBar {...barProps} isCountingDown onStart={onStart} />);
    expect(document.activeElement?.getAttribute('role')).toBe('status');

    await mount(<RecordingBar {...barProps} onStart={onStart} />);
    expect(document.activeElement).toBe(button(t('recording.stop')));
  });

  it('leaves focus alone when record is clicked from outside the bar', async () => {
    await mount(<RecordingBar {...barProps} isReady />);
    button(t('recording.record'))?.click();
    await mount(<RecordingBar {...barProps} isCountingDown />);

    expect(document.activeElement).toBe(document.body);
  });

  it('shows the whole screen warning in a status region', async () => {
    await mount(<RecordingBar {...barProps} isWholeScreen />);

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      t('recording.warning.wholeScreen')
    );
  });

  it('is excluded from DOM capture and shows a microphone icon when active', async () => {
    await mount(<RecordingBar {...barProps} />);
    const svgCount = container.querySelectorAll('svg').length;
    await mount(<RecordingBar {...barProps} hasMicrophone />);

    expect(container.querySelector('[data-bugpin-exclude]')).not.toBeNull();
    expect(container.querySelectorAll('svg').length).toBe(svgCount + 1);
  });

  it('keeps the tools hidden during the countdown', async () => {
    await mount(<RecordingBar {...barProps} isCountingDown />);

    expect(button(t('recording.tool.pen'))).toBeNull();
    expect(button(t('recording.tool.laser'))).toBeNull();
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p' }));
    await settle();
    expect(container.querySelector('[data-recording-pen]')?.classList).toContain(
      'pointer-events-none'
    );
  });

  it('opens in the top layer so a restricted capture leaves it out', async () => {
    const showPopover = mock(noop);
    const original = window.HTMLElement.prototype.showPopover;
    window.HTMLElement.prototype.showPopover = showPopover;
    await mount(<RecordingBar {...barProps} />);
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.HTMLElement.prototype.showPopover = original;

    const bar = container.querySelector('[data-bugpin-exclude]') as HTMLElement;
    const frame = container.querySelector('[data-recording-frame]') as HTMLElement;
    expect(bar.getAttribute('popover')).toBe('manual');
    expect(frame.getAttribute('popover')).toBe('manual');
    expect(showPopover).toHaveBeenCalledTimes(2);
  });

  it('repeats the page background only when the capture can be restricted', async () => {
    const backdrop = () => container.querySelector('[data-recording-backdrop]') as HTMLElement;
    await mount(<RecordingBar {...barProps} />);
    expect(backdrop()).toBeNull();

    const scope = globalThis as unknown as { RestrictionTarget?: unknown };
    scope.RestrictionTarget = { fromElement: async () => ({}) };
    document.body.style.backgroundColor = 'rgb(12, 34, 56)';
    render(null, container);
    await mount(<RecordingBar {...barProps} />);
    delete scope.RestrictionTarget;

    expect(backdrop()?.style.backgroundColor).toBe('rgb(12, 34, 56)');
  });

  it('frames the page in red and turns the frame gray while paused', async () => {
    await mount(<RecordingBar {...barProps} />);
    const frame = () => container.querySelector('[data-recording-frame]') as HTMLElement;
    expect(frame().classList.contains('inset-ring-destructive')).toBe(true);

    await mount(<RecordingBar {...barProps} isPaused />);
    expect(frame().classList.contains('inset-ring-muted-foreground')).toBe(true);
    expect(frame().classList.contains('inset-ring-destructive')).toBe(false);
  });

  describe('tools', () => {
    const press = async (key: string, target: EventTarget = window) => {
      const init =
        key === 'Escape'
          ? { key, code: 'Escape' }
          : { key, code: `Key${key.toUpperCase()}`, altKey: true };
      target.dispatchEvent(new window.KeyboardEvent('keydown', { ...init, bubbles: true }));
      await settle();
    };
    const pressPlain = async (key: string, init: KeyboardEventInit = {}) => {
      const event = new window.KeyboardEvent('keydown', {
        key,
        code: `Key${key.toUpperCase()}`,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      window.dispatchEvent(event);
      await settle();
      return event;
    };
    const pressed = (label: string) => button(label)?.getAttribute('aria-pressed');
    const afterPaint = () => new Promise((resolve) => setTimeout(resolve, 150));
    const pen = () => container.querySelector('[data-recording-pen]') as HTMLCanvasElement;
    const draw = async () => {
      const event = (type: string, clientX: number) =>
        new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 10 });
      pen().dispatchEvent(event('pointerdown', 10));
      pen().dispatchEvent(event('pointermove', 40));
      pen().dispatchEvent(event('pointerup', 40));
      await settle();
    };

    it('starts on the cursor with click effects on', async () => {
      await mount(<RecordingBar {...barProps} />);

      expect(pressed(t('recording.tool.cursor'))).toBe('true');
      expect(pressed(t('recording.tool.pen'))).toBe('false');
      expect(pressed(t('recording.tool.clickEffects'))).toBe('true');
      expect(pen().classList.contains('pointer-events-none')).toBe(true);
    });

    it('lets the pen capture the page and shows its options only while active', async () => {
      await mount(<RecordingBar {...barProps} />);
      expect(button(t('recording.color.red'))).toBeNull();

      button(t('recording.tool.pen'))?.click();
      await settle();

      expect(pen().classList.contains('pointer-events-none')).toBe(false);
      expect(pressed(t('recording.color.red'))).toBe('true');

      button(t('recording.color.green'))?.click();
      await settle();
      expect(pressed(t('recording.color.green'))).toBe('true');
      expect(pressed(t('recording.color.red'))).toBe('false');
    });

    it('enables undo and clear once a stroke exists', async () => {
      await mount(<RecordingBar {...barProps} />);
      await press('p');
      expect(button(t('recording.tool.undo'))?.disabled).toBe(true);
      expect(button(t('recording.tool.clear'))?.disabled).toBe(true);

      await draw();
      expect(button(t('recording.tool.undo'))?.disabled).toBe(false);

      button(t('recording.tool.undo'))?.click();
      await settle();
      expect(button(t('recording.tool.undo'))?.disabled).toBe(true);

      await draw();
      await draw();
      button(t('recording.tool.clear'))?.click();
      await settle();
      expect(button(t('recording.tool.clear'))?.disabled).toBe(true);
    });

    it('undoes a stroke with the keyboard', async () => {
      await mount(<RecordingBar {...barProps} />);
      await press('p');
      await draw();

      await press('z');

      expect(button(t('recording.tool.undo'))?.disabled).toBe(true);
    });

    it('leaves plain keys and the page undo shortcut to the host page', async () => {
      await mount(<RecordingBar {...barProps} />);
      await press('p');
      await draw();

      const undoEvent = await pressPlain('z', { metaKey: true });
      expect(undoEvent.defaultPrevented).toBe(false);
      expect(button(t('recording.tool.undo'))?.disabled).toBe(false);

      await pressPlain('l');
      await pressPlain('c');
      expect(pressed(t('recording.tool.pen'))).toBe('true');
      expect(pressed(t('recording.tool.clickEffects'))).toBe('true');
    });

    it('switches tools with the keyboard', async () => {
      await mount(<RecordingBar {...barProps} />);

      await press('l');
      expect(pressed(t('recording.tool.laser'))).toBe('true');
      await press('Escape');
      expect(pressed(t('recording.tool.cursor'))).toBe('true');
      await press('p');
      expect(pressed(t('recording.tool.pen'))).toBe('true');
      await press('v');
      expect(pressed(t('recording.tool.cursor'))).toBe('true');
      await press('c');
      expect(pressed(t('recording.tool.clickEffects'))).toBe('false');
    });

    it('ignores shortcuts while typing in a field', async () => {
      await mount(<RecordingBar {...barProps} />);
      const input = document.createElement('input');
      document.body.appendChild(input);

      await press('p', input);

      expect(pressed(t('recording.tool.cursor'))).toBe('true');
    });

    it('draws click ripples in the configured primary color, also before recording starts', async () => {
      const originalStyle = globalThis.getComputedStyle;
      let primary = '#ff00aa';
      globalThis.getComputedStyle = ((element: Element) => {
        const style = originalStyle(element);
        return new Proxy(style, {
          get: (target, key) =>
            key === 'getPropertyValue'
              ? (name: string) => (name === '--primary' ? primary : target.getPropertyValue(name))
              : Reflect.get(target, key),
        });
      }) as typeof getComputedStyle;
      const colors: string[] = [];
      const context = {
        setTransform: noop,
        clearRect: noop,
        save: noop,
        restore: noop,
        beginPath: noop,
        arc: noop,
        stroke: () => colors.push(String(context.strokeStyle)),
        lineWidth: 1,
        globalAlpha: 1,
        strokeStyle: '',
      };
      const getContext = spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );
      let frame: FrameRequestCallback = noop;
      const requestFrame = spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
        (callback) => {
          frame = callback;
          return 1;
        }
      );
      const cancelFrame = spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(noop);
      try {
        await mount(<RecordingBar {...barProps} />);
        document.body.dispatchEvent(
          new window.MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 60 })
        );
        frame(performance.now());
        expect(colors).toContain('#ff00aa');
        expect(colors).not.toContain('rgb(46 155 198 / 1)');

        primary = '';
        colors.length = 0;
        document.body.dispatchEvent(
          new window.MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 90 })
        );
        frame(performance.now());
        expect(colors).toContain('#02658D');

        await mount(<RecordingBar {...barProps} isReady />);
        colors.length = 0;
        primary = '#ff00aa';
        document.body.dispatchEvent(
          new window.MouseEvent('pointerdown', { bubbles: true, clientX: 30, clientY: 40 })
        );
        frame(performance.now());
        expect(colors).toContain('#ff00aa');
      } finally {
        render(null, container);
        globalThis.getComputedStyle = originalStyle;
        getContext.mockRestore();
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
      }
    });

    it('smooths coalesced laser samples into abutting curves with one glow and expires the trail', async () => {
      await mount(<RecordingBar {...barProps} />);
      await press('l');
      await afterPaint();
      const quadraticCurveTo = mock<CanvasRenderingContext2D['quadraticCurveTo']>(noop);
      const lineTo = mock<CanvasRenderingContext2D['lineTo']>(noop);
      const drawImage = mock<CanvasRenderingContext2D['drawImage']>(noop);
      const context = {
        canvas: { width: 200, height: 100 },
        setTransform: noop,
        drawImage,
        clearRect: noop,
        save: noop,
        restore: noop,
        beginPath: noop,
        moveTo: noop,
        quadraticCurveTo,
        lineTo,
        stroke: noop,
        arc: noop,
        fill: noop,
        lineCap: 'butt',
        lineJoin: 'miter',
        createRadialGradient: () => ({ addColorStop: noop }),
      };
      const getContext = spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context as unknown as CanvasRenderingContext2D
      );
      let frame: FrameRequestCallback = noop;
      const requestFrame = spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
        (callback) => {
          frame = callback;
          return 1;
        }
      );
      const cancelFrame = spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(noop);
      try {
        const event = new window.MouseEvent('pointermove', { clientX: 70, clientY: 40 });
        Object.defineProperty(event, 'getCoalescedEvents', {
          value: () => [
            { clientX: 10, clientY: 10 },
            { clientX: 40, clientY: 10 },
            { clientX: 40, clientY: 40 },
            { clientX: 70, clientY: 40 },
          ],
        });
        window.dispatchEvent(event);
        const now = performance.now();
        frame(now);
        expect(quadraticCurveTo.mock.calls).toEqual([
          [10, 10, 25, 10],
          [40, 10, 40, 25],
          [40, 40, 55, 40],
        ]);
        expect(lineTo).toHaveBeenCalledTimes(1);
        expect(lineTo).toHaveBeenCalledWith(70, 40);
        expect(context.lineCap).toBe('butt');
        expect(context.lineJoin).toBe('round');
        expect(drawImage).toHaveBeenCalledTimes(1);

        quadraticCurveTo.mockClear();
        frame(now + 1000);
        expect(quadraticCurveTo).not.toHaveBeenCalled();
      } finally {
        render(null, container);
        getContext.mockRestore();
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
      }
    });

    it('hides the page cursor only while the laser is active', async () => {
      const cursorStyles = () =>
        [...document.head.querySelectorAll('style')].filter((style) =>
          style.textContent?.includes('cursor: none')
        );
      await mount(<RecordingBar {...barProps} />);
      expect(cursorStyles()).toHaveLength(0);

      await press('l');
      await afterPaint();
      expect(cursorStyles()).toHaveLength(1);

      await press('v');
      await afterPaint();
      expect(cursorStyles()).toHaveLength(0);
    });
  });

  describe('dragging', () => {
    let latest: RecordingBarPosition | null;

    const Harness = ({ initial }: { initial: RecordingBarPosition | null }) => {
      const [position, setPosition] = useState(initial);
      latest = position;
      return <RecordingBar {...barProps} position={position} onPositionChange={setPosition} />;
    };

    const bar = () => container.querySelector('[data-bugpin-exclude]') as HTMLElement;
    const handle = () => container.querySelector('[data-recording-drag-handle]') as HTMLElement;
    const pointer = (target: Element, type: string, clientX: number, clientY: number) => {
      target.dispatchEvent(
        new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
      );
    };

    beforeEach(() => {
      latest = null;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    });

    it('follows the pointer and stays inside the viewport', async () => {
      await mount(<Harness initial={null} />);
      bar().getBoundingClientRect = () =>
        ({ left: 100, top: 100, width: 300, height: 50 }) as DOMRect;

      pointer(handle(), 'pointerdown', 110, 110);
      pointer(bar(), 'pointermove', 210, 310);
      await settle();
      expect(latest).toEqual({ x: 200, y: 300 });
      expect(bar().style.left).toBe('200px');

      pointer(bar(), 'pointermove', 5000, 5000);
      await settle();
      expect(latest).toEqual({ x: 692, y: 742 });

      pointer(bar(), 'pointermove', -500, -500);
      await settle();
      expect(latest).toEqual({ x: 8, y: 8 });
    });

    it('stops following after the pointer is released', async () => {
      await mount(<Harness initial={null} />);
      bar().getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 }) as DOMRect;

      pointer(handle(), 'pointerdown', 10, 10);
      pointer(bar(), 'pointerup', 10, 10);
      pointer(bar(), 'pointermove', 300, 300);
      await settle();

      expect(latest).toBeNull();
    });

    it('does not start a drag from a control', async () => {
      await mount(<Harness initial={null} />);
      const control = button(t('recording.stop'));
      if (!control) throw new Error('Stop button missing');

      pointer(control, 'pointerdown', 10, 10);
      pointer(bar(), 'pointermove', 300, 300);
      await settle();

      expect(latest).toBeNull();
    });

    it('moves back inside the viewport on resize', async () => {
      await mount(<Harness initial={{ x: 650, y: 700 }} />);
      bar().getBoundingClientRect = () =>
        ({ left: 650, top: 700, width: 300, height: 50 }) as DOMRect;

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
      window.dispatchEvent(new window.Event('resize'));
      await settle();

      expect(latest).toEqual({ x: 192, y: 342 });
    });
  });
});

describe('ScreenRecordingPanel', () => {
  const panelProps = {
    clips: [],
    recordingEnabled: true,
    onRecord: noop,
    onUpload: noop,
    onRemove: noop,
    isStarting: false,
    allowMicrophone: false,
    includeMicrophone: false,
    onIncludeMicrophoneChange: noop,
    oversizedRecording: null,
    onDismissOversizedRecording: noop,
  };

  it('hides the microphone option unless an admin allows it', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();

    await mount(<ScreenRecordingPanel {...panelProps} allowMicrophone />);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.classList.contains('sr-only')).toBe(true);
    expect(checkbox.nextElementSibling?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain(t('recording.microphone'));
  });

  it('matches the screenshot panel control layout', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} allowMicrophone />);

    const recordButton = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === t('recording.start')
    );
    const microphone = container.querySelector('input[type="checkbox"]');
    const privacyTip = [...container.querySelectorAll('p')].find(
      (item) => item.textContent === t('recording.privacyTip')
    );

    expect(recordButton?.classList.contains('flex-1')).toBe(true);
    expect(microphone?.closest('div')?.classList.contains('justify-end')).toBe(true);
    expect(privacyTip?.classList.contains('text-center')).toBe(false);
  });

  it('disables the record button while starting', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} isStarting />);

    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('lists clips with duration and size, and removes them', async () => {
    const onRemove = mock(noop);
    await mount(
      <ScreenRecordingPanel
        {...panelProps}
        clips={[clip('a', 'recording'), clip('b', 'recording')]}
        onRemove={onRemove}
      />
    );

    expect(container.textContent).toContain('1:05 · 1.0 MB');
    expect(container.querySelector('ul')?.classList.contains('grid-cols-2')).toBe(true);
    expect(container.querySelector('ul')?.parentElement?.classList.contains('border-2')).toBe(
      false
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video?.controls).toBe(true);
    expect(video?.muted).toBe(false);
    expect(video?.getAttribute('src')).toBe('blob:recording-1');

    let paused = true;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    video.play = mock(async () => {
      paused = false;
      video.dispatchEvent(new window.Event('play'));
    });
    video.pause = mock(() => {
      paused = true;
      video.dispatchEvent(new window.Event('pause'));
    });

    button(t('recording.play'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(video.play).toHaveBeenCalledTimes(1);
    button(t('recording.pause'))?.click();
    expect(video.pause).toHaveBeenCalledTimes(1);

    button(t('screenshot.action.remove'))?.click();
    expect(onRemove.mock.calls[0]).toEqual(['a'] as never);
    expect(button(t('screenshot.action.download'))).not.toBeNull();
  });

  it('keeps clip details and actions when playback fails', async () => {
    const onRemove = mock(noop);
    await mount(
      <ScreenRecordingPanel {...panelProps} clips={[clip('a', 'recording')]} onRemove={onRemove} />
    );

    container.querySelector('video')?.dispatchEvent(new window.Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fallback = container.querySelector('[data-testid="video-preview-fallback"]');
    expect(fallback?.textContent).toContain(t('recording.previewUnavailable'));
    expect(container.textContent).toContain('1:05 · 1.0 MB');
    expect(button(t('screenshot.action.download'))).not.toBeNull();
    button(t('screenshot.action.remove'))?.click();
    expect(onRemove.mock.calls[0]).toEqual(['a'] as never);
  });

  it('opens and closes a larger recording preview', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} clips={[clip('a', 'recording')]} />);

    button(t('recording.expand'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const preview = container.querySelector('[data-testid="recording-preview-dialog"]');
    expect(preview?.getAttribute('role')).toBe('dialog');
    expect(preview?.getAttribute('aria-modal')).toBe('true');
    expect(preview?.querySelector('video')).not.toBeNull();

    button(t('aria.close'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[data-testid="recording-preview-dialog"]')).toBeNull();
  });

  it('shows and dismisses the oversized banner', async () => {
    const onDismiss = mock(noop);
    await mount(
      <ScreenRecordingPanel
        {...panelProps}
        oversizedRecording={{ sizeMb: 60, limitMb: 50 }}
        onDismissOversizedRecording={onDismiss}
      />
    );

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      t('recording.oversized', { size: 60, limit: 50 })
    );
    button(t('aria.close'))?.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps video uploads available when screen recording is disabled', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} recordingEnabled={false} />);

    expect(container.textContent).not.toContain(t('recording.start'));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
      'video/mp4,video/webm,video/quicktime'
    );
    expect(container.textContent).toContain(t('screenshot.dropzone.title'));
  });
});

describe('ScreenCaptureConsentDialog recording mode', () => {
  const setUserAgent = (userAgent: string) => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
  };

  it('is text-only and stores its own key', async () => {
    setUserAgent('Chrome/150.0.0.0');
    const onConfirm = mock(noop);
    await mount(
      <ScreenCaptureConsentDialog mode="recording" onConfirm={onConfirm} onCancel={noop} />
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toContain(t('screenCapture.recording.body'));
    expect(container.textContent).not.toContain(t('screenCapture.recording.windowHint'));

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const buttons = [...container.querySelectorAll('button')];
    buttons.find((item) => item.textContent === t('screenCapture.confirmRecording'))?.click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('bugpin-skip-recording-consent')).toBe('true');
    expect(localStorage.getItem('bugpin-skip-screen-capture-consent')).toBeNull();
  });

  it('adds the window hint outside Chromium browsers', async () => {
    setUserAgent('Mozilla/5.0 Gecko/20100101 Firefox/150.0');
    await mount(<ScreenCaptureConsentDialog mode="recording" onConfirm={noop} onCancel={noop} />);

    expect(container.textContent).toContain(t('screenCapture.recording.windowHint'));
  });

  it('keeps the screenshot mode illustrated with its own key', async () => {
    await mount(<ScreenCaptureConsentDialog onConfirm={noop} onCancel={noop} />);

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain(t('screenCapture.confirm'));
  });
});

describe('WidgetDialog recording tab', () => {
  const tabLabels = () =>
    [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);

  it('keeps the videos tab available when recording is not available', async () => {
    await mount(<WidgetDialog {...dialogProps} media={[]} activeTab="details" />);

    expect(tabLabels()).toEqual([
      t('dialog.tabs.details'),
      t('dialog.tabs.media'),
      t('dialog.tabs.recording'),
    ]);
  });

  it('counts images and videos separately', async () => {
    await mount(
      <WidgetDialog
        {...dialogProps}
        media={[image('shot'), clip('upload'), clip('recording', 'recording')]}
        activeTab="details"
        recordingEnabled
      />
    );

    expect(tabLabels()).toEqual([
      t('dialog.tabs.details'),
      t('dialog.tabs.mediaWithCount', { count: 1 }),
      t('dialog.tabs.recordingWithCount', { count: 2 }),
    ]);
  });

  it('shows videos only in the videos tab and images only in screenshots', async () => {
    const media = [image('shot'), clip('upload'), clip('recording', 'recording')];
    await mount(
      <WidgetDialog {...dialogProps} media={media} activeTab="recording" recordingEnabled />
    );
    expect(container.textContent).toContain(t('recording.start'));
    expect(container.querySelectorAll('video')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('ul')?.parentElement?.classList.contains('border-2')).toBe(
      false
    );

    await mount(<WidgetDialog {...dialogProps} media={media} activeTab="media" recordingEnabled />);
    expect(container.textContent).not.toContain(t('recording.start'));
    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(
      container
        .querySelector('img')
        ?.closest('.grid')
        ?.parentElement?.classList.contains('border-2')
    ).toBe(false);
  });

  it('hides recorded clips that will not be sent while recording is disabled', async () => {
    await mount(
      <WidgetDialog
        {...dialogProps}
        media={[clip('upload'), clip('recording', 'recording')]}
        activeTab="recording"
      />
    );

    expect(tabLabels()[2]).toBe(t('dialog.tabs.recordingWithCount', { count: 1 }));
    expect(container.querySelectorAll('video')).toHaveLength(1);
  });

  it('blocks submitting while a clip is over the upload limit', async () => {
    const onSubmit = mock(noop);
    const onActiveTabChange = mock(noop);
    const submitButton = () =>
      [...container.querySelectorAll('button')].find(
        (element) => element.textContent === t('dialog.buttons.submit')
      ) as HTMLButtonElement;
    await mount(
      <WidgetDialog
        {...dialogProps}
        formData={{ ...dialogProps.formData, title: 'Broken checkout' }}
        onSubmit={onSubmit}
        onActiveTabChange={onActiveTabChange}
        media={[clip('recording', 'recording')]}
        activeTab="recording"
        recordingEnabled
        maxVideoSize={512 * 1024}
      />
    );

    expect(submitButton().disabled).toBe(true);
    expect(container.textContent).toContain(t('recording.oversized', { size: 1, limit: 1 }));
    expect(container.querySelector('[role="alert"] button')).toBeNull();

    await mount(
      <WidgetDialog
        {...dialogProps}
        formData={{ ...dialogProps.formData, title: 'Broken checkout' }}
        onSubmit={onSubmit}
        media={[clip('recording', 'recording')]}
        activeTab="recording"
        recordingEnabled
        maxVideoSize={2 * 1024 * 1024}
      />
    );
    expect(submitButton().disabled).toBe(false);
  });

  it('opens the videos upload area when recording is unavailable', async () => {
    await mount(<WidgetDialog {...dialogProps} media={[]} activeTab="recording" />);

    expect(container.querySelector('#bugpin-title-input')).toBeNull();
    expect(container.textContent).not.toContain(t('recording.start'));
    expect(container.textContent).toContain(t('screenshot.dropzone.title'));
  });
});

describe('WidgetLauncherButton badge', () => {
  const launcherProps = {
    position: 'bottom-right' as const,
    buttonText: { project: { en: 'Report' }, global: null, builtin: null },
    buttonShape: 'round' as const,
    buttonIcon: null,
    buttonIconSize: 18,
    buttonIconStroke: 2,
    buttonOffsetX: 20,
    buttonOffsetY: 20,
    buttonSizeUnit: 'px' as const,
    theme: 'light' as const,
    lightButtonColor: '#000',
    lightTextColor: '#fff',
    lightButtonHoverColor: '#111',
    lightTextHoverColor: '#fff',
    darkButtonColor: '#000',
    darkTextColor: '#fff',
    darkButtonHoverColor: '#111',
    darkTextHoverColor: '#fff',
    enableHoverScaleEffect: false,
    tooltipEnabled: false,
    tooltipText: { project: null, global: null, builtin: null },
    onClick: noop,
  };
  const badge = () => container.querySelector('[data-testid="bugpin-pending-recording"]');

  it('shows a dot only when a recording is pending', async () => {
    await mount(<WidgetLauncherButton {...launcherProps} />);
    expect(badge()).toBeNull();

    await mount(<WidgetLauncherButton {...launcherProps} hasPendingRecording />);
    expect(badge()).not.toBeNull();
  });
});

describe('Tooltip', () => {
  it('shows on keyboard focus but not after a pointer press', async () => {
    await mount(
      <Tooltip content="Pen">
        <button type="button">P</button>
      </Tooltip>
    );
    const tip = container.querySelector('[role="tooltip"]') as HTMLElement;
    const trigger = container.querySelector('button') as HTMLButtonElement;
    const focusClass = 'group-has-[:focus-visible]/tooltip:visible';
    expect(tip.classList.contains(focusClass)).toBe(true);

    trigger.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    await settle();
    expect(tip.classList.contains(focusClass)).toBe(false);

    trigger.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
    await settle();
    expect(tip.classList.contains(focusClass)).toBe(true);
  });
});
