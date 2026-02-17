import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'preact';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { installDom } from '../helpers/dom';

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

let restoreDom: (() => void) | null = null;

beforeEach(() => {
  restoreDom = installDom();

  globalThis.window.matchMedia = () =>
    ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0 as never;
  }) as typeof requestAnimationFrame;

  if (globalThis.HTMLElement) {
    globalThis.HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        width: 120,
        height: 40,
        left: 0,
        top: 0,
        right: 120,
        bottom: 40,
      }) as DOMRect;
  }
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

describe('WidgetLauncherButton', () => {
  it('shows tooltip on hover and uses dark hover colors', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <WidgetLauncherButton
        position="bottom-right"
        buttonText="Report"
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={18}
        buttonIconStroke={2}
        theme="auto"
        lightButtonColor="#ffffff"
        lightTextColor="#000000"
        lightButtonHoverColor="#eeeeee"
        lightTextHoverColor="#111111"
        darkButtonColor="#222222"
        darkTextColor="#ffffff"
        darkButtonHoverColor="#333333"
        darkTextHoverColor="#ffffff"
        enableHoverScaleEffect={true}
        tooltipEnabled={true}
        tooltipText="Need help?"
        onClick={() => undefined}
      />,
      container,
    );

    const button = container.querySelector('button');
    button?.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    button?.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toContain('Need help?');
    expect((button as HTMLButtonElement).style.backgroundColor).toBe('rgb(51, 51, 51)');

    render(null, container);
    container.remove();
  });
});
