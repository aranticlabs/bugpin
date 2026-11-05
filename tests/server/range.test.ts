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

  function createRecordingHandle(kind: StoredFileHandle['kind']) {
    const calls: Array<{ start: number; end: number } | 'full'> = [];
    const handle: StoredFileHandle = {
      kind,
      read: async () => {
        calls.push('full');
        return new Uint8Array();
      },
      readRange: async (start, end) => {
        calls.push({ start, end });
        return new Uint8Array(end - start + 1);
      },
    };
    return { handle, calls };
  }

  const MB = 1024 * 1024;

  for (const [rangeHeader, expected] of [
    ['bytes=0-', { start: 0, end: 8 * MB - 1 }],
    [`bytes=0-${20 * MB - 1}`, { start: 0, end: 8 * MB - 1 }],
    [`bytes=${MB}-${3 * MB}`, { start: MB, end: 3 * MB }],
    [`bytes=-${12 * MB}`, { start: 8 * MB, end: 16 * MB - 1 }],
    ['bytes=-1024', { start: 20 * MB - 1024, end: 20 * MB - 1 }],
  ] as const) {
    it(`caps remote range ${rangeHeader} at 8 MB`, async () => {
      const { handle, calls } = createRecordingHandle('remote');

      const response = await createFileResponse({
        handle,
        rangeHeader,
        size: 20 * MB,
        mimeType: 'video/mp4',
        cacheControl: 'private',
      });

      expect(calls).toEqual([expected]);
      expect(response?.status).toBe(206);
      expect(response?.headers.get('Content-Range')).toBe(
        `bytes ${expected.start}-${expected.end}/${20 * MB}`
      );
      expect(response?.headers.get('Content-Length')).toBe(
        (expected.end - expected.start + 1).toString()
      );
    });
  }

  it('serves local ranges without a cap', async () => {
    const { handle, calls } = createRecordingHandle('local');

    const response = await createFileResponse({
      handle,
      rangeHeader: 'bytes=0-',
      size: 20 * MB,
      mimeType: 'video/mp4',
      cacheControl: 'private',
    });

    expect(calls).toEqual([{ start: 0, end: 20 * MB - 1 }]);
    expect(response?.headers.get('Content-Length')).toBe((20 * MB).toString());
  });

  for (const kind of ['local', 'remote'] as const) {
    it(`answers ${kind} HEAD requests without reading the file`, async () => {
      const { handle, calls } = createRecordingHandle(kind);

      const full = await createFileResponse({
        handle,
        rangeHeader: undefined,
        size: 20 * MB,
        mimeType: 'video/webm',
        cacheControl: 'private',
        headOnly: true,
      });
      const ranged = await createFileResponse({
        handle,
        rangeHeader: 'bytes=0-',
        size: 20 * MB,
        mimeType: 'video/webm',
        cacheControl: 'private',
        headOnly: true,
      });

      expect(calls).toEqual([]);
      expect(full?.status).toBe(200);
      expect(full?.headers.get('Content-Length')).toBe((20 * MB).toString());
      expect(full?.headers.get('Content-Type')).toBe('video/webm');
      expect(await full?.text()).toBe('');
      expect(ranged?.status).toBe(206);
      expect(ranged?.headers.get('Content-Length')).toBe(
        (kind === 'remote' ? 8 * MB : 20 * MB).toString()
      );
    });
  }
});
