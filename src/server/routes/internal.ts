import { Hono } from 'hono';
import { config } from '../config.js';
import { decideHostRouting } from '../middleware/host-routing.js';
import { decideHttpsEnforcement } from '../middleware/https-enforcement.js';
import { proxyTokenService } from '../services/proxy-token.service.js';
import { settingsCacheService } from '../services/settings-cache.service.js';
import { getEffectiveOrigin, getSocketAddress } from '../utils/client-ip.js';
import { Result } from '../utils/result.js';

export const internalRoutes = new Hono();

internalRoutes.get('/proxy-check', (c) => {
  if (config.trustProxy !== 'token')
    return c.json(
      {
        success: false,
        error: 'PROXY_TOKEN_DISABLED',
        message: 'Server is not running with TRUST_PROXY=token',
      },
      409
    );
  const valid = Result.unwrapOr(
    proxyTokenService.verify(c.req.header('X-BugPin-Proxy-Token')),
    false
  );
  return c.body(null, valid ? 204 : 403);
});

internalRoutes.get('/frontend-gate', async (c) => {
  if (config.trustProxy !== 'token') return c.notFound();
  const frontend = c.req.header('X-BugPin-Gated-Frontend');
  const uri = c.req.header('X-BugPin-Original-URI');
  if (
    (frontend !== 'admin' && frontend !== 'portal') ||
    !uri ||
    !uri.startsWith('/') ||
    uri.startsWith('//') ||
    /[\\#\s]/.test(uri)
  ) {
    c.header('X-BugPin-Gate-Status', '404');
    return c.body(null, 403);
  }
  const origin = getEffectiveOrigin(c);
  const settings = await settingsCacheService.getAll();
  const peer = getSocketAddress(c);
  const path = frontend === 'admin' ? '/admin/' : '/reporter-portal/';
  const host = decideHostRouting(origin, path, settings, peer);
  if (host.status !== 204) {
    c.header('X-BugPin-Gate-Status', String(host.status));
    return c.body(null, 403);
  }
  const https = decideHttpsEnforcement(origin, uri, settings, config.disableHttpsEnforcement, peer);
  if (https.status !== 204) {
    c.header('X-BugPin-Gate-Status', String(https.status === 400 ? 421 : https.status));
    if (https.status === 301) c.header('X-BugPin-Gate-Location', https.location);
    return c.body(null, 403);
  }
  if (https.hsts) c.header('X-BugPin-Gate-HSTS', https.hsts);
  return c.body(null, 204);
});
