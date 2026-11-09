import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, validatedBody } from '../../middleware/validate.js';
import { reporterOwnershipService } from '../../services/reporter-ownership.service.js';
import { reportMessagesService } from '../../services/report-messages.service.js';
import { errorStatus } from '../../utils/http-status.js';

const ownerSchema = z.union([
  z.object({ reporterId: z.string().min(1).max(64) }).strict(),
  z
    .object({
      claimableEmail: z.string().trim().toLowerCase().max(254).email(),
      invitation: z
        .object({ message: z.string().trim().min(1).max(5000) })
        .strict()
        .optional(),
    })
    .strict(),
]);

export const reportOwnerRoutes = new Hono();
reportOwnerRoutes.use('*', authMiddleware);

reportOwnerRoutes.put(
  '/:id/owner',
  authorize(['admin', 'editor']),
  validate({ body: ownerSchema }),
  async (c) => {
    const body = validatedBody(c, ownerSchema);
    const result =
      'invitation' in body && body.invitation
        ? await reportMessagesService.sendInvitation(
            c.req.param('id'),
            c.get('user').id,
            body.claimableEmail,
            body.invitation.message
          )
        : reporterOwnershipService.set(c.req.param('id'), body, c.get('user').id);
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        result.code === 'MESSAGING_DISABLED'
          ? 403
          : result.code === 'UNAUTHORIZED'
            ? 401
            : errorStatus(result.code)
      );
    return c.json({ success: true, owner: result.value });
  }
);

reportOwnerRoutes.delete('/:id/owner', authorize(['admin', 'editor']), (c) => {
  const result = reporterOwnershipService.remove(c.req.param('id'), c.get('user').id);
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true });
});
