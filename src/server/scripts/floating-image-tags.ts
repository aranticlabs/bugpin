import { compareVersions, parseVersion } from '../utils/version-compare.js';

export interface FloatingTags {
  latest: boolean;
  minor: boolean;
}

/**
 * Decides which floating image tags a release may move. A floating tag only moves forward:
 * `latest` to the newest release overall and `1.3` to the newest 1.3.x. Tags that are not plain x.y.z versions, such as dev and beta builds, are ignored.
 * Requires a plain x.y.z release and at least one plain version in the inventory.
 */
export function floatingTagsFor(version: string, existingTags: string[]): FloatingTags | null {
  const release = parseVersion(version);
  if (!release || !existingTags.some((tag) => parseVersion(tag) !== null)) return null;

  const newer = existingTags
    .filter((tag) => parseVersion(tag) !== null && compareVersions(tag, version) > 0)
    .map((tag) => parseVersion(tag)!);

  return {
    latest: newer.length === 0,
    minor: !newer.some((tag) => tag.major === release.major && tag.minor === release.minor),
  };
}

if (import.meta.main) {
  const version = process.argv[2] ?? '';
  const existingTags = (await Bun.stdin.text())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const result = floatingTagsFor(version, existingTags);
  if (!result) {
    console.error(
      'Expected a stable release version and at least one stable version tag on stdin.'
    );
    process.exit(1);
  }
  console.log(`latest=${result.latest}\nminor=${result.minor}`);
}
