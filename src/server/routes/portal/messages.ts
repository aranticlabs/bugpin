import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { reporterAuthMiddleware } from '../../middleware/reporter-auth.js';
import { portalRateLimit } from '../../middleware/portal-rate-limit.js';
import { portalReportsService } from '../../services/portal-reports.service.js';
import { reportMessagesService } from '../../services/report-messages.service.js';
import { portalMessageSchema } from '../../utils/portal-schemas.js';
import { errorStatus } from '../../utils/http-status.js';
import { MAX_MESSAGE_FILES } from '../../utils/request-limits.js';

export const portalMessagesRoutes = new Hono();
portalMessagesRoutes.post(
  '/reports/:id/messages',
  reporterAuthMiddleware,
  portalRateLimit('messagesPerReporterPerMinute', 60),
  portalRateLimit('messagesPerReporterPerDay', 86400),
  async (c, next) => {
    const access = portalReportsService.access(c.req.param('id'), c.get('reporter').id);
    if (!access.success)
      return c.json(
        { success: false, error: access.code, message: access.error },
        errorStatus(access.code)
      );
    const limit = await reportMessagesService.uploadBodyLimit(
      c.req.param('id'),
      c.get('reporter').id
    );
    if (!limit.success)
      return c.json(
        { success: false, error: limit.code, message: limit.error },
        errorStatus(limit.code)
      );
    return bodyLimit({
      maxSize: c.req.header('content-type')?.includes('multipart/form-data')
        ? limit.value
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
    let files: File[] = [];
    try {
      if (c.req.header('content-type')?.includes('multipart/form-data')) {
        const form = await c.req.raw.formData();
        const values = [...form.getAll('files[]'), ...form.getAll('files')];
        if (values.length > MAX_MESSAGE_FILES || values.some((value) => typeof value === 'string'))
          return c.json(
            {
              success: false,
              error: 'INVALID_FILE',
              message: 'Attach at most 5 image or video files',
            },
            400
          );
        files = values.filter((value) => typeof value !== 'string');
        if ([...form.keys()].some((key) => !['body', 'files[]', 'files'].includes(key)))
          return c.json(
            { success: false, error: 'VALIDATION_ERROR', message: 'Invalid message request' },
            400
          );
        body = { body: form.get('body') ?? '' };
      } else body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Invalid message request' },
        400
      );
    }
    const parsed = portalMessageSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Invalid message request' },
        400
      );
    const result = await reportMessagesService.sendReporter(
      c.req.param('id'),
      c.get('reporter').id,
      parsed.data.body,
      files
    );
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return c.json(
      { success: true, message: portalReportsService.message(result.value, c.get('reporter').id) },
      201
    );
  }
);
