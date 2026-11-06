import { useCallback, useState, type RefCallback } from 'react';

function scrollParentOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

// Height that lets the element end exactly where its scroll parent's visible area ends, with
// the content around it unchanged. Undefined until measured or when there is no scroll parent.
export function useFillScrollParentHeight<T extends HTMLElement>(
  minHeight: number
): [RefCallback<T>, number | undefined] {
  const [height, setHeight] = useState<number | undefined>(undefined);

  const ref = useCallback<RefCallback<T>>(
    (element) => {
      if (!element || typeof ResizeObserver === 'undefined') return;
      const parent = scrollParentOf(element);
      const content = parent?.firstElementChild;
      if (!parent || !(content instanceof HTMLElement)) return;

      const measure = () => {
        const parentRect = parent.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const top = rect.top - parentRect.top + parent.scrollTop;
        const spaceBelow = content.getBoundingClientRect().bottom - rect.bottom;
        setHeight(Math.max(minHeight, Math.floor(parent.clientHeight - top - spaceBelow)));
      };

      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(parent);
      observer.observe(content);
      return () => {
        observer.disconnect();
        setHeight(undefined);
      };
    },
    [minHeight]
  );

  return [ref, height];
}
