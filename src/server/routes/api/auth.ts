import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { authService, type LoginResult } from '../../services/auth.service.js';
import { authMiddleware, optionalAuth } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { settingsRepo } from '../../database/repositories/settings.repo.js';
import { config } from '../../config.js';
import { getClientIp } from '../../utils/client-ip.js';
import { passwordPolicyService } from '../../services/password-policy.service.js';

const auth = new Hono();

// Login

async function startSession(c: Context, result: LoginResult) {
  // Get session max age from settings
  const settings = await settingsRepo.getAll();
  const sessionMaxAgeSeconds = settings.sessionMaxAgeDays * 24 * 60 * 60;

  // Set session cookie
  setCookie(c, 'session', result.session.id, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds,
  });

  return c.json({ success: true, user: result.user });
}

auth.post(
  '/login',
  rateLimiter({ max: 5, window: 60 }), // 5 attempts per minute
  validate({ body: schemas.login }),
  async (c) => {
    const { email, password } = await c.req.json();

    // Get IP and user agent for session
    const ipAddress = getClientIp(c);
    const userAgent = c.req.header('user-agent');

    const result = await authService.login(email, password, ipAddress, userAgent);

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 401);
    }

    if ('twoFactorRequired' in result.value) {
      const { challengeToken, methods } = result.value;
      return c.json({ success: true, twoFactorRequired: true, challengeToken, methods });
    }

    return startSession(c, result.value);
  }
);

// Second login step (authenticator code or recovery code)

auth.post(
  '/login/two-factor',
  rateLimiter({ max: 10, window: 60 }),
  validate({ body: schemas.twoFactorLogin }),
  async (c) => {
    const body = await c.req.json();
    const input = body.recoveryCode ? { recoveryCode: body.recoveryCode } : { code: body.code };
    const result = await authService.completeTwoFactorLogin(body.challengeToken, input);
    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 401);
    }
    return startSession(c, result.value);
  }
);

// Password policy (public, so the invitation page can show the rules before sign-in)

auth.get('/password-policy', async (c) => {
  return c.json({ success: true, policy: await passwordPolicyService.getPolicy() });
});

// Logout

auth.post('/logout', authMiddleware, async (c) => {
  const session = c.get('session');

  await authService.logout(session.id);

  // Clear session cookie
  deleteCookie(c, 'session', {
    path: '/',
  });

  return c.json({ success: true, message: 'Logged out successfully' });
});

// Get Current User

auth.get('/me', optionalAuth, async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: true, authenticated: false });
  }
  return c.json({ success: true, authenticated: true, user });
});

// Change Password

auth.post(
  '/change-password',
  authMiddleware,
  validate({ body: schemas.changePassword }),
  async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const { currentPassword, newPassword } = await c.req.json();

    const result = await authService.changePassword(
      user.id,
      currentPassword,
      newPassword,
      session.id
    );

    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }

    return c.json({
      success: true,
      message: 'Password changed successfully.',
    });
  }
);

export { auth as authRoutes };
