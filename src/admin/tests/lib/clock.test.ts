import { describe, it, expect } from 'vitest';
import { formatClockTime, usesTwelveHourClock } from '../../lib/clock';

describe('usesTwelveHourClock', () => {
  it('follows the time zone, not the browser language', () => {
    expect(usesTwelveHourClock({ timeZone: 'America/New_York', language: 'en-US' })).toBe(true);
    expect(usesTwelveHourClock({ timeZone: 'America/Indiana/Knox', language: 'en-US' })).toBe(true);
    expect(usesTwelveHourClock({ timeZone: 'Europe/Berlin', language: 'en-US' })).toBe(false);
    expect(usesTwelveHourClock({ timeZone: 'Asia/Tokyo' })).toBe(false);
  });

  it('uses 24 h for French-language browsers in Canada', () => {
    expect(usesTwelveHourClock({ timeZone: 'America/Montreal', language: 'fr-CA' })).toBe(false);
    expect(usesTwelveHourClock({ timeZone: 'America/Toronto', language: 'en-CA' })).toBe(true);
  });

  it('falls back to 24 h when the time zone is unknown', () => {
    expect(usesTwelveHourClock({})).toBe(false);
  });
});

describe('formatClockTime', () => {
  const afternoon = new Date(2026, 10, 6, 14, 5);

  it('formats hours and minutes in the chosen style', () => {
    expect(formatClockTime(afternoon, false)).toBe('14:05');
    expect(formatClockTime(afternoon, true)).toBe('2:05 PM');
  });
});
