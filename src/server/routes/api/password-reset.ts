import { Hono } from 'hono';
import { passwordResetService } from '../../services/password-reset.service.js';
import { validate, schemas } from '../../middleware/validate.js';
import { rateLimiter } from '../../middleware/rate-limit.js';

const passwordReset = new Hono();

passwordReset.get(
  '/validate/:token',
  rateLimiter({ name: 'password-reset-validate', max: 20, window: 60 }),
  validate({ params: schemas.token }),
  async (c) => {
    const result = await passwordResetService.validateToken(c.req.param('token'));
    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 404);
    }
    return c.json({ success: true, user: result.value });
  }
);

passwordReset.post(
  '/',
  rateLimiter({ name: 'password-reset', max: 5, window: 60 }),
  validate({ body: schemas.completePasswordReset }),
  async (c) => {
    const { token, password } = await c.req.json<{ token: string; password: string }>();
    const result = await passwordResetService.completeReset(token, password);
    if (!result.success) {
      const status = result.code === 'INVALID_TOKEN' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }
    return c.json({ success: true, message: 'Password updated' });
  }
);

export { passwordReset as passwordResetRoutes };
