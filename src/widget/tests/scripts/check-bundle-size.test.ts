import { describe, expect, it } from 'bun:test';
import { checkWidgetBundleSize, MAX_GZIPPED_BYTES } from '../../scripts/check-bundle-size';

function createIncompressibleBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  let state = 0x9e3779b9;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

describe('checkWidgetBundleSize', () => {
  it('allows up to 190KB gzipped by default', () => {
    expect(MAX_GZIPPED_BYTES).toBe(190_000);
  });

  it('returns the level 9 gzip size below the limit', () => {
    const content = new TextEncoder().encode('widget'.repeat(1_000));
    const size = checkWidgetBundleSize(content, 1_000);

    expect(size).toBe(Bun.gzipSync(content, { level: 9 }).byteLength);
  });

  it('rejects a bundle above the limit', () => {
    expect(() => checkWidgetBundleSize(createIncompressibleBytes(2_000), 1_000)).toThrow(
      'the limit is 1000'
    );
  });
});
