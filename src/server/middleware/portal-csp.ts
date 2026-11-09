import type { MiddlewareHandler } from 'hono';

const policy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

export const portalCsp: MiddlewareHandler = async (c, next) => {
  await next();
  if (c.res.headers.get('Content-Type')?.startsWith('text/html')) {
    c.header('Content-Security-Policy', policy);
    c.header('Cache-Control', 'no-store');
  }
};
