import { describe, it, expect } from 'vitest';
import { dayPartFor, formatHours, formatTimeAgo, initials } from '../../lib/dashboard';

describe('dayPartFor', () => {
  it('splits the day into morning, afternoon, evening and night', () => {
    expect(dayPartFor(4)).toBe('night');
    expect(dayPartFor(5)).toBe('morning');
    expect(dayPartFor(12)).toBe('day');
    expect(dayPartFor(18)).toBe('evening');
    expect(dayPartFor(22)).toBe('night');
  });
});

describe('formatHours', () => {
  it('uses hours up to two days and days after that', () => {
    expect(formatHours(null)).toBe('–');
    expect(formatHours(0.4)).toBe('< 1 h');
    expect(formatHours(26.4)).toBe('26 h');
    expect(formatHours(72)).toBe('3.0 d');
  });
});

describe('formatTimeAgo', () => {
  it('describes how long ago something happened', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    expect(formatTimeAgo('2026-11-06T11:59:50Z', now)).toBe('just now');
    expect(formatTimeAgo('2026-11-06T11:48:00Z', now)).toBe('12 min ago');
    expect(formatTimeAgo('2026-11-06T09:00:00Z', now)).toBe('3 h ago');
    expect(formatTimeAgo('2026-11-05T12:00:00Z', now)).toBe('yesterday');
    expect(formatTimeAgo('2026-11-01T12:00:00Z', now)).toBe('5 days ago');
  });
});

describe('initials', () => {
  it('takes up to two initials', () => {
    expect(initials('Priya Shah')).toBe('PS');
    expect(initials('alex  morgan lee')).toBe('AM');
  });
});
