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
    delaySeconds: 3,
    position: null,
    onPositionChange: () => undefined,
    onCaptureNow: mock(),
    onCaptureDelayed: mock(),
    onCancel: mock(),
    ...overrides,
  };
  render(<ScreenshotCaptureBar {...props} />, container);
  return props;
}

function button(label: string): HTMLButtonElement {
  return container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;
}

describe('ScreenshotCaptureBar', () => {
  it('is excluded from captures and offers instant, delayed and cancel actions', () => {
    const props = renderBar();

    expect(container.querySelector('[data-bugpin-exclude]')).not.toBeNull();
    button(t('screenshot.bar.nowLabel')).click();
    button(t('screenshot.bar.delayedLabel', { seconds: 3 })).click();
    button(t('screenshot.bar.cancel')).click();

    expect(props.onCaptureNow).toHaveBeenCalledTimes(1);
    expect(props.onCaptureDelayed).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(t('screenshot.bar.delayed', { seconds: 3 }));
  });

  it('disables capture while the tab share is pending', () => {
    renderBar({ isReady: false });

    expect(button(t('screenshot.bar.nowLabel')).disabled).toBe(true);
    expect(button(t('screenshot.bar.delayedLabel', { seconds: 3 })).disabled).toBe(true);
    expect(button(t('screenshot.bar.cancel')).disabled).toBe(false);
  });

  it('replaces the capture buttons with the countdown and keeps cancel', () => {
    renderBar({ isCountingDown: true, countdown: 2 });

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      t('screenshot.bar.countdown', { seconds: 2 })
    );
    expect(button(t('screenshot.bar.nowLabel'))).toBeNull();
    expect(button(t('screenshot.bar.cancel'))).not.toBeNull();
  });
});
