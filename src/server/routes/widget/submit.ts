import { Hono } from 'hono';
import { z } from 'zod';
import { reportsService } from '../../services/reports.service.js';
import { projectsService } from '../../services/projects.service.js';
import { settingsService } from '../../services/settings.service.js';
import { dynamicRateLimiter, apiKeyGenerator } from '../../middleware/rate-limit.js';
import { logger } from '../../utils/logger.js';
import { ALLOWED_MEDIA_MIME_TYPES } from '../../storage/files.js';
import { settingsCacheService } from '../../services/settings-cache.service.js';
import { resolveSubmitLocale } from '../../utils/locale.js';
import { tooltipLauncherDefaults } from '../../i18n/tooltip-defaults.js';
import type { LauncherTextBundle, ReportMetadata } from '@shared/types';

const widget = new Hono();

const MAX_DISPLAY_LENGTH = 128;
const CONTROL_CHARS_PATTERN = /[\x00-\x1F\x7F]/g;

function sanitizeForDisplay(value: string): string {
  return value.replace(CONTROL_CHARS_PATTERN, '').slice(0, MAX_DISPLAY_LENGTH);
}

// Validation Schemas

const submitReportSchema = z.object({
  title: z.string().min(4, 'Title must be at least 4 characters').max(200),
  description: z.string().optional(),
  priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).default('medium'),
  reporterName: z.string().optional(),
  reporterEmail: z.string().email().optional().or(z.literal('')),
  locale: z.string().optional(),
  metadata: z.object({
    url: z.string(),
    title: z.string().optional(),
    referrer: z.string().optional(),
    browser: z.object({
      name: z.string(),
      version: z.string(),
      userAgent: z.string(),
    }),
    device: z.object({
      type: z.enum(['desktop', 'tablet', 'mobile']),
      os: z.string(),
      osVersion: z.string().optional(),
    }),
    viewport: z.object({
      width: z.number(),
      height: z.number(),
      devicePixelRatio: z.number(),
      orientation: z.enum(['landscape', 'portrait']).optional(),
    }),
    timestamp: z.string(),
    timezone: z.string().optional(),
    pageLoadTime: z.number().optional(),
    consoleErrors: z
      .array(
        z.object({
          type: z.enum(['error', 'warn', 'log']),
          message: z.string(),
          source: z.string().optional(),
          line: z.number().optional(),
          timestamp: z.string(),
        })
      )
      .optional(),
    networkErrors: z
      .array(
        z.object({
          url: z.string(),
          method: z.string(),
          status: z.number(),
          statusText: z.string(),
          timestamp: z.string(),
        })
      )
      .optional(),
    userActivity: z
      .array(
        z.object({
          type: z.enum(['button', 'link', 'input', 'select', 'checkbox', 'other']),
          text: z.string().optional(),
          url: z.string().optional(),
          inputType: z.string().optional(),
          timestamp: z.string(),
        })
      )
      .optional(),
    storageKeys: z
      .object({
        cookies: z.array(z.string()),
        localStorage: z.array(z.string()),
        sessionStorage: z.array(z.string()),
      })
      .optional(),
  }),
  annotations: z.record(z.string(), z.unknown()).optional(),
});

// Submit Report

