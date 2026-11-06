import { Hono } from 'hono';
import { gamificationService } from '../../services/gamification.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import type { User } from '@shared/types';

const gamification = new Hono();

gamification.use('*', authMiddleware);

gamification.get('/', authorize(['admin']), async (c) => {
  const result = await gamificationService.getSettings();
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, gamification: result.value });
});

gamification.put(
  '/',
  authorize(['admin']),
  validate({ body: schemas.updateGamification }),
  async (c) => {
    const body = schemas.updateGamification.parse(c.get('validatedBody' as never));
    const result = await gamificationService.update(body);
    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }
    return c.json({ success: true, gamification: result.value });
  }
);

gamification.get('/me', async (c) => {
  const result = await gamificationService.getSelf(c.get('user') as User);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, gamification: result.value });
});

gamification.patch('/me', validate({ body: schemas.gamificationOptOut }), async (c) => {
  const { optedOut } = schemas.gamificationOptOut.parse(c.get('validatedBody' as never));
  const result = await gamificationService.setOptOut(c.get('user') as User, optedOut);
  if (!result.success) {
    const status = result.code === 'FORBIDDEN' ? 403 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }
  return c.json({ success: true, gamification: result.value });
});

export { gamification as gamificationRoutes };
