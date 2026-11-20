import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from '../../../src/server/node_modules/hono';
import { createWidgetScriptHandler } from '../../../src/server/routes/widget-script';

let tempDir = '';
let app: Hono;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bugpin-widget-script-'));
  app = new Hono();
  app.get(
    '/widget.js',
    createWidgetScriptHandler(() => tempDir)
  );
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeWidget(content: string): void {
  writeFileSync(join(tempDir, 'widget.js'), content);
}

describe('GET /widget.js', () => {
  it('serves the bundle for cross-origin embedding and asks browsers to revalidate it', async () => {
    writeWidget('console.log("widget v1");');

    const response = await app.request('/widget.js');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log("widget v1");');
    expect(response.headers.get('Content-Type')).toBe('application/javascript');
    expect(response.headers.get('Cache-Control')).toBe('public, no-cache');
    expect(response.headers.get('ETag')).toMatch(/^W\/"\d+-\d+"$/);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });

  it('answers a matching If-None-Match with an empty 304 that keeps the caching headers', async () => {
    writeWidget('console.log("widget v1");');
    const entityTag = (await app.request('/widget.js')).headers.get('ETag') as string;

    for (const ifNoneMatch of [entityTag, `"other", ${entityTag}`, '*']) {
      const response = await app.request('/widget.js', {
        headers: { 'If-None-Match': ifNoneMatch },
      });

      expect(response.status).toBe(304);
      expect(await response.text()).toBe('');
      expect(response.headers.get('ETag')).toBe(entityTag);
      expect(response.headers.get('Cache-Control')).toBe('public, no-cache');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
  });

  it('sends the new bundle once the file changed, even to a browser holding the old one', async () => {
    writeWidget('console.log("widget v1");');
    const oldEntityTag = (await app.request('/widget.js')).headers.get('ETag') as string;

    writeWidget('console.log("widget v2, upgraded");');
    const sameSizeLater = new Date(Date.now() + 5000);
    utimesSync(join(tempDir, 'widget.js'), sameSizeLater, sameSizeLater);

    const response = await app.request('/widget.js', {
      headers: { 'If-None-Match': oldEntityTag },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('console.log("widget v2, upgraded");');
    expect(response.headers.get('ETag')).not.toBe(oldEntityTag);
  });

  it('ignores an If-None-Match that does not match', async () => {
    writeWidget('console.log("widget v1");');

    const response = await app.request('/widget.js', {
      headers: { 'If-None-Match': 'W/"1-1"' },
    });

    expect(response.status).toBe(200);
  });

  it('returns 404 when the bundle has not been built', async () => {
    const response = await app.request('/widget.js');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: 'NOT_FOUND',
      message: 'Widget not found',
    });
  });
});
