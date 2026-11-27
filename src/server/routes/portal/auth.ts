import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { reporterAuthService } from '../../services/reporter-auth.service.js';
import {
  portalOperatorAuthService,
  type PortalOperatorSessionGrant,
} from '../../services/portal-operator-auth.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { rateLimiter, staffLoginLimit, staffTwoFactorLimit } from '../../middleware/rate-limit.js';
import {
  portalCookieOptions,
  portalOperatorCookieName,
  portalReaderAuthMiddleware,
  reporterCookieName,
} from '../../middleware/reporter-auth.js';
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
const resendSchema = tokenSchema.extend({ locale: z.enum(SUPPORTED_LOCALES).optional() });
const teamLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email(),
    password: z.string().min(1).max(1024),
  })
  .strict();
const teamTwoFactorSchema = z
  .object({
    challengeToken: z.string().min(1).max(200),
    code: z.string().min(6).max(10).optional(),
    recoveryCode: z.string().min(10).max(20).optional(),
  })
  .strict()
  .refine((data) => (data.code === undefined) !== (data.recoveryCode === undefined), {
    message: 'Provide either code or recoveryCode',
  });

const TEAM_FAILURE_STATUS: Record<string, 401 | 403 | 429 | 503> = {
  INVALID_CREDENTIALS: 401,
  INVALID_CODE: 401,
  CHALLENGE_EXPIRED: 401,
  PASSWORD_CHANGE_REQUIRED: 403,
  TWO_FACTOR_SETUP_REQUIRED: 403,
  TOO_MANY_ATTEMPTS: 429,
  EMAIL_DELIVERY_FAILED: 503,
};

function loginIpLimit(kind: 'request' | 'preview' | 'exchange') {
  return rateLimiter({
    name: `portal-login-${kind}-ip`,
    exposeHeaders: kind !== 'request',
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
    exposeHeaders: false,
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
  validate({ body: resendSchema }),
  loginEmailLimit(true),
  async (c) => {
    const { token, locale } = validatedBody(c, resendSchema);
    await reporterAuthService.resend(token, locale);
    return c.json({ success: true });
  }
);

portalAuthRoutes.post(
  '/exchange',
  loginIpLimit('exchange'),
  validate({ body: tokenSchema }),
  async (c) => {
    const cookieName = await reporterCookieName(c);
    const result = reporterAuthService.exchange(
      validatedBody(c, tokenSchema).token,
      getCookie(c, cookieName)
    );
    if (!result.success)
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    const { sessionSecret, expiresAt, ...response } = result.value;
    await endOperatorSession(c);
    setCookie(c, cookieName, sessionSecret, await portalCookieOptions(c, expiresAt));
    return c.json({ success: true, ...response });
  }
);

async function endReporterSession(c: Context): Promise<void> {
  const name = await reporterCookieName(c);
  const secret = getCookie(c, name);
  if (!secret) return;
  const session = reporterAuthService.validateSession(secret, false);
  if (session.success) reporterAuthService.logout(session.value.sessionId);
  deleteCookie(c, name, await portalCookieOptions(c));
}

async function endOperatorSession(c: Context): Promise<void> {
  const name = await portalOperatorCookieName(c);
  const secret = getCookie(c, name);
  if (!secret) return;
  portalOperatorAuthService.logoutBySecret(secret);
  deleteCookie(c, name, await portalCookieOptions(c));
}

portalAuthRoutes.post('/logout', portalReaderAuthMiddleware, async (c) => {
  await endReporterSession(c);
  await endOperatorSession(c);
  return c.json({ success: true });
});

// Team sign-in: staff accounts open a read-only view. It never issues the staff session cookie.

const teamRoutes = new Hono();

teamRoutes.use('*', async (c, next) => {
  if ((await portalOperatorAuthService.signInUrl()) === null)
    return c.json({ success: false, error: 'NOT_FOUND', message: 'Not found' }, 404);
  return next();
});

async function startOperatorSession(c: Context, session: PortalOperatorSessionGrant) {
  await endReporterSession(c);
  setCookie(
    c,
    await portalOperatorCookieName(c),
    session.secret,
    await portalCookieOptions(c, session.expiresAt)
  );
}

function teamFailure(c: Context, result: { code?: string; error: string }) {
  const code = result.code ?? 'REQUEST_FAILED';
  return c.json(
    { success: false, error: code, message: result.error },
    TEAM_FAILURE_STATUS[code] ?? 400
  );
}

teamRoutes.post('/login', staffLoginLimit(), validate({ body: teamLoginSchema }), async (c) => {
  const { email, password } = validatedBody(c, teamLoginSchema);
  const result = await portalOperatorAuthService.login(email, password, {
    ipAddress: getClientIp(c),
    userAgent: c.req.header('user-agent'),
  });
  if (!result.success) return teamFailure(c, result);
  if (result.value.session) await startOperatorSession(c, result.value.session);
  return c.json({ success: true, ...result.value.result });
});

teamRoutes.post(
  '/two-factor',
  staffTwoFactorLimit(),
  validate({ body: teamTwoFactorSchema }),
  async (c) => {
    const body = validatedBody(c, teamTwoFactorSchema);
    const result = await portalOperatorAuthService.completeTwoFactor(
      body.challengeToken,
      body.recoveryCode ? { recoveryCode: body.recoveryCode } : { code: body.code! }
    );
    if (!result.success) return teamFailure(c, result);
    if (result.value.session) await startOperatorSession(c, result.value.session);
    return c.json({ success: true, ...result.value.result });
  }
);

teamRoutes.post(
  '/verify/preview',
  loginIpLimit('preview'),
  validate({ body: tokenSchema }),
  async (c) => {
    const result = await portalOperatorAuthService.preview(validatedBody(c, tokenSchema).token);
    return c.json({ success: true, ...Result.unwrap(result) });
  }
);

teamRoutes.post(
  '/verify/exchange',
  loginIpLimit('exchange'),
  validate({ body: tokenSchema }),
  async (c) => {
    const result = await portalOperatorAuthService.exchange(validatedBody(c, tokenSchema).token);
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        result.code === 'INVALID_TOKEN' ? 400 : 403
      );
    await startOperatorSession(c, result.value.session);
    return c.json({ success: true, operator: result.value.operator });
  }
);

portalAuthRoutes.route('/team', teamRoutes);
