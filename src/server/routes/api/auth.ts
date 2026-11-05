import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { authService } from '../../services/auth.service.js';
import { authMiddleware, optionalAuth } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { settingsRepo } from '../../database/repositories/settings.repo.js';
import { config } from '../../config.js';
import { getClientIp } from '../../utils/client-ip.js';
import { passwordPolicyService } from '../../services/password-policy.service.js';

const auth = new Hono();

// Login

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

    // Get session max age from settings
    const settings = await settingsRepo.getAll();
    const sessionMaxAgeSeconds = settings.sessionMaxAgeDays * 24 * 60 * 60;

    // Set session cookie
    setCookie(c, 'session', result.value.session.id, {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'Lax',
      path: '/',
      maxAge: sessionMaxAgeSeconds,
    });

    return c.json({
      success: true,
      user: result.value.user,
    });
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
