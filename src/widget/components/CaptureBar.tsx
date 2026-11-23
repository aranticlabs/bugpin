import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../lib/utils';
import { Button, type ButtonProps, Tooltip, type TooltipSide } from './ui';

const VIEWPORT_MARGIN = 8;
const TOOLTIP_CLEARANCE = 90;
const DARK_PAGE_LUMINANCE = 0.4;
const OPAQUE_ALPHA = 0.5;

export const CAPTURE_BAR_SHADOW_CLASS =
  'shadow-2xl shadow-black/50 ring-1 ring-(--bugpin-bar-outline)';

export const CAPTURE_BAR_CLASS =
  'fixed inset-auto z-top m-0 flex w-max max-w-[calc(100vw-16px)] cursor-default select-none flex-col gap-1.5 overflow-visible p-1.5';

const CAPTURE_BAR_DARK_CLASS = 'bugpin-theme-dark [--bugpin-bar-outline:rgb(255_255_255/0.25)]';
const CAPTURE_BAR_LIGHT_CLASS = 'bugpin-capture-bar-light [--bugpin-bar-outline:rgb(0_0_0/0.12)]';

type PageTone = 'light' | 'dark';

/** Resolves any computed CSS color (rgb, oklch, color()) to sRGB by painting it on a canvas. */
function toRgba(color: string): [number, number, number, number] | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function relativeLuminance([r, g, b]: [number, number, number, number]): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function opaqueBackgroundAt(x: number, y: number): [number, number, number, number] | null {
  const pageElement = document
    .elementsFromPoint(x, y)
    .find((element) => !element.closest('[data-bugpin-exclude]'));
  for (let element = pageElement ?? null; element; element = element.parentElement) {
    const rgba = toRgba(getComputedStyle(element).backgroundColor);
    if (rgba && rgba[3] >= OPAQUE_ALPHA) return rgba;
  }
  return null;
}

/**
 * Tone of the host page where the bar opens. A page without an opaque background shows
 * the canvas, which is dark only when the root element declares a dark color scheme.
 */
function detectPageTone(position: CaptureBarPosition | null): PageTone | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  const x = position ? position.x + VIEWPORT_MARGIN : window.innerWidth / 2;
  const y = position ? position.y + VIEWPORT_MARGIN : DEFAULT_SAMPLE_Y;
  try {
    const background = opaqueBackgroundAt(x, y);
    if (background) {
      return relativeLuminance(background) < DARK_PAGE_LUMINANCE ? 'dark' : 'light';
    }
    return getComputedStyle(document.documentElement).colorScheme.trim() === 'dark'
      ? 'dark'
      : 'light';
  } catch {
    return null;
  }
}

/**
 * Picks the bar theme that contrasts with the page: a light bar on dark pages and a dark
 * bar everywhere else. The tone is read once when the bar opens.
 */
export function useCaptureBarThemeClass(position: CaptureBarPosition | null): string {
  const [themeClass] = useState(() =>
    detectPageTone(position) === 'dark' ? CAPTURE_BAR_LIGHT_CLASS : CAPTURE_BAR_DARK_CLASS
  );
  return themeClass;
}

const DEFAULT_SAMPLE_Y = 40;
export const CAPTURE_BAR_DEFAULT_POSITION_CLASS = 'left-1/2 top-5 -translate-x-1/2';

export interface CaptureBarPosition {
  x: number;
  y: number;
}

function clampToViewport(bar: HTMLElement, x: number, y: number): CaptureBarPosition {
  const { width, height } = bar.getBoundingClientRect();
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxY),
  };
}

/**
 * Drag, viewport clamping and top-layer handling shared by the capture bars.
 * `layoutKeys` re-clamps the bar whenever its content (and thus its size) changes.
 */
export function useCaptureBar(
  position: CaptureBarPosition | null,
  onPositionChange: (position: CaptureBarPosition) => void,
  layoutKeys: readonly unknown[]
) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    const keepInViewport = () => {
      const bar = barRef.current;
      const current = positionRef.current;
      if (bar && current) onPositionChange(clampToViewport(bar, current.x, current.y));
    };

    keepInViewport();
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [onPositionChange, ...layoutKeys]);

  useEffect(() => {
    barRef.current?.showPopover?.();
  }, []);

  const handlePointerDown = useCallback((event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar || event.button !== 0) return;
    const rect = bar.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    bar.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      const bar = barRef.current;
      const offset = dragOffsetRef.current;
      if (!bar || !offset) return;
      onPositionChange(clampToViewport(bar, event.clientX - offset.x, event.clientY - offset.y));
    },
    [onPositionChange]
  );

  const handlePointerUp = useCallback(() => {
    dragOffsetRef.current = null;
  }, []);

  const tooltipSide: TooltipSide = !position || position.y < TOOLTIP_CLEARANCE ? 'bottom' : 'top';
  const style = position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined;
  const positionClass = !position ? CAPTURE_BAR_DEFAULT_POSITION_CLASS : undefined;

  return {
    barRef,
    style,
    positionClass,
    tooltipSide,
    handlePointerDown,
    barHandlers: {
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}

interface BarButtonProps extends ButtonProps {
  label: string;
  shortcut?: string;
  side: TooltipSide;
}

export const CaptureBarButton: FunctionComponent<BarButtonProps> = ({
  label,
  shortcut,
  side,
  class: className,
  ...props
}) => (
  <Tooltip content={shortcut ? `${label} (${shortcut})` : label} side={side}>
    <Button size="icon" aria-label={label} class={cn('h-9 w-9', className)} {...props} />
  </Tooltip>
);
