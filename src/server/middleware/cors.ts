import { cors } from 'hono/cors';

/**
 * CORS for the public widget API. The widget authenticates with the project key and
 * per-project origin allowlists are enforced in the widget routes, so any origin may call
 * it, but never with credentials. Routes without this middleware stay same-origin, so the
 * session cookie never authorizes a cross-origin read or write.
 */
export const widgetCors = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // 24 hours
});
