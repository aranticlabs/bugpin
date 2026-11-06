import { useEffect, useState } from 'react';

const BOUNDARY_SLACK_MS = 50;

function msUntilNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + BOUNDARY_SLACK_MS;
}

/**
 * Current time from the device clock, updated at every minute change.
 *
 * Browsers throttle or freeze timers in background tabs and while the computer
 * sleeps, so the time is also re-read as soon as the page becomes visible,
 * gains focus or is restored from the back/forward cache.
 */
export function useCurrentMinute(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;

    const tick = () => {
      const current = new Date();
      setNow(current);
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, msUntilNextMinute(current));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };

    tick();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, []);

  return now;
}
