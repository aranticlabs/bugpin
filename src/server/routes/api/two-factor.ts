import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { rateLimiter, userKeyGenerator } from '../../middleware/rate-limit.js';
import { twoFactorService } from '../../services/two-factor.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';

const twoFactor = new Hono();

twoFactor.use('*', authMiddleware);

// Status of the signed-in user's second factors

twoFactor.get('/', async (c) => {
  const status = await twoFactorService.getStatus(c.get('user'));
  return c.json({ success: true, status });
});

// Authenticator app setup

twoFactor.post(
  '/totp/setup',
  rateLimiter({ name: 'totp-setup', max: 5, window: 60, keyGenerator: userKeyGenerator }),
  validate({ body: schemas.passwordConfirmation }),
  async (c) => {
    const { password } = await c.req.json();
    const settings = await settingsCacheService.getAll();
    const result = await twoFactorService.startTotpSetup(
      c.get('user'),
      settings.appName || 'BugPin',
      password
    );
    if (!result.success) {
      const status = result.code === 'INVALID_PASSWORD' ? 400 : 409;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }
    return c.json({ success: true, ...result.value });
  }
);

twoFactor.post(
  '/totp/confirm',
  rateLimiter({ name: 'totp-confirm', max: 10, window: 60, keyGenerator: userKeyGenerator }),
  validate({ body: schemas.twoFactorCode }),
  async (c) => {
    const { code } = await c.req.json();
    const result = await twoFactorService.confirmTotpSetup(c.get('user').id, code);
    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }
    return c.json({ success: true, recoveryCodes: result.value.recoveryCodes });
  }
);

twoFactor.post(
  '/totp/disable',
  rateLimiter({ name: 'totp-disable', max: 5, window: 60, keyGenerator: userKeyGenerator }),
  validate({ body: schemas.passwordConfirmation }),
  async (c) => {
    const { password } = await c.req.json();
    const result = await twoFactorService.disableTotp(c.get('user'), password);
    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }
    return c.json({ success: true });
  }
);

// Recovery codes

twoFactor.post(
  '/recovery-codes',
  rateLimiter({ name: 'recovery-codes', max: 5, window: 60, keyGenerator: userKeyGenerator }),
  validate({ body: schemas.passwordConfirmation }),
  async (c) => {
    const { password } = await c.req.json();
    const result = await twoFactorService.regenerateRecoveryCodes(c.get('user'), password);
    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }
    return c.json({ success: true, recoveryCodes: result.value });
  }
);

export { twoFactor as twoFactorRoutes };
