export function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The fields of `next` whose values differ from `current`. With `skipUndefined`, undefined fields
 * are left out, so a form that reports a full object adds only the fields the user touched.
 */
export function changedFields<T extends object>(
  next: Partial<T>,
  current: T,
  { skipUndefined = false }: { skipUndefined?: boolean } = {}
): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    const value = next[key];
    if (skipUndefined && value === undefined) continue;
    if (!sameValue(value, current[key])) changes[key] = value;
  }
  return changes;
}
