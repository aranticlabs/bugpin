import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { reporterAuthService } from '../../services/reporter-auth.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { reporterAuthMiddleware, REPORTER_SESSION_COOKIE } from '../../middleware/reporter-auth.js';
import { portalOrigin } from '../../middleware/origin-check.js';
import { validate, validatedBody } from '../../middleware/validate.js';
import { getClientIp, rateLimitAddress } from '../../utils/client-ip.js';
import { hashToken } from '../../utils/secure-token.js';
import { SUPPORTED_LOCALES } from '@shared/types';
import { Result } from '../../utils/result.js';

const requestSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email(),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
  })
  .strict();
const tokenSchema = z.object({ token: z.string().min(1).max(128) }).strict();

function loginIpLimit(kind: 'request' | 'preview' | 'exchange') {
  return rateLimiter({
    name: `portal-login-${kind}-ip`,
    window: 900,
    max: async () => {
      const { reporterPortalLimits: limits } = await settingsCacheService.getAll();
      return kind === 'request'
        ? limits.loginRequestsPerIpPer15Min
        : limits.loginExchangesPerIpPer15Min;
    },
    keyGenerator: (c) => rateLimitAddress(getClientIp(c) ?? 'unknown'),
    onLimit: (c) =>
      kind === 'request'
        ? c.json({ success: true })
        : c.json({ success: false, error: 'RATE_LIMITED', message: 'Too many requests' }, 429),
  });
}

function loginEmailLimit(resend: boolean) {
  return rateLimiter({
    name: 'portal-login-email',
    window: 900,
    max: async () =>
      (await settingsCacheService.getAll()).reporterPortalLimits.loginRequestsPerEmailPer15Min,
    keyGenerator: (c) =>
      hashToken(
        resend
          ? (Result.unwrap(reporterAuthService.resendTarget(validatedBody(c, tokenSchema).token)) ??
              'invalid')
          : validatedBody(c, requestSchema).email
      ),
    onLimit: (c) => c.json({ success: true }),
  });
}

export const portalAuthRoutes = new Hono();

portalAuthRoutes.post(
  '/request',
  loginIpLimit('request'),
  validate({ body: requestSchema }),
  loginEmailLimit(false),
  async (c) => {
    const { email, locale } = validatedBody(c, requestSchema);
    await reporterAuthService.requestLogin(email, locale);
    return c.json({ success: true });
  }
);

portalAuthRoutes.post('/preview', loginIpLimit('preview'), validate({ body: tokenSchema }), (c) => {
  const result = reporterAuthService.preview(validatedBody(c, tokenSchema).token);
  return c.json({ success: true, ...Result.unwrap(result) });
});

portalAuthRoutes.post(
  '/resend',
  loginIpLimit('request'),
  validate({ body: tokenSchema }),
  loginEmailLimit(true),
  async (c) => {
    await reporterAuthService.resend(validatedBody(c, tokenSchema).token);
    return c.json({ success: true });
  }
);

portalAuthRoutes.post(
  '/exchange',
  loginIpLimit('exchange'),
  validate({ body: tokenSchema }),
  async (c) => {
    const result = reporterAuthService.exchange(
      validatedBody(c, tokenSchema).token,
      getCookie(c, REPORTER_SESSION_COOKIE)
    );
    if (!result.success)
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    const { sessionSecret, expiresAt, ...response } = result.value;
    setCookie(c, REPORTER_SESSION_COOKIE, sessionSecret, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: (await portalOrigin(c))?.startsWith('https:') ?? false,
      path: '/',
      expires: new Date(expiresAt),
    });
    return c.json({ success: true, ...response });
  }
);

portalAuthRoutes.post('/logout', reporterAuthMiddleware, async (c) => {
  reporterAuthService.logout(c.get('reporterSessionId'));
  deleteCookie(c, REPORTER_SESSION_COOKIE, {
    path: '/',
    secure: (await portalOrigin(c))?.startsWith('https:') ?? false,
  });
  return c.json({ success: true });
});
