import type { StoredFileHandle } from '../storage/files.js';

export type ByteRange = { start: number; end: number };

// Remote objects are buffered before they are sent, so each ranged response is capped. A 206 whose
// Content-Range is shorter than requested is valid, and media elements request the remainder.
const MAX_REMOTE_RANGE_BYTES = 8 * 1024 * 1024;

export function parseRangeHeader(
  header: string | undefined,
  size: number
): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;

  const value = header.trim();
  if (!value.toLowerCase().startsWith('bytes=')) return null;

  const range = value.slice(6);
  if (range.includes(',')) return null;

  const match = /^(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return null;
  if (size <= 0) return 'unsatisfiable';

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (suffixLength <= 0) return 'unsatisfiable';
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(match[1]);
  if (!Number.isSafeInteger(start) || start >= size) return 'unsatisfiable';

  if (!match[2]) return { start, end: size - 1 };

  const requestedEnd = Number(match[2]);
  if (requestedEnd < start) return 'unsatisfiable';
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export async function createFileResponse(options: {
  handle: StoredFileHandle;
  rangeHeader: string | undefined;
  size: number;
  mimeType: string;
  cacheControl: string;
  headOnly?: boolean;
  filename?: string;
}): Promise<Response | null> {
  const parsedRange = parseRangeHeader(options.rangeHeader, options.size);
  const sharedHeaders: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': options.cacheControl,
    'X-Content-Type-Options': 'nosniff',
  };
  if (options.filename) {
    const inline = /^(image\/(png|jpeg|jpg|gif|webp)|video\/(mp4|webm|quicktime))$/.test(
      options.mimeType
    );
    const filename = (options.filename.split(/[\\/]/).pop() || 'file').replace(
      /[^\x20-\x7e]|["\\]/g,
      '_'
    );
    sharedHeaders['Content-Disposition'] =
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`;
  }

  if (parsedRange === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: {
        ...sharedHeaders,
        'Cache-Control': 'no-store',
        'Content-Range': `bytes */${options.size}`,
      },
    });
  }

  if (!parsedRange) {
    const headers = {
      ...sharedHeaders,
      'Content-Type': options.mimeType,
      'Content-Length': options.size.toString(),
    };
    if (options.headOnly) return new Response(null, { headers });

    const data = await options.handle.read();
    if (!data) return null;
    return new Response(data, { headers });
  }

  const range = { ...parsedRange };
  if (options.handle.kind === 'remote') {
    range.end = Math.min(range.end, range.start + MAX_REMOTE_RANGE_BYTES - 1);
  }

  const init = {
    status: 206,
    headers: {
      ...sharedHeaders,
      'Content-Type': options.mimeType,
      'Content-Length': (range.end - range.start + 1).toString(),
      'Content-Range': `bytes ${range.start}-${range.end}/${options.size}`,
    },
  };
  if (options.headOnly) return new Response(null, init);

  const data = await options.handle.readRange(range.start, range.end);
  if (!data) return null;
  return new Response(data, init);
}
