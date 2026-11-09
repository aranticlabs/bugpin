import { withEffectiveBranding } from '../../utils/effective-branding.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { settingsService } from '../../services/settings.service.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { emailService } from '../../services/email.service.js';
import { templateService } from '../../services/template.service.js';
import {
  defaultEmailTemplates,
  getSampleDataForTemplate,
  applyBrandColor,
  DEFAULT_BRAND_COLOR,
} from '../../constants/email-templates.js';
import { authMiddleware, authorize } from '../../middleware/auth.js';
import { validate, schemas } from '../../middleware/validate.js';
import { requireEEFeature, hasEEFeature } from '../../utils/ee.js';
import { getEffectiveOrigin, ignoresForwardedHeaders } from '../../utils/client-ip.js';
import type { EmailTemplateType } from '@shared/types';

// Email template routes require 'custom-templates' EE feature
const requireEmailTemplates = requireEEFeature('custom-templates');

const settings = new Hono();

// All settings routes require authentication
settings.use('*', authMiddleware);

// The configured Application URL and the address BugPin derives for this request, for
// comparison with the address in the browser (Admin only)

settings.get('/address-check', authorize(['admin']), async (c) => {
  const { appUrl } = await settingsCacheService.getAll();
  return c.json({
    success: true,
    appUrl,
    requestOrigin: getEffectiveOrigin(c),
    forwardedHeadersIgnored: ignoresForwardedHeaders(c),
  });
});

// Get Settings (Admin only)

settings.get('/', authorize(['admin']), async (c) => {
  const result = await settingsService.getAll();

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    settings: result.value,
  });
});

// Update Settings

settings.put('/', authorize(['admin']), validate({ body: schemas.updateSettings }), async (c) => {
  const body = schemas.updateSettings.parse(c.get('validatedBody' as never));

  // Check if S3 storage is being enabled without EE license
  if (
    (body.s3Enabled !== undefined || body.s3Config !== undefined) &&
    !hasEEFeature('s3-storage')
  ) {
    return c.json(
      {
        success: false,
        error: 'FEATURE_NOT_LICENSED',
        message: "Feature 's3-storage' requires Enterprise license",
        upgradeUrl: 'https://bugpin.io/editions/',
      },
      402
    );
  }

  if (
    (body.branding !== undefined || body.adminButton !== undefined) &&
    !hasEEFeature('custom-branding')
  ) {
    return c.json(
      {
        success: false,
        error: 'FEATURE_NOT_LICENSED',
        message: 'Custom branding requires Enterprise license',
      },
      402
    );
  }
  const result = await settingsService.update(body);

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json({
    success: true,
    settings: result.value,
  });
});

// Test Email Configuration

const testEmailSchema = z.object({
  smtpConfig: z.object({
    host: z.string().min(1, 'SMTP host is required'),
    port: z.number().int().positive(),
    user: z.string().optional(),
    password: z.string().optional(),
    from: z.string().email('Valid from email address is required'),
  }),
  testEmail: z.string().email('Valid test email address is required'),
  appName: z.string().optional(),
});

settings.post('/test-email', authorize(['admin']), async (c) => {
  try {
    const body = await c.req.json();
    const validation = testEmailSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400
      );
    }

    const { smtpConfig, testEmail, appName } = validation.data;

    const result = await emailService.sendTestEmail(smtpConfig, testEmail, appName || 'BugPin');

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: 'SMTP_ERROR',
          message: result.error || 'Failed to send test email',
        },
        400
      );
    }

    return c.json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json(
      {
        success: false,
        error: 'SERVER_ERROR',
        message,
      },
      500
    );
  }
});

// Preview Email Template

const previewTemplateSchema = z.object({
  type: z.enum(['newReport', 'statusChange', 'assignment', 'invitation', 'testEmail']),
  subject: z.string().min(1, 'Subject is required'),
  html: z.string().min(1, 'HTML content is required'),
});

