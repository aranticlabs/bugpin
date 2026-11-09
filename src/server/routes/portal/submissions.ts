import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { reporterAuthMiddleware } from '../../middleware/reporter-auth.js';
import { portalRateLimit } from '../../middleware/portal-rate-limit.js';
import { portalSubmissionsService } from '../../services/portal-submissions.service.js';
import { errorStatus } from '../../utils/http-status.js';
import { MAX_MESSAGE_FILES } from '../../utils/request-limits.js';

export const portalSubmissionsRoutes = new Hono();
portalSubmissionsRoutes.post(
  '/reports',
  reporterAuthMiddleware,
  portalRateLimit('submissionsPerReporterPerHour', 3600),
  portalRateLimit('submissionsPerReporterPerDay', 86400),
  async (c, next) => {
    const result = await portalSubmissionsService.uploadBodyLimit(c.get('reporter').id);
    if (!result.success)
      return c.json(
        { success: false, error: result.code, message: result.error },
        errorStatus(result.code)
      );
    return bodyLimit({
      maxSize: result.value.maxSize,
      onError: (context) =>
        context.json(
          {
            success: false,
            error: result.value.errorCode,
            message: 'Feedback upload is too large',
          },
          413
        ),
    })(c, next);
  },
  async (c) => {
    if (!c.req.header('content-type')?.includes('multipart/form-data'))
      return c.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Expected a feedback form' },
        400
      );
    try {
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
      if (
        ['projectId', 'title', 'description'].some((key) => form.getAll(key).length > 1) ||
        [...form.keys()].some(
          (key) => !['projectId', 'title', 'description', 'files[]', 'files'].includes(key)
        )
      )
        return c.json(
          { success: false, error: 'VALIDATION_ERROR', message: 'Invalid feedback form' },
          400
        );
      const result = await portalSubmissionsService.create(
        c.get('reporter').id,
        {
          projectId: form.get('projectId'),
          title: form.get('title'),
          description: form.get('description') ?? undefined,
        },
        values.filter((value) => typeof value !== 'string')
      );
      if (!result.success)
        return c.json(
          { success: false, error: result.code, message: result.error },
          errorStatus(result.code)
        );
      return c.json({ success: true, report: result.value }, 201);
    } catch (error) {
      if (error instanceof Error && error.name === 'BodyLimitError')
        return c.json(
          { success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Feedback upload is too large' },
          413
        );
      return c.json(
        { success: false, error: 'VALIDATION_ERROR', message: 'Invalid feedback form' },
        400
      );
    }
  }
);
