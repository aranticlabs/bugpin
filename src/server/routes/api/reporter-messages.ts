import { Hono } from 'hono';
import type { File as UploadFile } from 'node:buffer';
import { bodyLimit } from 'hono/body-limit';
import { reportMessagesService } from '../../services/report-messages.service.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { MAX_MESSAGE_FILES } from '../../utils/request-limits.js';

const reporterMessages = new Hono();
reporterMessages.use('*', authMiddleware);

function errorStatus(code: string | undefined) {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
    case 'PROJECT_NOT_LICENSED':
    case 'MESSAGING_DISABLED':
      return 403;
    case 'CONFIRMATION_REQUIRED':
    case 'REPORT_CLOSED':
      return 409;
    case 'UPLOAD_QUOTA_EXCEEDED':
    case 'VIDEO_QUOTA_EXCEEDED':
    case 'PAYLOAD_TOO_LARGE':
      return 413;
    case 'MESSAGE_WRITE_FAILED':
      return 500;
    default:
      return 400;
  }
}

reporterMessages.post(
  '/:id/reporter-messages',
  authorize(['admin', 'editor']),
  validate({ params: schemas.id }),
  async (c, next) => {
    const result = await reportMessagesService.uploadBodyLimit(c.req.param('id'));
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return bodyLimit({
      maxSize: c.req.header('content-type')?.includes('multipart/form-data')
        ? result.value
        : 32 * 1024,
      onError: (context) =>
        context.json(
          { success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Message upload is too large' },
          413
        ),
    })(c, next);
  },
  async (c) => {
    let body: unknown;
    let uploads: UploadFile[] = [];
    try {
      if (c.req.header('content-type')?.includes('multipart/form-data')) {
        const form = await c.req.raw.formData();
        const values = [...form.getAll('files[]'), ...form.getAll('files')];
        if (values.some((value) => !(value instanceof File)) || values.length > MAX_MESSAGE_FILES) {
          return c.json(
            {
              success: false,
              error: 'INVALID_FILE',
              message: 'Attach at most 5 image or video files',
            },
            400
          );
        }
        uploads = values.filter((value) => typeof value !== 'string');
        const cc = form.get('ccSender');
        const confirm = form.get('confirmPortalAccess');
        body = {
          message: form.get('message') ?? '',
          confirmPortalAccess:
            confirm === null
              ? undefined
              : confirm === 'true'
                ? true
                : confirm === 'false'
                  ? false
                  : confirm,
          ccSender: cc === null ? undefined : cc === 'true' ? true : cc === 'false' ? false : cc,
        };
      } else {
        body = await c.req.json();
      }
    } catch {
      return c.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Invalid message request' },
        400
      );
    }
    const parsed = schemas.reporterMessage.safeParse(body);
    if (!parsed.success || (!parsed.data.message && uploads.length === 0))
      return c.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Enter a message or attach files, with at most 5000 characters',
        },
        400
      );
    const user = c.get('user');
    const result = await reportMessagesService.send(
      c.req.param('id'),
      user.id,
      parsed.data.message,
      parsed.data.ccSender,
      uploads,
      parsed.data.confirmPortalAccess
    );
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return c.json({ success: true, reporterMessage: result.value });
  }
);

reporterMessages.get('/:id/reporter-messages', validate({ params: schemas.id }), async (c) => {
  const result = await reportMessagesService.listByReport(c.req.param('id'));
  if (!result.success)
    return c.json(
      { success: false, error: result.code, message: result.error },
      errorStatus(result.code)
    );
  const portal = await reportMessagesService.portalContext(c.req.param('id'));
  if (!portal.success)
    return c.json(
      { success: false, error: portal.code, message: portal.error },
      errorStatus(portal.code)
    );
  return c.json({ success: true, messages: result.value, portal: portal.value });
});

for (const [action, hidden] of [
  ['hide', true],
  ['unhide', false],
] as const) {
  reporterMessages.post(
    `/:id/reporter-messages/:messageId/${action}`,
    authorize(['admin', 'editor']),
    async (c) => {
      const result = await reportMessagesService.setHidden(
        c.req.param('id'),
        c.req.param('messageId'),
        c.get('user').id,
        hidden
      );
      if (!result.success)
        return c.json(
          { success: false, error: result.code, message: result.error },
          errorStatus(result.code)
        );
      return c.json({ success: true, message: result.value });
    }
  );
}

export { reporterMessages as reporterMessagesRoutes };
