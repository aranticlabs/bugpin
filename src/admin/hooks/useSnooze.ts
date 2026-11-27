import { useState } from 'react';
import { readDismissal, writeDismissal } from '../lib/noticeStorage';

const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Hides a notice for a day, remembered per browser under the given storage key. */
export function useSnooze(key: string) {
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => Number(readDismissal(key)) || 0);

  const snooze = () => {
    const until = Date.now() + SNOOZE_MS;
    writeDismissal(key, String(until));
    setSnoozedUntil(until);
  };

  return { isSnoozed: snoozedUntil > Date.now(), snooze };
}
