import { describe, expect, it } from 'bun:test';
import { createFileResponse, parseRangeHeader } from '../../src/server/utils/range';
import type { StoredFileHandle } from '../../src/server/storage/files';

describe('parseRangeHeader', () => {
  it('parses closed, open-ended, and suffix ranges', () => {
    expect(parseRangeHeader('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parseRangeHeader('bytes=7-', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRangeHeader('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRangeHeader('bytes=-20', 10)).toEqual({ start: 0, end: 9 });
    expect(parseRangeHeader('bytes=2-99999999999999999999', 10)).toEqual({ start: 2, end: 9 });
    expect(parseRangeHeader('bytes=-99999999999999999999', 10)).toEqual({ start: 0, end: 9 });
  });

  it('serves full files for unsupported range syntax', () => {
    expect(parseRangeHeader(undefined, 10)).toBeNull();
    expect(parseRangeHeader('items=0-1', 10)).toBeNull();
    expect(parseRangeHeader('bytes=0-1,4-5', 10)).toBeNull();
    expect(parseRangeHeader('bytes=invalid', 10)).toBeNull();
  });

  it('rejects unsatisfiable ranges', () => {
    expect(parseRangeHeader('bytes=10-', 10)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=5-4', 10)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=-0', 10)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=0-', 0)).toBe('unsatisfiable');
  });
});

describe('createFileResponse', () => {
  it('caps open-ended remote ranges at 8 MB', async () => {
    let requestedRange: { start: number; end: number } | undefined;
    const handle: StoredFileHandle = {
      kind: 'remote',
      read: async () => new Uint8Array(),
      readRange: async (start, end) => {
        requestedRange = { start, end };
        return new Uint8Array();
      },
    };

    const response = await createFileResponse({
      handle,
      rangeHeader: 'bytes=1024-',
      size: 20 * 1024 * 1024,
      mimeType: 'video/mp4',
      cacheControl: 'private',
    });

    expect(requestedRange).toEqual({ start: 1024, end: 1024 + 8 * 1024 * 1024 - 1 });
    expect(response?.status).toBe(206);
    expect(response?.headers.get('Content-Length')).toBe((8 * 1024 * 1024).toString());
  });
});