widget.post('/submit', dynamicRateLimiter({ keyGenerator: apiKeyGenerator }), async (c) => {
  // Reject deprecated query parameter - API key must be in header
  if (c.req.query('apiKey')) {
    return c.json(
      {
        success: false,
        error: 'DEPRECATED',
        message: 'API key query parameter is deprecated. Use x-api-key header instead.',
      },
      400
    );
  }

  // Get API key from header only
  const apiKey = c.req.header('x-api-key');

  if (!apiKey) {
    return c.json(
      { success: false, error: 'UNAUTHORIZED', message: 'x-api-key header is required' },
      401
    );
  }

  // Validate API key, project active status, and origin
  const origin = c.req.header('origin');
  const projectResult = await projectsService.validateWidgetAccess(apiKey, origin);

  if (!projectResult.success) {
    const statusCode =
      projectResult.code === 'INVALID_API_KEY'
        ? 401
        : projectResult.code === 'ORIGIN_NOT_ALLOWED'
          ? 403
          : 403;
    return c.json(
      { success: false, error: projectResult.code, message: projectResult.error },
      statusCode
    );
  }

  // Project validation successful (access validated, project is active, origin allowed)

  // Parse request body
  const contentType = c.req.header('content-type') ?? '';
  let body: Record<string, unknown>;
  let mediaFiles: File[] = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody({ all: true });

    // Extract JSON data
    const dataStr = formData['data'] as string;
    if (dataStr) {
      try {
        body = JSON.parse(dataStr);
      } catch {
        return c.json(
          { success: false, error: 'INVALID_JSON', message: 'Invalid JSON in data field' },
          400
        );
      }
    } else {
      body = {};
    }

    // Extract media files (can be single file or array of files)
    const mediaField = formData['media'];
    if (mediaField) {
      if (Array.isArray(mediaField)) {
        mediaFiles = mediaField.filter((f): f is File => f instanceof File);
      } else if (mediaField instanceof File) {
        mediaFiles = [mediaField];
      }
    }

    // Also check for legacy 'screenshot' field for backwards compatibility
    if (formData['screenshot'] instanceof File) {
      mediaFiles.push(formData['screenshot']);
    }
  } else {
    body = await c.req.json();
  }

  // Validate body
  const validation = submitReportSchema.safeParse(body);
  if (!validation.success) {
    return c.json(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400
    );
  }

  const data = validation.data;

  // Filter and prepare media files data
  const settings = await settingsCacheService.getAll();
  const projScreenshot = projectResult.value.settings?.screenshot;
  const globalScreenshot = settings.screenshot;
  const maxScreenshotMb =
    projScreenshot?.maxScreenshotSize ?? globalScreenshot.maxScreenshotSize ?? 10;
  const maxImageMb =
    projScreenshot?.maxImageUploadSizeMb ?? globalScreenshot.maxImageUploadSizeMb ?? 10;
  const maxVideoMb =
    projScreenshot?.maxVideoUploadSizeMb ?? globalScreenshot.maxVideoUploadSizeMb ?? 50;
  const imageLimitMb = Math.max(maxScreenshotMb, maxImageMb);
  const maxFileSizeBytes = imageLimitMb * 1024 * 1024;
  const maxVideoSizeBytes = maxVideoMb * 1024 * 1024;
  const allowedTypes: readonly string[] = ALLOWED_MEDIA_MIME_TYPES;

  const media: Array<{ data: Buffer; filename: string; mimeType: string }> = [];
  for (const file of mediaFiles) {
    // Early MIME type check before buffering
    if (!allowedTypes.includes(file.type)) {
      logger.warn('Media file rejected: invalid MIME type', {
        filename: file.name,
        mimeType: file.type,
      });
      return c.json(
        {
          success: false,
          error: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Unsupported media type "${sanitizeForDisplay(file.type)}" for "${sanitizeForDisplay(file.name)}".`,
          details: { filename: file.name, mimeType: file.type },
        },
        415
      );
    }

    // Early size check before buffering
    const isVideo = file.type.startsWith('video/');
    const sizeLimit = isVideo ? maxVideoSizeBytes : maxFileSizeBytes;
    if (file.size > sizeLimit) {
      const limitMb = Math.round(sizeLimit / (1024 * 1024));
      const sizeMb = Math.round((file.size / (1024 * 1024)) * 10) / 10;
      logger.warn('Media file rejected: too large', {
        filename: file.name,
        size: file.size,
        limit: sizeLimit,
      });
      return c.json(
        {
          success: false,
          error: 'FILE_TOO_LARGE',
          message: `${isVideo ? 'Video' : 'Image'} "${sanitizeForDisplay(file.name)}" is ${sizeMb}MB; maximum is ${limitMb}MB.`,
          details: {
            filename: file.name,
            size: file.size,
            limit: sizeLimit,
            kind: isVideo ? 'video' : 'image',
          },
        },
        413
      );
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      media.push({
        data: buffer,
        filename: file.name,
        mimeType: file.type,
      });
    } catch (error) {
      logger.error('Failed to process media file', error, { filename: file.name });
      return c.json(
        {
          success: false,
          error: 'FILE_READ_ERROR',
          message: `Failed to read uploaded file "${sanitizeForDisplay(file.name)}"`,
          details: { filename: file.name },
        },
        400
      );
    }
  }

  const globalSettingsResult = await settingsService.getAll();
  const globalLanguage = globalSettingsResult.success
    ? globalSettingsResult.value.language
    : undefined;
  const effectiveLanguage = projectResult.value.settings?.language ?? globalLanguage;
  const reporterLocale = resolveSubmitLocale({
    claimed: data.locale,
    projectMode: effectiveLanguage?.mode,
    projectDefault: effectiveLanguage?.defaultLanguage,
  });

  // Create report via service
  const result = await reportsService.create({
    apiKey,
    title: data.title,
    description: data.description,
    priority: data.priority,
    files: media,
    annotations: data.annotations as object,
    metadata: data.metadata as ReportMetadata,
    reporterEmail: data.reporterEmail || undefined,
    reporterName: data.reporterName || undefined,
    reporterLocale,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.code, message: result.error }, 400);
  }

  return c.json(
    {
      success: true,
      reportId: result.value.id,
      message: 'Bug report submitted successfully',
    },
    201
  );
});

// Get Widget Config

widget.get('/config/:apiKey', async (c) => {
  const apiKey = c.req.param('apiKey');

  // Validate API key and get project
  const projectResult = await projectsService.validateWidgetAccess(apiKey);

  if (!projectResult.success) {
    const statusCode = projectResult.code === 'INVALID_API_KEY' ? 404 : 403;
    return c.json(
      { success: false, error: projectResult.code, message: projectResult.error },
      statusCode
    );
  }

  const project = projectResult.value;

  // Get global app settings
  const settingsResult = await settingsService.getAll();
  if (!settingsResult.success) {
    return c.json(
      { success: false, error: 'SETTINGS_ERROR', message: 'Failed to load settings' },
      500
    );
  }
  const appSettings = settingsResult.value;

  // Get branding primary color
  const brandingPrimaryColor = appSettings.branding.primaryColor;

  // Shortcuts for project and global settings
  const projButton = project.settings?.widgetLauncherButton;
  const projDialog = project.settings?.widgetDialog;
  const projScreenshot = project.settings?.screenshot;
  const projLanguage = project.settings?.language ?? appSettings.language;
  const globalButton = appSettings.widgetLauncherButton;
  const globalDialog = appSettings.widgetDialog;
  const globalScreenshot = appSettings.screenshot;

  // Use project-level settings if defined, otherwise fall back to global settings.
  // For nullable fields (buttonIcon, buttonText, tooltipText), check for undefined specifically
  // because null is a valid explicit value (e.g., "No Icon") and ?? would treat it as unset.
  const useScreenCaptureAPI =
    projScreenshot?.useScreenCaptureAPI ?? globalScreenshot.useScreenCaptureAPI;
  const maxScreenshotSizeMb =
    projScreenshot?.maxScreenshotSize ?? globalScreenshot.maxScreenshotSize;
  const maxImageUploadSizeMb =
    projScreenshot?.maxImageUploadSizeMb ?? globalScreenshot.maxImageUploadSizeMb;
  const maxVideoUploadSizeMb =
    projScreenshot?.maxVideoUploadSizeMb ?? globalScreenshot.maxVideoUploadSizeMb;
  const theme = projButton?.theme ?? globalButton.theme;
  const position = projButton?.position ?? globalButton.position;
  const buttonShape = projButton?.buttonShape ?? globalButton.buttonShape;
  const buttonIcon =
    projButton?.buttonIcon !== undefined ? projButton.buttonIcon : globalButton.buttonIcon;
  const buttonIconSize = projButton?.buttonIconSize ?? globalButton.buttonIconSize;
  const buttonIconStroke = projButton?.buttonIconStroke ?? globalButton.buttonIconStroke;
  const enableHoverScaleEffect =
    projButton?.enableHoverScaleEffect ?? globalButton.enableHoverScaleEffect;
  const tooltipEnabled = projButton?.tooltipEnabled ?? globalButton.tooltipEnabled;

  const buttonTextBundle: LauncherTextBundle = {
    project: projButton && 'buttonText' in projButton ? projButton.buttonText : undefined,
    global: globalButton.buttonText,
    builtin: null,
  };

  const tooltipTextBundle: LauncherTextBundle = {
    project: projButton && 'tooltipText' in projButton ? projButton.tooltipText : undefined,
    global: globalButton.tooltipText,
    builtin: tooltipLauncherDefaults,
  };

  // Widget Button light mode colors
  const lightButtonColor = projButton?.lightButtonColor ?? globalButton.lightButtonColor;
  const lightTextColor = projButton?.lightTextColor ?? globalButton.lightTextColor;
  const lightButtonHoverColor =
    projButton?.lightButtonHoverColor ?? globalButton.lightButtonHoverColor;
  const lightTextHoverColor = projButton?.lightTextHoverColor ?? globalButton.lightTextHoverColor;

  // Widget Button dark mode colors
  const darkButtonColor = projButton?.darkButtonColor ?? globalButton.darkButtonColor;
  const darkTextColor = projButton?.darkTextColor ?? globalButton.darkTextColor;
  const darkButtonHoverColor =
    projButton?.darkButtonHoverColor ?? globalButton.darkButtonHoverColor;
  const darkTextHoverColor = projButton?.darkTextHoverColor ?? globalButton.darkTextHoverColor;

  // Widget Dialog colors (separate from launcher button)
  const dialogLightButtonColor = projDialog?.lightButtonColor ?? globalDialog.lightButtonColor;
  const dialogLightTextColor = projDialog?.lightTextColor ?? globalDialog.lightTextColor;
  const dialogLightButtonHoverColor =
    projDialog?.lightButtonHoverColor ?? globalDialog.lightButtonHoverColor;
  const dialogLightTextHoverColor =
    projDialog?.lightTextHoverColor ?? globalDialog.lightTextHoverColor;
  const dialogLightBackgroundColor =
    projDialog?.lightBackgroundColor ?? globalDialog.lightBackgroundColor;
  const dialogLightSecondaryColor =
    projDialog?.lightSecondaryColor ?? globalDialog.lightSecondaryColor;
  const dialogLightInputColor = projDialog?.lightInputColor ?? globalDialog.lightInputColor;
  const dialogLightForegroundColor =
    projDialog?.lightForegroundColor ?? globalDialog.lightForegroundColor;
  const dialogDarkButtonColor = projDialog?.darkButtonColor ?? globalDialog.darkButtonColor;
  const dialogDarkTextColor = projDialog?.darkTextColor ?? globalDialog.darkTextColor;
  const dialogDarkButtonHoverColor =
    projDialog?.darkButtonHoverColor ?? globalDialog.darkButtonHoverColor;
  const dialogDarkTextHoverColor =
    projDialog?.darkTextHoverColor ?? globalDialog.darkTextHoverColor;
  const dialogDarkBackgroundColor =
    projDialog?.darkBackgroundColor ?? globalDialog.darkBackgroundColor;
  const dialogDarkSecondaryColor =
    projDialog?.darkSecondaryColor ?? globalDialog.darkSecondaryColor;
  const dialogDarkInputColor = projDialog?.darkInputColor ?? globalDialog.darkInputColor;
  const dialogDarkForegroundColor =
    projDialog?.darkForegroundColor ?? globalDialog.darkForegroundColor;

  // Return widget configuration
  return c.json({
    success: true,
    config: {
      projectName: project.name,
      branding: project.settings?.branding || {},
      brandingPrimaryColor,
      features: {
        screenshot: true, // Always enabled
        annotation: true, // Always enabled for now
        attachments: false, // Not implemented yet
        consoleCapture: true, // Always enabled
      },
      theme,
      position,
      buttonText: buttonTextBundle,
      buttonShape,
      buttonIcon,
      buttonIconSize,
      buttonIconStroke,
      // Light mode colors
      lightButtonColor,
      lightTextColor,
      lightButtonHoverColor,
      lightTextHoverColor,
      // Dark mode colors (launcher button)
      darkButtonColor,
      darkTextColor,
      darkButtonHoverColor,
      darkTextHoverColor,
      // Dialog colors (light mode)
      dialogLightButtonColor,
      dialogLightTextColor,
      dialogLightButtonHoverColor,
      dialogLightTextHoverColor,
      dialogLightBackgroundColor,
      dialogLightSecondaryColor,
      dialogLightInputColor,
      dialogLightForegroundColor,
      // Dialog colors (dark mode)
      dialogDarkButtonColor,
      dialogDarkTextColor,
      dialogDarkButtonHoverColor,
      dialogDarkTextHoverColor,
      dialogDarkBackgroundColor,
      dialogDarkSecondaryColor,
      dialogDarkInputColor,
      dialogDarkForegroundColor,
      enableHoverScaleEffect,
      tooltipEnabled,
      tooltipText: tooltipTextBundle,
      captureMethod: 'visible', // Default capture method
      useScreenCaptureAPI,
      maxScreenshotSizeMb,
      maxImageUploadSizeMb,
      maxVideoUploadSizeMb,
      language: {
        mode: projLanguage.mode,
        defaultLanguage: projLanguage.defaultLanguage,
      },
    },
  });
});

export { widget as widgetRoutes };
