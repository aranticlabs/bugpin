import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { cn } from '../lib/utils';
import { Button, type ButtonProps, Tooltip, type TooltipSide } from './ui';

const VIEWPORT_MARGIN = 8;
const TOOLTIP_CLEARANCE = 90;

// Tailwind's shadow and ring utilities rely on @property defaults, which do not apply in a shadow root.
export const CAPTURE_BAR_SHADOW_CLASS =
  '[box-shadow:0_0_0_1px_rgb(255_255_255/0.25),0_25px_50px_-12px_rgb(0_0_0/0.5)]';

export const CAPTURE_BAR_CLASS =
  'bugpin-theme-dark [--destructive:#dc2626] fixed z-[2147483647] m-0 flex w-max max-w-[calc(100vw-16px)] cursor-default select-none flex-col gap-1.5 overflow-visible p-1.5 [inset:auto]';

// Tailwind's translate utilities rely on @property defaults, which do not apply in a shadow root.
const DEFAULT_POSITION_STYLE = { left: '50%', top: '20px', transform: 'translateX(-50%)' };

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
  const style = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : DEFAULT_POSITION_STYLE;

  return {
    barRef,
    style,
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
