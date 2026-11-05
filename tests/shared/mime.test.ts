import { describe, expect, it } from 'bun:test';
import { normalizeMimeType } from '../../src/shared/mime';

describe('normalizeMimeType', () => {
  it('removes codec parameters and normalizes whitespace and case', () => {
    expect(normalizeMimeType('video/mp4;codecs=avc1.64001f')).toBe('video/mp4');
    expect(normalizeMimeType(' video/mp4; codecs=avc1.42000a ')).toBe('video/mp4');
    expect(normalizeMimeType('VIDEO/WEBM;codecs=vp8,opus')).toBe('video/webm');
  });
});
