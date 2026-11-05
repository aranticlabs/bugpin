import { Hono, type Context } from 'hono';
import { authMiddleware } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { rateLimiter, userKeyGenerator } from '../../middleware/rate-limit.js';
import { passkeyService } from '../../services/passkey.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { resolveRelyingParty } from '../../utils/relying-party.js';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

const passkeys = new Hono();

passkeys.use('*', authMiddleware);

function originRejected(c: Context) {
  return c.json(
    {
      success: false,
      error: 'PASSKEY_ORIGIN_MISMATCH',
      message: 'Passkeys only work on the address BugPin is configured for',
    },
    400
  );
}

passkeys.post(
  '/register/options',
  rateLimiter({ max: 10, window: 60, keyGenerator: userKeyGenerator }),
  async (c) => {
    const rp = resolveRelyingParty(c, await settingsCacheService.getAll());
    if (!rp) return originRejected(c);
    const options = await passkeyService.registrationOptions(c.get('user'), rp);
    return c.json({ success: true, options });
  }
);

passkeys.post(
  '/register',
  rateLimiter({ max: 10, window: 60, keyGenerator: userKeyGenerator }),
  validate({ body: schemas.passkeyRegistration }),
  async (c) => {
    const rp = resolveRelyingParty(c, await settingsCacheService.getAll());
    if (!rp) return originRejected(c);
    const body = (await c.req.json()) as { response: RegistrationResponseJSON; name?: string };
    const result = await passkeyService.register(c.get('user'), rp, body.response, body.name ?? '');
    if (!result.success) {
      return c.json({ success: false, error: result.code, message: result.error }, 400);
    }
    return c.json({ success: true, recoveryCodes: result.value.recoveryCodes });
  }
);

passkeys.patch('/:id', validate({ body: schemas.passkeyRename }), async (c) => {
  const { name } = await c.req.json();
  const result = await passkeyService.rename(c.get('user').id, c.req.param('id'), name);
  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 404);
  }
  return c.json({ success: true });
});

passkeys.delete(
  '/:id',
  rateLimiter({ max: 5, window: 60, keyGenerator: userKeyGenerator }),
  validate({ body: schemas.passwordConfirmation }),
  async (c) => {
    const { password } = await c.req.json();
    const result = await passkeyService.remove(c.get('user'), c.req.param('id'), password);
    if (!result.success) {
      const status = result.code === 'NOT_FOUND' ? 404 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }
    return c.json({ success: true });
  }
);

export { passkeys as passkeyRoutes };
