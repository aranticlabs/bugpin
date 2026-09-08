// \d+ matches only non-negative integers; floats, negatives, and empty segments fail the regex.
const THREE_SEGMENT = /^(\d+)\.(\d+)\.(\d+)$/;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseVersion(input: string): ParsedVersion | null {
  if (typeof input !== 'string' || input.length === 0) {
    return null;
  }

  const stripped = input.startsWith('v') ? input.slice(1) : input;
  const match = THREE_SEGMENT.exec(stripped);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

export function compareVersions(first: string, second: string): number {
  const a = parseVersion(first);
  const b = parseVersion(second);
  if (!a || !b) {
    return 0;
  }

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
