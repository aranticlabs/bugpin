import { useEffect, useState } from 'react';

const WIDE_QUERY = '(min-width: 1024px)';

/** Whether the viewport is at least as wide as the Tailwind `lg` breakpoint */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide;
}
