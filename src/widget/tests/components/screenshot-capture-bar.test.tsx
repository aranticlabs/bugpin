import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { render } from 'preact';
import { ScreenshotCaptureBar } from '../../components/ScreenshotCaptureBar';
import { installDom } from '../helpers/dom';
import { t } from '../../i18n/index';

let restoreDom: (() => void) | null = null;
let container: HTMLElement;

beforeEach(() => {
  restoreDom = installDom();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  restoreDom?.();
  restoreDom = null;
});

function renderBar(overrides: Partial<Parameters<typeof ScreenshotCaptureBar>[0]> = {}) {
  const props = {
    isReady: true,
    isCountingDown: false,
    countdown: 3,
    delaySeconds: 0,
    delayOptions: [0, 3, 5, 10],
    reduceImageSize: false,
    position: null,
    onPositionChange: () => undefined,
    onDelayChange: mock(),
    onReduceImageSizeChange: mock(),
    onCapture: mock(),
    onCancel: mock(),
    ...overrides,
  };
  render(<ScreenshotCaptureBar {...props} />, container);
  return props;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function captureButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === t('screenshot.bar.capture')
  );
}

function menuTrigger(label: string): HTMLButtonElement {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
  ).find((button) => button.textContent?.includes(label)) as HTMLButtonElement;
}

function timerTrigger(): HTMLButtonElement {
  return menuTrigger(t('screenshot.bar.timerLabel'));
}

function sizeTrigger(): HTMLButtonElement {
  return menuTrigger(t('screenshot.bar.sizeLabel'));
}

function cancelButton(): HTMLButtonElement {
  return container.querySelector(
    `button[aria-label="${t('screenshot.bar.cancel')}"]`
  ) as HTMLButtonElement;
}

function menuItems(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('[role="menuitemradio"]'));
}

