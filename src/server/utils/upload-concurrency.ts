const active = new Map<string, number>();
let total = 0;

/**
 * Reserves one in-flight upload for `key`. Returns a release function, or null when the key
 * or the whole process already holds its maximum. Calling the release more than once is a no-op.
 */
export function acquireUploadSlot(key: string, perKeyMax = 2, globalMax = 10): (() => void) | null {
  const current = active.get(key) ?? 0;
  if (current >= perKeyMax || total >= globalMax) return null;
  active.set(key, current + 1);
  total++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    total--;
    const remaining = (active.get(key) ?? 1) - 1;
    if (remaining > 0) active.set(key, remaining);
    else active.delete(key);
  };
}

export function resetUploadSlots(): void {
  active.clear();
  total = 0;
}
