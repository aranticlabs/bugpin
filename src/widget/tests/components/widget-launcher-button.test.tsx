import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { render } from 'preact';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { installDom } from '../helpers/dom';
import { LAUNCHER_TOOLTIP_DELAY_MS } from '@shared/tooltip-position.js';

const waitForTooltipDelay = () =>
  new Promise((resolve) => setTimeout(resolve, LAUNCHER_TOOLTIP_DELAY_MS + 20));

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
  it('shows tooltip on hover and exposes the dark theme colors as CSS variables', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <WidgetLauncherButton
        position="bottom-right"
        buttonText={{ project: { en: 'Report' }, global: null, builtin: null }}
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={18}
        buttonIconStroke={2}
        buttonOffsetX={20}
        buttonOffsetY={20}
        buttonSizeUnit="px"
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
        tooltipText={{ project: { en: 'Need help?' }, global: null, builtin: null }}
        onClick={() => undefined}
      />,
      container
    );

    const button = container.querySelector('button');
    button?.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    button?.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const wrapper = container.firstElementChild as HTMLDivElement;
    expect(wrapper.style.getPropertyValue('--launcher-bg')).toBe('#222222');
    expect(wrapper.style.getPropertyValue('--launcher-bg-hover')).toBe('#333333');
    expect(button?.classList.contains('hover:bg-(--launcher-bg-hover)')).toBe(true);
    expect(button?.classList.contains('focus-visible:bg-(--launcher-bg-hover)')).toBe(true);
    // The tooltip waits for the hover delay.
    expect(container.textContent).not.toContain('Need help?');

    await waitForTooltipDelay();
    expect(container.textContent).toContain('Need help?');

    render(null, container);
    container.remove();
  });

  it('applies the edge offsets in the chosen unit to the sides of the selected corner', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(
      <WidgetLauncherButton
        position="top-left"
        buttonText={{ project: null, global: null, builtin: null }}
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={18}
        buttonIconStroke={2}
        buttonOffsetX={2}
        buttonOffsetY={0.5}
        buttonSizeUnit="rem"
        theme="light"
        lightButtonColor="#ffffff"
        lightTextColor="#000000"
        lightButtonHoverColor="#eeeeee"
        lightTextHoverColor="#111111"
        darkButtonColor="#222222"
        darkTextColor="#ffffff"
        darkButtonHoverColor="#333333"
        darkTextHoverColor="#ffffff"
        enableHoverScaleEffect={false}
        tooltipEnabled={false}
        tooltipText={{ project: null, global: null, builtin: null }}
        onClick={() => undefined}
      />,
      container
    );

    const wrapper = container.firstElementChild as HTMLDivElement;
    expect(wrapper.style.top).toBe('calc(0.5rem + env(safe-area-inset-top, 0px))');
    expect(wrapper.style.left).toBe('calc(2rem + env(safe-area-inset-left, 0px))');
    expect(wrapper.style.bottom).toBe('');
    expect(wrapper.style.right).toBe('');

    render(null, container);
    container.remove();
  });

  it('opens the tooltip below the button in the top corners and keeps it inside the window', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    globalThis.window.innerWidth = 1000;

    render(
      <WidgetLauncherButton
        position="top-right"
        buttonText={{ project: null, global: null, builtin: null }}
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={18}
        buttonIconStroke={2}
        buttonOffsetX={20}
        buttonOffsetY={20}
        buttonSizeUnit="px"
        theme="light"
        lightButtonColor="#ffffff"
        lightTextColor="#000000"
        lightButtonHoverColor="#eeeeee"
        lightTextHoverColor="#111111"
        darkButtonColor="#222222"
        darkTextColor="#ffffff"
        darkButtonHoverColor="#333333"
        darkTextHoverColor="#ffffff"
        enableHoverScaleEffect={false}
        tooltipEnabled={true}
        tooltipText={{ project: { en: 'Need help?' }, global: null, builtin: null }}
        onClick={() => undefined}
      />,
      container
    );

    const button = container.querySelector('button');
    button?.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
    await waitForTooltipDelay();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const tooltip = container.querySelector('div.whitespace-nowrap') as HTMLDivElement;
    expect(tooltip.textContent).toBe('Need help?');
    expect(tooltip.className).toContain('top-full');
    // Mocked rects: button center 60, tooltip 120 wide -> centered left edge 0, shifted to 4.
    expect(tooltip.style.getPropertyValue('--tooltip-shift')).toBe('4px');

    render(null, container);
    container.remove();
  });
});