describe('ScreenshotCaptureBar', () => {
  it('is excluded from captures and offers capture, timer and cancel', () => {
    const props = renderBar();

    expect(container.querySelector('[data-bugpin-exclude]')).not.toBeNull();
    expect(timerTrigger().textContent).toContain(t('screenshot.bar.timerOff'));
    captureButton()?.click();
    cancelButton().click();

    expect(props.onCapture).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('lists every delay in the timer menu and reports the chosen one', async () => {
    const props = renderBar({ delaySeconds: 3 });

    expect(timerTrigger().textContent).toContain(t('screenshot.bar.timerShort', { seconds: 3 }));
    timerTrigger().click();
    await settle();

    expect(timerTrigger().getAttribute('aria-expanded')).toBe('true');
    expect(menuItems().map((item) => item.textContent)).toEqual([
      t('screenshot.bar.timerOff'),
      t('screenshot.bar.timerOption', { seconds: 3 }),
      t('screenshot.bar.timerOption', { seconds: 5 }),
      t('screenshot.bar.timerOption', { seconds: 10 }),
    ]);
    expect(menuItems()[1]?.getAttribute('aria-checked')).toBe('true');

    menuItems()[3]?.click();
    await settle();

    expect(props.onDelayChange).toHaveBeenCalledWith(10);
    expect(menuItems()).toHaveLength(0);
  });

  it('closes the timer menu on Escape and on a click outside the bar', async () => {
    renderBar();

    timerTrigger().click();
    await settle();
    menuItems()[0]?.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await settle();
    expect(menuItems()).toHaveLength(0);

    timerTrigger().click();
    await settle();
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    await settle();
    expect(menuItems()).toHaveLength(0);
  });

  it('returns focus to the timer button when the menu closes', async () => {
    renderBar();
    const trigger = timerTrigger();

    trigger.click();
    await settle();
    menuItems()[0]?.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await settle();
    expect(timerTrigger()).toBe(trigger);
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    await settle();
    menuItems()[1]?.click();
    await settle();
    expect(timerTrigger()).toBe(trigger);
    expect(document.activeElement).toBe(trigger);
  });

  it('disables capture, timer and size while the tab share is pending', () => {
    renderBar({ isReady: false });

    expect(captureButton()?.disabled).toBe(true);
    expect(timerTrigger().disabled).toBe(true);
    expect(sizeTrigger().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(false);
  });

  it('lists full and reduced image size options and reports selection', async () => {
    const props = renderBar({ reduceImageSize: false });

    expect(sizeTrigger().textContent).toContain(t('screenshot.bar.sizeFullShort'));
    sizeTrigger().click();
    await settle();

    expect(sizeTrigger().getAttribute('aria-expanded')).toBe('true');
    expect(menuItems()).toHaveLength(2);
    expect(menuItems()[0]?.getAttribute('aria-checked')).toBe('true');
    expect(menuItems()[1]?.textContent).toContain(t('screenshot.bar.sizeReduced'));

    menuItems()[1]?.click();
    await settle();

    expect(props.onReduceImageSizeChange).toHaveBeenCalledWith(true);
    expect(menuItems()).toHaveLength(0);
    expect(document.activeElement).toBe(sizeTrigger());
  });

  it('shows the reduced label when reduceImageSize is active', () => {
    renderBar({ reduceImageSize: true });
    expect(sizeTrigger().textContent).toContain(t('screenshot.bar.sizeReducedShort'));
  });

  it('shows and dismisses the oversized capture warning on the bar', () => {
    const onDismissOversizedCapture = mock();
    renderBar({
      oversizedCapture: { sizeMb: 11.1, limitMb: 10 },
      onDismissOversizedCapture,
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      t('screenshot.error.captureTooLarge', { size: 11.1, limit: 10 })
    );
    expect(alert?.textContent).toContain(t('screenshot.error.captureTooLargeHint'));

    const dismiss = alert?.querySelector(`button[aria-label="${t('aria.close')}"]`) as
      | HTMLButtonElement
      | undefined;
    dismiss?.click();
    expect(onDismissOversizedCapture).toHaveBeenCalledTimes(1);
  });

  it('shows the countdown in the capture button and keeps cancel', () => {
    const props = renderBar({ isCountingDown: true, countdown: 2, delaySeconds: 3 });
    const countdown = t('screenshot.bar.countdown', { seconds: 2 });

    expect(container.querySelector('[role="status"]')?.textContent).toBe(countdown);
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === countdown
    );
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    button?.click();
    expect(props.onCapture).not.toHaveBeenCalled();
    expect(timerTrigger().disabled).toBe(true);
    expect(sizeTrigger().disabled).toBe(true);
    expect(cancelButton()).not.toBeNull();
  });
});

describe('ScreenshotCaptureBar contrast with the page', () => {
  function stubCanvas() {
    const prototype = window.HTMLCanvasElement.prototype;
    const original = prototype.getContext;
    let painted = 'rgba(0, 0, 0, 0)';
    const context = {
      set fillStyle(color: string) {
        painted = color;
      },
      fillRect: () => undefined,
      getImageData: () => {
        const parts = painted.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
        const alpha = parts.length > 3 ? parts[3] : 1;
        return { data: [parts[0], parts[1], parts[2], Math.round(alpha * 255)] };
      },
    };
    prototype.getContext = (() => context) as unknown as typeof prototype.getContext;
    return () => {
      prototype.getContext = original;
    };
  }

  function stubPageAt(element: Element) {
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [element],
    });
  }

  function barElement(): HTMLElement {
    return container.querySelector('[popover]') as HTMLElement;
  }

  it('shows a light bar over a dark page background', () => {
    const restoreCanvas = stubCanvas();
    const page = document.createElement('main');
    page.style.backgroundColor = 'rgb(10, 10, 10)';
    document.body.appendChild(page);
    stubPageAt(page);

    renderBar();

    expect(barElement().className).toContain('bugpin-capture-bar-light');
    expect(barElement().className).not.toContain('bugpin-theme-dark');
    restoreCanvas();
  });

  it('keeps the dark bar over a light page background', () => {
    const restoreCanvas = stubCanvas();
    const page = document.createElement('main');
    page.style.backgroundColor = 'rgb(255, 255, 255)';
    document.body.appendChild(page);
    stubPageAt(page);

    renderBar();

    expect(barElement().className).toContain('bugpin-theme-dark');
    restoreCanvas();
  });

  it('uses the nearest opaque ancestor when the element under the bar is transparent', () => {
    const restoreCanvas = stubCanvas();
    const wrapper = document.createElement('div');
    wrapper.style.backgroundColor = 'rgb(15, 23, 42)';
    const link = document.createElement('a');
    wrapper.appendChild(link);
    document.body.appendChild(wrapper);
    stubPageAt(link);

    renderBar();

    expect(barElement().className).toContain('bugpin-capture-bar-light');
    restoreCanvas();
  });

  it('keeps the dark bar when the page cannot be sampled', () => {
    renderBar();

    expect(barElement().className).toContain('bugpin-theme-dark');
  });
});
