import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, validatedQuery } from '../../middleware/validate.js';
import { reportersService } from '../../services/reporters.service.js';
import { errorStatus } from '../../utils/http-status.js';

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const lookupSchema = z.object({ email: z.string().trim().toLowerCase().max(254).email() });
const deleteSchema = z.object({ eraseContactDetails: z.boolean().default(false) }).strict();

export const reportersRoutes = new Hono();
reportersRoutes.use('*', authMiddleware);

reportersRoutes.get('/', authorize(['admin']), validate({ query: listSchema }), (c) => {
  const result = reportersService.list(validatedQuery(c, listSchema));
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, ...result.value });
});

reportersRoutes.get(
  '/lookup',
  authorize(['admin', 'editor']),
  validate({ query: lookupSchema }),
  (c) => {
    const result = reportersService.lookup(validatedQuery(c, lookupSchema).email);
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return c.json({ success: true, reporter: result.value });
  }
);

reportersRoutes.post('/:id/suspend', authorize(['admin']), (c) => {
  const result = reportersService.suspend(c.req.param('id'), c.get('user').id);
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, reporter: result.value });
});

reportersRoutes.post('/:id/unsuspend', authorize(['admin']), (c) => {
  const result = reportersService.unsuspend(c.req.param('id'));
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, reporter: result.value });
});

reportersRoutes.post('/:id/revoke-sessions', authorize(['admin']), (c) => {
  const result = reportersService.revokeSessions(c.req.param('id'), c.get('user').id);
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true, reporter: result.value });
});

reportersRoutes.delete('/:id', authorize(['admin']), async (c) => {
  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return c.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Invalid request body' },
      400
    );
  }
  const input = deleteSchema.safeParse(body);
  if (!input.success)
    return c.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Invalid request body' },
      400
    );
  const result = reportersService.delete(
    c.req.param('id'),
    c.get('user').id,
    input.data.eraseContactDetails
  );
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  return c.json({ success: true });
});
