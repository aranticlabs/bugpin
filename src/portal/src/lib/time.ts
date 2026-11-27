export function relativeTime(value: string, locale: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  const minutes = Math.round((ts - Date.now()) / 60000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  if (Math.abs(minutes) < 1440) return format.format(Math.round(minutes / 60), 'hour');
  return format.format(Math.round(minutes / 1440), 'day');
}

export function absoluteTime(value: string, locale: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