settings.post(
  '/email-templates/preview',
  authorize(['admin']),
  requireEmailTemplates,
  async (c) => {
    try {
      const body = await c.req.json();
      const validation = previewTemplateSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          400
        );
      }

      const { type, subject, html } = validation.data;
      const result = await settingsService.getAll();

      if (!result.success) {
        return c.json({ success: false, error: result.code, message: result.error }, 400);
      }

      const settings = withEffectiveBranding(result.value);
      const sampleData = getSampleDataForTemplate(
        type as EmailTemplateType,
        settings.appName,
        settings.appUrl
      );

      const compiledSubject = templateService.compileTemplate(subject, sampleData);
      const compiledHtml = templateService.compileTemplate(html, sampleData);
      const withFooter = await emailService.appendFooter(compiledHtml, type as EmailTemplateType);
      const finalHtml = applyBrandColor(
        withFooter,
        settings.branding?.primaryColor || DEFAULT_BRAND_COLOR
      );

      return c.json({
        success: true,
        preview: {
          subject: compiledSubject,
          html: finalHtml,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json(
        {
          success: false,
          error: 'SERVER_ERROR',
          message,
        },
        500
      );
    }
  }
);

// Send Test Email with Custom Template

const sendTestTemplateSchema = z.object({
  type: z.enum(['newReport', 'statusChange', 'assignment', 'invitation', 'testEmail']),
  subject: z.string().min(1, 'Subject is required'),
  html: z.string().min(1, 'HTML content is required'),
  recipientEmail: z.string().email('Valid recipient email is required'),
});

settings.post(
  '/email-templates/send-test',
  authorize(['admin']),
  requireEmailTemplates,
  async (c) => {
    try {
      const body = await c.req.json();
      const validation = sendTestTemplateSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          {
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          400
        );
      }

      const { type, subject, html, recipientEmail } = validation.data;
      const result = await settingsService.getAll();

      if (!result.success) {
        return c.json({ success: false, error: result.code, message: result.error }, 400);
      }

      const appSettings = withEffectiveBranding(result.value);

      // Check if SMTP is configured
      if (!appSettings.smtpEnabled) {
        return c.json(
          {
            success: false,
            error: 'SMTP_DISABLED',
            message: 'SMTP is not enabled. Please configure SMTP settings first.',
          },
          400
        );
      }

      // Compile template with sample data
      const sampleData = getSampleDataForTemplate(
        type as EmailTemplateType,
        appSettings.appName,
        appSettings.appUrl
      );

      const compiledSubject = templateService.compileTemplate(subject, sampleData);
      const compiledHtml = templateService.compileTemplate(html, sampleData);
      const withFooter = await emailService.appendFooter(compiledHtml, type as EmailTemplateType);
      const finalHtml = applyBrandColor(
        withFooter,
        appSettings.branding?.primaryColor || DEFAULT_BRAND_COLOR
      );

      // Send the email
      const sendResult = await emailService.sendEmail({
        to: [{ email: recipientEmail }],
        subject: `[TEST] ${compiledSubject}`,
        html: finalHtml,
      });

      if (!sendResult.success) {
        return c.json(
          {
            success: false,
            error: 'SEND_FAILED',
            message: sendResult.error || 'Failed to send test email',
          },
          400
        );
      }

      return c.json({
        success: true,
        message: `Test email sent to ${recipientEmail}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return c.json(
        {
          success: false,
          error: 'SERVER_ERROR',
          message,
        },
        500
      );
    }
  }
);

// Get Default Email Template

settings.get(
  '/email-templates/defaults/:type',
  authorize(['admin']),
  requireEmailTemplates,
  async (c) => {
    const type = c.req.param('type') as EmailTemplateType;

    if (!defaultEmailTemplates[type]) {
      return c.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: 'Template type not found',
        },
        404
      );
    }

    return c.json({
      success: true,
      template: defaultEmailTemplates[type].en,
    });
  }
);

// Invalidate Settings Cache (Admin only)
// Useful for deployments, debugging, or when settings are modified outside the application

settings.post('/cache/invalidate', authorize(['admin']), async (c) => {
  try {
    settingsCacheService.invalidate();

    return c.json({
      success: true,
      message: 'Settings cache invalidated successfully',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: 'CACHE_INVALIDATION_FAILED',
        message: 'Failed to invalidate cache',
      },
      500
    );
  }
});

export { settings as settingsRoutes };
