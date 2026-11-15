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
    position: null,
    onPositionChange: () => undefined,
    onDelayChange: mock(),
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

function timerTrigger(): HTMLButtonElement {
  return container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
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

  it('disables capture and timer while the tab share is pending', () => {
    renderBar({ isReady: false });

    expect(captureButton()?.disabled).toBe(true);
    expect(timerTrigger().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(false);
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
    expect(cancelButton()).not.toBeNull();
  });
});
