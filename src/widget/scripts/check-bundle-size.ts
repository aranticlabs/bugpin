import { resolve } from 'path';

export const MAX_GZIPPED_BYTES = 190_000;

export function checkWidgetBundleSize(
  content: Uint8Array<ArrayBuffer>,
  limitBytes = MAX_GZIPPED_BYTES
): number {
  const size = Bun.gzipSync(content, { level: 9 }).byteLength;
  if (size > limitBytes) {
    throw new Error(`Widget bundle is ${size} gzipped bytes; the limit is ${limitBytes}`);
  }
  return size;
}

if (import.meta.main) {
  const bundlePath = resolve(import.meta.dir, '../dist/widget.js');
  const bundle = Bun.file(bundlePath);
  if (!(await bundle.exists())) {
    throw new Error(`Widget bundle not found at ${bundlePath}; build the widget first`);
  }

  const size = checkWidgetBundleSize(await bundle.bytes());
  console.info(`Widget bundle: ${size} / ${MAX_GZIPPED_BYTES} gzipped bytes`);
}
