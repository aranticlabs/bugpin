import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { invitationsService } from '../../services/invitations.service.js';
import { validate, schemas } from '../../middleware/validate.js';
import { settingsRepo } from '../../database/repositories/settings.repo.js';
import { config } from '../../config.js';

const invitations = new Hono();

// Validate Invitation Token (Public)

invitations.get('/validate/:token', validate({ params: schemas.token }), async (c) => {
  const token = c.req.param('token');

  const result = await invitationsService.validateToken(token);

  if (!result.success) {
    const status =
      result.code === 'INVALID_TOKEN' || result.code === 'ALREADY_ACCEPTED'
        ? 404
        : result.code === 'TOKEN_EXPIRED'
          ? 410
          : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    invitation: result.value,
  });
});

// Accept Invitation (Public)

invitations.post('/accept', validate({ body: schemas.acceptInvitation }), async (c) => {
  const body = await c.req.json();

  const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
  const userAgent = c.req.header('user-agent');

  const result = await invitationsService.acceptInvitation(body, ipAddress, userAgent);

  if (!result.success) {
    const status =
      result.code === 'INVALID_TOKEN' || result.code === 'ALREADY_ACCEPTED'
        ? 404
        : result.code === 'TOKEN_EXPIRED'
          ? 410
          : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  const { user, session } = result.value;

  // Get session max age from settings
  const settings = await settingsRepo.getAll();
  const sessionMaxAgeSeconds = settings.sessionMaxAgeDays * 24 * 60 * 60;

  // Set session cookie (same as login)
  setCookie(c, 'session', session.id, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds,
  });

  return c.json({
    success: true,
    user,
    message: 'Invitation accepted successfully',
  });
});

export { invitations as invitationsRoutes };
