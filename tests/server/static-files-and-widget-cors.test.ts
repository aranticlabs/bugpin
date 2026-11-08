import { describe, it, expect } from 'bun:test';
import { Hono } from '../../src/server/node_modules/hono';
import { serveAdmin, serveBranding } from '../../src/server/routes/static';
import { widgetCors } from '../../src/server/middleware/cors';

// `new Request()` normalizes dot segments, so these requests carry a raw URL the way a
// non-normalizing HTTP client can deliver it to the server.
function rawRequest(path: string): Request {
  const fields = {
    url: `http://localhost${path}`,
    method: 'GET',
    headers: new Headers(),
  };
  return fields as unknown as Request;
}

function createStaticApp() {
  const app = new Hono();
  app.get('/branding/*', serveBranding);
  app.get('/admin/branding/*', serveBranding);
  app.all('/admin', serveAdmin);
  app.all('/admin/*', serveAdmin);
  return app;
}

describe('static file handlers', () => {
  const app = createStaticApp();

  it.each([
    '/branding/../../../../package.json',
    '/branding/%2e%2e/%2e%2e/%2e%2e/%2e%2e/package.json',
    '/admin/branding/../../../../package.json',
    '/admin/../../package.json',
    '/admin/%2e%2e/%2e%2e/package.json',
  ])('does not serve files outside the asset directories for %s', async (path) => {
    const response = await app.fetch(rawRequest(path));
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).not.toContain('"workspaces"');
  });

  it('still serves default branding assets', async () => {
    const response = await app.fetch(rawRequest('/branding/light/icon-light.svg'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
  });
});

describe('widget CORS policy', () => {
  const app = new Hono();
  app.use('/api/widget/*', widgetCors);
  app.post('/api/widget/submit', (c) => c.json({ success: true }));

  it('allows anonymous cross-origin widget preflights', async () => {
    const response = await app.request('/api/widget/submit', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://customer.example',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-api-key',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('never allows credentials on widget responses', async () => {
    const response = await app.request('/api/widget/submit', {
      method: 'POST',
      headers: { Origin: 'https://customer.example', Cookie: 'session=sess_any' },
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});
