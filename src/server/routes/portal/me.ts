import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { reporterAuthMiddleware } from '../../middleware/reporter-auth.js';
import { validate, validatedBody } from '../../middleware/validate.js';
import { portalProfileService } from '../../services/portal-profile.service.js';
import { portalProfileSchema } from '../../utils/portal-schemas.js';
import { errorStatus } from '../../utils/http-status.js';

export const portalMeRoutes = new Hono();
portalMeRoutes.patch(
  '/me',
  reporterAuthMiddleware,
  bodyLimit({
    maxSize: 4096,
    onError: (c) =>
      c.json(
        { success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
        413
      ),
  }),
  validate({ body: portalProfileSchema }),
  (c) => {
    const result = portalProfileService.update(
      c.get('reporter').id,
      validatedBody(c, portalProfileSchema)
    );
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return c.json({ success: true, reporter: result.value });
  }
);
