import { Hono } from 'hono';
import { userPreferencesService } from '../../services/user-preferences.service.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import type { User } from '@shared/types';

const userPreferences = new Hono();

userPreferences.use('*', authMiddleware);

userPreferences.get('/me', async (c) => {
  const user = c.get('user') as User;
  const result = await userPreferencesService.get(user.id);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, preferences: result.value });
});

userPreferences.patch('/me', validate({ body: schemas.updateUserPreferences }), async (c) => {
  const user = c.get('user') as User;
  const body = schemas.updateUserPreferences.parse(c.get('validatedBody' as never));
  const result = await userPreferencesService.update(user.id, body);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }
  return c.json({ success: true, preferences: result.value });
});

export { userPreferences as userPreferencesRoutes };
