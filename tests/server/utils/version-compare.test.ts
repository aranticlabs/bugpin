import { describe, it, expect } from 'bun:test';
import { compareVersions, isNewer, parseVersion } from '../../../src/server/utils/version-compare';

describe('isNewer', () => {
  it('returns true when patch is greater', () => {
    expect(isNewer('1.0.7', '1.0.6')).toBe(true);
  });

  it('returns false when latest is older', () => {
    expect(isNewer('1.0.6', '1.0.7')).toBe(false);
  });

  it('returns false when versions are equal', () => {
    expect(isNewer('1.0.6', '1.0.6')).toBe(false);
  });

  it('handles a leading v on the latest tag', () => {
    expect(isNewer('v1.0.7', '1.0.6')).toBe(true);
  });

  it('handles a leading v on the current version', () => {
    expect(isNewer('1.0.7', 'v1.0.6')).toBe(true);
  });

  it('compares major version numerically', () => {
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
  });

  it('uses numeric per-segment patch comparison, not lexicographic', () => {
    expect(isNewer('1.0.10', '1.0.9')).toBe(true);
  });

  it('uses numeric per-segment minor comparison, not lexicographic', () => {
    expect(isNewer('1.10.0', '1.9.99')).toBe(true);
  });

  it('rejects prerelease tag shapes', () => {
    expect(isNewer('1.0.7-beta', '1.0.6')).toBe(false);
  });

  it('rejects two-segment versions', () => {
    expect(isNewer('1.0', '1.0.6')).toBe(false);
  });

  it('rejects four-segment versions', () => {
    expect(isNewer('1.0.0.1', '1.0.0')).toBe(false);
  });

  it('rejects an empty latest string', () => {
    expect(isNewer('', '1.0.6')).toBe(false);
  });

  it('rejects an empty current string', () => {
    expect(isNewer('1.0.7', '')).toBe(false);
  });

  it('rejects segments containing a minus sign', () => {
    expect(isNewer('1.0.-1', '1.0.0')).toBe(false);
  });

  it('rejects non-numeric segments', () => {
    expect(isNewer('1.0.x', '1.0.0')).toBe(false);
  });
});

describe('parseVersion', () => {
  it('parses a stable three-segment version', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('strips a leading v', () => {
    expect(parseVersion('v10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('returns null for prerelease shapes', () => {
    expect(parseVersion('1.0.0-beta.1')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseVersion('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseVersion(undefined as unknown as string)).toBeNull();
  });
});

describe('compareVersions', () => {
  it('sorts valid versions numerically', () => {
    expect(['1.10.0', '2.0.0', '1.2.9'].sort(compareVersions)).toEqual([
      '1.2.9',
      '1.10.0',
      '2.0.0',
    ]);
  });

  it('treats invalid versions as equal', () => {
    expect(compareVersions('invalid', '1.0.0')).toBe(0);
  });
});
