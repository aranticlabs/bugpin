import { Hono } from 'hono';
import { gamificationService } from '../../services/gamification.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, validatedBody, schemas } from '../../middleware/validate.js';
import { errorStatus } from '../../utils/http-status.js';
import type { User } from '@shared/types';

const gamification = new Hono();

gamification.use('*', authMiddleware);

gamification.get('/', authorize(['admin']), async (c) => {
  const result = await gamificationService.getSettings();
  if (!result.success) {
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  }
  return c.json({ success: true, gamification: result.value });
});

gamification.put(
  '/',
  authorize(['admin']),
  validate({ body: schemas.updateGamification }),
  async (c) => {
    const result = await gamificationService.update(validatedBody(c, schemas.updateGamification));
    if (!result.success) {
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    }
    return c.json({ success: true, gamification: result.value });
  }
);

gamification.get('/me', async (c) => {
  const result = await gamificationService.getSelf(c.get('user') as User);
  if (!result.success) {
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  }
  return c.json({ success: true, gamification: result.value });
});

gamification.patch('/me', validate({ body: schemas.gamificationOptOut }), async (c) => {
  const { optedOut } = validatedBody(c, schemas.gamificationOptOut);
  const result = await gamificationService.setOptOut(c.get('user') as User, optedOut);
  if (!result.success) {
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  }
  return c.json({ success: true, gamification: result.value });
});

export { gamification as gamificationRoutes };
