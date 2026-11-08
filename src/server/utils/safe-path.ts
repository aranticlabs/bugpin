import * as path from 'path';

/**
 * Resolve a path under `baseDir`, rejecting traversal / separator abuse.
 * Returns null when any segment is unsafe or the result escapes `baseDir`.
 */
export function resolvePathInside(baseDir: string, ...parts: string[]): string | null {
  for (const part of parts) {
    if (
      typeof part !== 'string' ||
      part.length === 0 ||
      part === '.' ||
      part === '..' ||
      part.includes('/') ||
      part.includes('\\') ||
      part.includes('\0')
    ) {
      return null;
    }
  }

  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, ...parts);
  const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;

  if (resolved !== resolvedBase && !resolved.startsWith(baseWithSep)) {
    return null;
  }

  return resolved;
}

/**
 * Resolve a URL path such as `/assets/app.js` under `baseDir`.
 * Empty segments from leading or repeated slashes are ignored; any unsafe segment returns null.
 */
export function resolveStaticPath(baseDir: string, requestPath: string): string | null {
  const segments = requestPath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;
  return resolvePathInside(baseDir, ...segments);
}
