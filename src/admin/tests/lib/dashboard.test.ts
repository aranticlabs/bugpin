import { describe, it, expect } from 'vitest';
import {
  dayPartFor,
  formatHours,
  formatTimeAgo,
  initials,
  levelProgressPercent,
  unlockedCount,
} from '../../lib/dashboard';
import type { GamificationProgress } from '@shared/types';

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

  it('treats times in the future as just now', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    expect(formatTimeAgo('2026-11-06T12:05:00Z', now)).toBe('just now');
  });
});

describe('initials', () => {
  it('takes up to two initials', () => {
    expect(initials('Priya Shah')).toBe('PS');
    expect(initials('alex  morgan lee')).toBe('AM');
  });
});

describe('level progress', () => {
  const game = (overrides: Partial<GamificationProgress>): GamificationProgress => ({
    xp: 0,
    level: 1,
    levelStartXp: 0,
    nextLevelXp: 100,
    achievements: [],
    ...overrides,
  });

  it('measures progress within the current level', () => {
    expect(
      levelProgressPercent(game({ xp: 300, level: 3, levelStartXp: 250, nextLevelXp: 500 }))
    ).toBe(20);
    expect(levelProgressPercent(game({ xp: 0 }))).toBe(0);
  });

  it('is full at the top level', () => {
    expect(
      levelProgressPercent(game({ xp: 12000, level: 10, levelStartXp: 10000, nextLevelXp: null }))
    ).toBe(100);
  });

  it('counts unlocked achievements', () => {
    expect(
      unlockedCount(
        game({
          achievements: [
            { id: 'hatchling', current: 1, target: 1, unlockedAt: '2026-11-01T10:00:00.000Z' },
            { id: 'cocoon', current: 3, target: 100 },
          ],
        })
      )
    ).toBe(1);
  });
});
