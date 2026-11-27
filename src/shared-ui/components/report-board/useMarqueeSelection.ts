import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

const ACTIVATION_DISTANCE = 4;

// Presses on these start their own interaction, so they never start a selection rectangle.
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="menuitem"], [data-board-card-id]';

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The part of a card that is visible inside its scrolling column */
function visibleBox(card: HTMLElement): Box | null {
  const box = card.getBoundingClientRect();
  const viewport = card.closest('[data-board-column-scroll]')?.getBoundingClientRect();
  if (!viewport) return box;
  const clipped = {
    left: Math.max(box.left, viewport.left),
    top: Math.max(box.top, viewport.top),
    right: Math.min(box.right, viewport.right),
    bottom: Math.min(box.bottom, viewport.bottom),
  };
  return clipped.left < clipped.right && clipped.top < clipped.bottom ? clipped : null;
}

/**
 * Selects cards with a rectangle drawn from an empty part of the board. Shift keeps the cards that
 * were already selected; a plain click on empty space clears the selection.
 */
export function useMarqueeSelection({
  containerRef,
  enabled,
  selectedIds,
  onChange,
  onClear,
}: {
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  selectedIds: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  onClear: () => void;
}) {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    base: ReadonlySet<string>;
    active: boolean;
  } | null>(null);

  const select = (x: number, y: number) => {
    const start = gesture.current;
    const container = containerRef.current;
    if (!start || !container) return;
    const box = {
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      right: Math.max(start.x, x),
      bottom: Math.max(start.y, y),
    };
    setRect({
      left: box.left,
      top: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
    });
    const next = new Set(start.base);
    for (const card of container.querySelectorAll<HTMLElement>('[data-board-card-id]')) {
      const cardBox = visibleBox(card);
      const id = card.dataset.boardCardId;
      if (id && cardBox && intersects(box, cardBox)) next.add(id);
    }
    onChange(next);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0 || event.pointerType === 'touch') return;
    if (!(event.target instanceof Element) || event.target.closest(INTERACTIVE_SELECTOR)) return;
    // Keeps the browser from selecting text while the rectangle is drawn.
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      base: event.shiftKey ? new Set(selectedIds) : new Set(),
      active: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (
      !start.active &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < ACTIVATION_DISTANCE
    ) {
      return;
    }
    start.active = true;
    select(event.clientX, event.clientY);
  };

  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    gesture.current = null;
    setRect(null);
    if (!start.active && start.base.size === 0) onClear();
  };

  return {
    rect,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
