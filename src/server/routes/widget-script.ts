import type { Context } from 'hono';
import { config } from '../config.js';

function stripWeakPrefix(entityTag: string): string {
  return entityTag.startsWith('W/') ? entityTag.slice(2) : entityTag;
}

// If-None-Match uses the weak comparison (RFC 9110, section 13.1.2): "abc" and W/"abc" match.
function matchesEntityTag(ifNoneMatch: string | undefined, entityTag: string): boolean {
  if (!ifNoneMatch) return false;
  const opaqueTag = stripWeakPrefix(entityTag);
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === '*' || stripWeakPrefix(candidate) === opaqueTag);
}

/**
 * Serve the widget bundle. Sites embed this URL unversioned, so the browser must
 * revalidate it on every page load: a long max-age keeps running an outdated
 * widget after an upgrade, and keeps showing the launcher while the server is
 * down. An entity tag makes that revalidation a body-less 304.
 */
export function createWidgetScriptHandler(getWidgetDir: () => string = () => config.widgetDir) {
  return async (c: Context): Promise<Response> => {
    const filePath = `${getWidgetDir()}/widget.js`;

    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const entityTag = `W/"${file.size}-${file.lastModified}"`;
        const headers = {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, no-cache',
          ETag: entityTag,
          'Access-Control-Allow-Origin': '*', // Allow widget to be loaded from any domain
          'Cross-Origin-Resource-Policy': 'cross-origin',
        };

        if (matchesEntityTag(c.req.header('If-None-Match'), entityTag)) {
          return new Response(null, { status: 304, headers });
        }
        return new Response(file, { headers });
      }
    } catch {
      // File not found
    }

    return c.json({ success: false, error: 'NOT_FOUND', message: 'Widget not found' }, 404);
  };
}

export const serveWidgetScript = createWidgetScriptHandler();
