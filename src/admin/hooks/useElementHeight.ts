import { useCallback, useState, type RefCallback } from 'react';

export function useElementHeight<T extends HTMLElement>(): [RefCallback<T>, number] {
  const [height, setHeight] = useState(0);

  const ref = useCallback<RefCallback<T>>((element) => {
    if (!element) return;
    setHeight(element.getBoundingClientRect().height);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(([entry]) => {
            if (entry) setHeight(entry.target.getBoundingClientRect().height);
          });
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      setHeight(0);
    };
  }, []);

  return [ref, height];
}
