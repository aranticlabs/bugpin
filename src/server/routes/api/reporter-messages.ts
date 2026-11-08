import { Hono } from 'hono';
import { reportMessagesService } from '../../services/report-messages.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';

const reporterMessages = new Hono();

// All routes require authentication
reporterMessages.use('*', authMiddleware);

// Send a message to the reporter (Admin and Editor)

reporterMessages.post(
  '/:id/reporter-messages',
  authorize(['admin', 'editor']),
  validate({ params: schemas.id, body: schemas.reporterMessage }),
  async (c) => {
    const reportId = c.req.param('id');
    const user = c.get('user');
    const { message, ccSender } = await c.req.json();

    const result = await reportMessagesService.send(reportId, user.id, message, ccSender);

    if (!result.success) {
      const status =
        result.code === 'NOT_FOUND' ? 404 : result.code === 'NO_REPORTER_EMAIL' ? 400 : 400;
      return c.json({ success: false, error: result.code, message: result.error }, status);
    }

    return c.json({
      success: true,
      reporterMessage: result.value,
    });
  }
);

// List messages for a report (Authenticated)

reporterMessages.get('/:id/reporter-messages', validate({ params: schemas.id }), async (c) => {
  const reportId = c.req.param('id');

  const result = await reportMessagesService.listByReport(reportId);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ success: false, error: result.code, message: result.error }, status);
  }

  return c.json({
    success: true,
    messages: result.value,
  });
});

export { reporterMessages as reporterMessagesRoutes };
