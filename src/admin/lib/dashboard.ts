export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export const GREETINGS: Record<DayPart, string> = {
  morning: 'Good morning',
  day: 'Good afternoon',
  evening: 'Good evening',
  night: 'Working late',
};

export function dayPartFor(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Short duration: hours up to two days, days after that */
export function formatHours(hours: number | null): string {
  if (hours === null) return '–';
  if (hours < 1) return '< 1 h';
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function formatTimeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / 86_400_000);
}

/** Month and day of a YYYY-MM-DD key or ISO time, without shifting the calendar day */
export function formatDay(value: string): string {
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
