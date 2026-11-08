import type { Context, MiddlewareHandler } from 'hono';
import { z, ZodSchema } from 'zod';
import { isValidHexColor, isValidUrl, normalizeUrl } from '../utils/validators.js';
import { RECORDING_QUALITIES } from '@shared/recording-quality';
import { reporterPortalLimitsSchema } from '../utils/reporter-portal-limits.js';
import {
  ACHIEVEMENT_IDS,
  DASHBOARD_RANGES,
  EXPORT_ACTIONS,
  EXPORT_FORMATS,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  REPORT_SORT_KEYS,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  REPORT_VIEWS,
  SUPPORTED_LOCALES,
  TEAM_PERIODS,
  TABLE_PAGE_SIZES,
  THEME_PREFERENCES,
  type LocaleCode,
  type TablePageSize,
} from '@shared/types';

const webhookEventSchema = z.enum([
  'report.created',
  'report.updated',
  'report.status_changed',
  'report.assigned',
  'report.resolved',
  'report.closed',
  'report.deleted',
]);

const localeEnumValues = SUPPORTED_LOCALES as readonly [LocaleCode, ...LocaleCode[]];

const projectLanguageSchema = z.object({
  mode: z.enum(['auto', 'manual'], {
    error: 'language.mode must be "auto" or "manual"',
  }),
  defaultLanguage: z.enum(localeEnumValues, {
    error: `language.defaultLanguage must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
  }),
});

const localizedStringShape: Record<string, z.ZodOptional<z.ZodString>> = {};
for (const code of SUPPORTED_LOCALES) {
  if (code !== 'en') {
    localizedStringShape[code] = z.string().optional();
  }
}

const localizedStringSchema = z
  .object({
    en: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? 'en is required when providing a localized string'
            : undefined,
      })
      .min(1, 'en must not be empty when providing a localized string'),
    ...localizedStringShape,
  })
  .strict();

const projectLocalizedTextField = z.union([z.null(), localizedStringSchema]).optional();

// A WebAuthn credential as serialized by the browser; SimpleWebAuthn checks the details
const webAuthnCredentialSchema = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()),
});

const tablePageSizeSchema = z.custom<TablePageSize>(
  (value) => TABLE_PAGE_SIZES.some((size) => size === value),
  { message: `Page size must be one of ${TABLE_PAGE_SIZES.join(', ')}` }
);
const positionEnum = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']);
const buttonShapeEnum = z.enum(['rectangle', 'round']);
const themeEnum = z.enum(['auto', 'light', 'dark']);
const hexColor = z.string().refine(isValidHexColor, 'Must be a hex color in #RRGGBB format');
const nullableString = z.string().nullable();

const launcherButtonCommonFields = {
  position: positionEnum.optional(),
  buttonShape: buttonShapeEnum.optional(),
  buttonIcon: nullableString.optional(),
  buttonIconSize: z.number().optional(),
  buttonIconStroke: z.number().optional(),
  buttonOffsetX: z.number().min(0).max(200).optional(),
  buttonOffsetY: z.number().min(0).max(200).optional(),
  buttonSizeUnit: z.enum(['px', 'rem']).optional(),
  theme: themeEnum.optional(),
  enableHoverScaleEffect: z.boolean().optional(),
  tooltipEnabled: z.boolean().optional(),
  lightButtonColor: hexColor.optional(),
  lightTextColor: hexColor.optional(),
  lightButtonHoverColor: hexColor.optional(),
  lightTextHoverColor: hexColor.optional(),
  darkButtonColor: hexColor.optional(),
  darkTextColor: hexColor.optional(),
  darkButtonHoverColor: hexColor.optional(),
  darkTextHoverColor: hexColor.optional(),
};

const widgetLauncherButtonProjectSchema = z
  .object({
    ...launcherButtonCommonFields,
    buttonText: projectLocalizedTextField,
    tooltipText: projectLocalizedTextField,
  })
  .strict();

const widgetDialogColorsSchema = z
  .object({
    lightButtonColor: hexColor.optional(),
    lightTextColor: hexColor.optional(),
    lightButtonHoverColor: hexColor.optional(),
    lightTextHoverColor: hexColor.optional(),
    lightBackgroundColor: hexColor.optional(),
    lightSecondaryColor: hexColor.optional(),
    lightInputColor: hexColor.optional(),
    lightForegroundColor: hexColor.optional(),
    lightSecondaryButtonColor: hexColor.optional(),
    lightSecondaryButtonTextColor: hexColor.optional(),
    lightSecondaryButtonHoverColor: hexColor.optional(),
    lightSecondaryButtonTextHoverColor: hexColor.optional(),
    lightTabBarColor: hexColor.optional(),
    lightActiveTabColor: hexColor.optional(),
    lightActiveTabTextColor: hexColor.optional(),
    lightTabTextColor: hexColor.optional(),
    lightTabTextHoverColor: hexColor.optional(),
    darkButtonColor: hexColor.optional(),
    darkTextColor: hexColor.optional(),
    darkButtonHoverColor: hexColor.optional(),
    darkTextHoverColor: hexColor.optional(),
    darkBackgroundColor: hexColor.optional(),
    darkSecondaryColor: hexColor.optional(),
    darkInputColor: hexColor.optional(),
    darkForegroundColor: hexColor.optional(),
    darkSecondaryButtonColor: hexColor.optional(),
    darkSecondaryButtonTextColor: hexColor.optional(),
    darkSecondaryButtonHoverColor: hexColor.optional(),
    darkSecondaryButtonTextHoverColor: hexColor.optional(),
    darkTabBarColor: hexColor.optional(),
    darkActiveTabColor: hexColor.optional(),
    darkActiveTabTextColor: hexColor.optional(),
    darkTabTextColor: hexColor.optional(),
    darkTabTextHoverColor: hexColor.optional(),
  })
  .strict();

const projectScreenshotSchema = z
  .object({
    useScreenCaptureAPI: z.boolean().optional(),
    maxScreenshotSize: z.number().int().min(1).max(50).optional(),
    maxImageUploadSizeMb: z.number().int().min(1).max(50).optional(),
    maxVideoUploadSizeMb: z.number().int().min(1).max(100).optional(),
    maxVideoUploadMbPerDay: z.number().int().min(0).max(1048576).optional(),
    enableScreenRecording: z.boolean().optional(),
    allowRecordingMicrophone: z.boolean().optional(),
    maxRecordingDurationSeconds: z.number().int().min(10).max(600).optional(),
    recordingQuality: z.enum(RECORDING_QUALITIES).optional(),
  })
  .strict();

const projectSecuritySchema = z
  .object({
    allowedOrigins: z.array(z.string()).optional(),
  })
  .strict();

const projectBrandingSchema = z
  .object({
    logoUrl: z.string().optional(),
    companyName: z.string().optional(),
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    poweredByVisible: z.boolean().optional(),
  })
  .strict();

const customFieldSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['text', 'select', 'checkbox']),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
  })
  .strict();

const projectFieldsSchema = z
  .object({
    titleRequired: z.boolean().optional(),
    titlePlaceholder: z.string().optional(),
    descriptionRequired: z.boolean().optional(),
    descriptionPlaceholder: z.string().optional(),
    priorityVisible: z.boolean().optional(),
    priorityDefault: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
    emailVisible: z.boolean().optional(),
    emailRequired: z.boolean().optional(),
    customFields: z.array(customFieldSchema).optional(),
  })
  .strict();

const projectReporterNotificationsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    notifyOnNewReport: z.boolean().optional(),
    notifyOnStatusChange: z.boolean().optional(),
    notifyOnPriorityChange: z.boolean().optional(),
    notifyOnAssignment: z.boolean().optional(),
    messagingEnabled: z.boolean().optional(),
  })
  .strict();

const projectLegacyWidgetSchema = z
  .object({
    enabled: z.boolean().optional(),
    showOnMobile: z.boolean().optional(),
    captureMethod: z.enum(['visible', 'fullpage', 'element']).optional(),
    rateLimit: z.number().optional(),
  })
  .strict();

const widgetDialogContentProjectSchema = z
  .object({
    title: projectLocalizedTextField,
    titlePlaceholder: projectLocalizedTextField,
    descriptionPlaceholder: projectLocalizedTextField,
    submitButtonText: projectLocalizedTextField,
    showPriority: z.boolean().optional(),
  })
  .strict();

const projectSettingsSchema = z
  .object({
    defaultAssigneeUserId: z.string().nullable().optional(),
    language: projectLanguageSchema.nullable().optional(),
    widgetLauncherButton: widgetLauncherButtonProjectSchema.nullable().optional(),
    widgetDialog: widgetDialogColorsSchema.nullable().optional(),
    widgetDialogContent: widgetDialogContentProjectSchema.nullable().optional(),
    screenshot: projectScreenshotSchema.nullable().optional(),
    activityCapture: z.boolean().nullable().optional(),
    consoleCapture: z.boolean().nullable().optional(),
    networkCapture: z.boolean().nullable().optional(),
    storageKeysCapture: z.boolean().nullable().optional(),
    security: projectSecuritySchema.nullable().optional(),
    branding: projectBrandingSchema.optional(),
    fields: projectFieldsSchema.optional(),
    notifyReporter: z.boolean().optional(),
    reporterNotifications: projectReporterNotificationsSchema.nullable().optional(),
    widget: projectLegacyWidgetSchema.optional(),
  })
  .strict();

const globalLocalizedTextField = z.union([z.null(), localizedStringSchema]);

const widgetDialogContentGlobalSchema = z
  .object({
    title: globalLocalizedTextField.optional(),
    titlePlaceholder: globalLocalizedTextField.optional(),
    descriptionPlaceholder: globalLocalizedTextField.optional(),
    submitButtonText: globalLocalizedTextField.optional(),
    showPriority: z.boolean().optional(),
  })
  .strict();

const widgetLauncherButtonGlobalSchema = z
  .object({
    ...launcherButtonCommonFields,
    buttonText: globalLocalizedTextField.optional(),
    tooltipText: globalLocalizedTextField.optional(),
  })
  .strict();

// Types

interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

// Middleware

// Updates do not carry the integration type, so typed keys are checked for every integration.
// Only GitHub reads publicVideoLinks; it must be a real boolean because it grants public access.
const integrationConfigSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (config) =>
      config.publicVideoLinks === undefined || typeof config.publicVideoLinks === 'boolean',
    { message: 'publicVideoLinks must be a boolean', path: ['publicVideoLinks'] }
  );

/** The query `validate` parsed, typed by the schema it was validated with */
export function validatedQuery<S extends z.ZodType>(c: Context, _schema: S): z.output<S> {
  return c.get('validatedQuery' as never) as z.output<S>;
}

/** The body `validate` parsed, typed by the schema it was validated with */
export function validatedBody<S extends z.ZodType>(c: Context, _schema: S): z.output<S> {
  return c.get('validatedBody' as never) as z.output<S>;
}

/**
 * Validation middleware factory
 * Validates request body, query, and/or params against Zod schemas
 *
 * @param options - Validation schemas for body, query, and params
 * @returns Middleware function
 */
export function validate(options: ValidationOptions): MiddlewareHandler {
  return async (c, next) => {
    const errors: Array<{ field: string; message: string }> = [];

    // Validate body
    if (options.body) {
      try {
        const contentType = c.req.header('content-type') ?? '';
        let body: unknown;

        if (contentType.includes('application/json')) {
          body = await c.req.json();
        } else if (contentType.includes('multipart/form-data')) {
          body = await c.req.parseBody();
        } else {
          body = await c.req.text();
        }

        const result = options.body.safeParse(body);
        if (!result.success) {
          for (const issue of result.error.issues) {
            errors.push({
              field: issue.path.join('.') || 'body',
              message: issue.message,
            });
          }
        } else {
          // Store validated body in context
          c.set('validatedBody' as never, result.data as never);
        }
      } catch (error) {
        errors.push({
          field: 'body',
          message: 'Invalid request body',
        });
      }
    }

    // Validate query parameters
    if (options.query) {
      const query = c.req.query();
      const result = options.query.safeParse(query);

      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            field: `query.${issue.path.join('.')}`,
            message: issue.message,
          });
        }
      } else {
        c.set('validatedQuery' as never, result.data as never);
      }
    }

    // Validate path parameters
    if (options.params) {
      const params = c.req.param();
      const result = options.params.safeParse(params);

      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            field: `params.${issue.path.join('.')}`,
            message: issue.message,
          });
        }
      } else {
        c.set('validatedParams' as never, result.data as never);
      }
    }

    // Return validation errors if any
    if (errors.length > 0) {
      return c.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
        },
        400
      );
    }

    return next();
  };
}

// Common Schemas

const boardMoveShape = {
  status: z.enum(REPORT_STATUSES),
  previousId: z.string().min(1).max(64).nullable().optional(),
  nextId: z.string().min(1).max(64).nullable().optional(),
  adoptSort: z
    .object({
      sortBy: z.enum(REPORT_SORT_KEYS),
      sortOrder: z.enum(['asc', 'desc']),
      scope: z
        .object({
          projectId: z.string().min(1).max(64).optional(),
          status: z.array(z.enum(REPORT_STATUSES)).max(REPORT_STATUSES.length).optional(),
          priority: z.array(z.enum(REPORT_PRIORITIES)).max(REPORT_PRIORITIES.length).optional(),
          assignedTo: z.string().min(1).max(64).optional(),
          search: z.string().min(1).max(200).optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional(),
};

export const schemas = {
  // ID parameter
  id: z.object({
    id: z.string().min(1, 'ID is required'),
  }),

  // Project ID parameter
  projectId: z.object({
    projectId: z.string().min(1, 'Project ID is required'),
  }),

  // Pagination query
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  // Report filter query
  reportFilter: z.object({
    projectId: z.string().optional(),
    source: z.enum(['widget', 'manual']).optional(),
    status: z.string().optional(), // comma-separated list
    priority: z.string().optional(), // comma-separated list
    assignedTo: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(REPORT_SORT_KEYS).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    after: z.string().min(1).max(2048).optional(),
  }),

  // Login request
  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),

  // Change password request
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  }),

  // Create user request
  createUser: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: z.enum(['admin', 'editor', 'viewer']).optional(),
  }),

  // Update user request
  updateUser: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    role: z.enum(['admin', 'editor', 'viewer']).optional(),
    isActive: z.boolean().optional(),
    defaultProjectIds: z.array(z.string().min(1, 'Project ID is required')).optional(),
  }),

  // Update profile request (for current user)
  updateProfile: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    email: z.string().email('Invalid email address').optional(),
    currentPassword: z.string().max(200).optional(),
  }),

  // Create project request
  createProject: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    settings: z.record(z.string(), z.unknown()).optional(),
  }),

  // Update project request
  updateProject: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
    settings: projectSettingsSchema.optional(),
    isActive: z.boolean().optional(),
  }),

  // Update report request
  updateReport: z.object({
    title: z.string().min(4).max(500).optional(),
    description: z.string().optional(),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
    assignedTo: z.string().nullable().optional(),
  }),

  moveReportOnBoard: z.object(boardMoveShape).strict(),

  moveReportsOnBoard: z
    .object({
      ...boardMoveShape,
      ids: z.array(z.string().min(1).max(64)).min(1).max(100),
    })
    .strict(),

  // Bulk update reports request
  bulkUpdateReports: z.object({
    ids: z.array(z.string()).min(1).max(100),
    updates: z.object({
      status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
      priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
      assignedTo: z.string().nullable().optional(),
    }),
  }),

  createManualReport: z.object({
    projectId: z.string().min(1, 'Project ID is required'),
    title: z.string().min(4, 'Title must be at least 4 characters').max(200),
    description: z.string().optional(),
    priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
    assignedTo: z.string().nullable().optional(),
    reporterName: z.string().optional(),
    reporterEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
    url: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .transform((value) => (typeof value === 'string' ? normalizeUrl(value) : value))
      .refine((value) => !value || isValidUrl(value), 'Invalid URL'),
    channel: z.enum(['email', 'chat', 'phone', 'qa', 'other']).optional(),
  }),

  // Create webhook request
  createWebhook: z.object({
    name: z.string().min(1, 'Name is required'),
    url: z.string().url('Invalid URL'),
    secret: z.string().optional(),
    events: z.array(webhookEventSchema).min(1).optional(),
  }),

  // Update webhook request
  updateWebhook: z.object({
    name: z.string().min(1).optional(),
    url: z.string().url().optional(),
    secret: z.string().optional(),
    events: z.array(webhookEventSchema).min(1).optional(),
    isActive: z.boolean().optional(),
  }),

  // Second login step: exactly one of an authenticator code or a recovery code
  twoFactorLogin: z
    .object({
      challengeToken: z.string().min(1).max(200),
      code: z.string().min(6).max(10).optional(),
      recoveryCode: z.string().min(10).max(20).optional(),
    })
    .refine((data) => (data.code === undefined) !== (data.recoveryCode === undefined), {
      message: 'Provide either code or recoveryCode',
    }),

  twoFactorPasskeyOptions: z.object({ challengeToken: z.string().min(1).max(200) }),
  twoFactorPasskeyLogin: z.object({
    challengeToken: z.string().min(1).max(200),
    response: webAuthnCredentialSchema,
  }),
  passkeyLogin: z.object({
    challengeId: z.string().min(1).max(200),
    response: webAuthnCredentialSchema,
  }),

  // Two-factor management
  twoFactorCode: z.object({ code: z.string().min(6).max(10) }),
  passwordConfirmation: z.object({ password: z.string().min(1).max(200) }),
  passkeyRegistration: z.object({
    response: webAuthnCredentialSchema,
    name: z.string().trim().max(100).optional(),
  }),
  passkeyRename: z.object({ name: z.string().trim().min(1).max(100) }),

  // Per-user Admin Console preferences; unknown keys are rejected
  updateUserPreferences: z
    .object({
      theme: z.enum(THEME_PREFERENCES).optional(),
      sidebarWidth: z.number().int().min(SIDEBAR_WIDTH_MIN).max(SIDEBAR_WIDTH_MAX).optional(),
      sidebarOpen: z.boolean().optional(),
      pinnedProjectsOpen: z.boolean().optional(),
      reportDetailsOpen: z.boolean().optional(),
      reportPageInfoOpen: z.boolean().optional(),
      reportEnvironmentOpen: z.boolean().optional(),
      reportMessagesOpen: z.boolean().optional(),
      dialogPreviewOpen: z.boolean().optional(),
      projectsPageSize: tablePageSizeSchema.optional(),
      reportsPageSize: tablePageSizeSchema.optional(),
      reportsView: z.enum(REPORT_VIEWS).optional(),
      reportsBoardCollapsed: z
        .array(z.enum(REPORT_STATUSES))
        .max(REPORT_STATUSES.length)
        .optional(),
      lastExport: z
        .object({ format: z.enum(EXPORT_FORMATS), action: z.enum(EXPORT_ACTIONS) })
        .strict()
        .optional(),
      editorLocale: z.enum(localeEnumValues).optional(),
      dismissedUpdateVersion: z.string().max(100).nullable().optional(),
      dismissedWidgetWarningId: z.string().max(200).nullable().optional(),
      seenAchievements: z.array(z.enum(ACHIEVEMENT_IDS)).max(ACHIEVEMENT_IDS.length).optional(),
    })
    .strict(),

  // Widget dialog colors; unknown keys, null and empty values are rejected
  widgetDialogColors: widgetDialogColorsSchema,

  // Update settings request
  updateSettings: z
    .object({
      invitationExpirationDays: z.number().int().min(1).max(365).optional(),
      widgetDialog: widgetDialogColorsSchema.optional(),
      widgetDialogContent: widgetDialogContentGlobalSchema.optional(),
      enforceHttps: z.boolean().optional(),
      twoFactorPolicy: z.enum(['off', 'admins', 'everyone']).optional(),
      passwordPolicy: z
        .object({
          minLength: z.number().int().min(8).max(128),
          requireUppercase: z.boolean(),
          requireLowercase: z.boolean(),
          requireNumber: z.boolean(),
          requireSymbol: z.boolean(),
        })
        .strict()
        .optional(),
      s3Enabled: z.boolean().optional(),
      s3Config: z
        .object({
          bucket: z.string().optional(),
          region: z.string().optional(),
          accessKeyId: z.string().optional(),
          secretAccessKey: z.string().optional(),
          endpoint: z.string().optional(),
        })
        .strict()
        .optional(),
      branding: z
        .object({
          primaryColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        })
        .strict()
        .optional(),
      adminButton: z
        .object({
          lightButtonColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          lightTextColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          lightButtonHoverColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          lightTextHoverColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          darkButtonColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          darkTextColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          darkButtonHoverColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          darkTextHoverColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        })
        .strict()
        .optional(),
      appName: z.string().min(1).max(100).optional(),
      appUrl: z.string().optional(),
      reporterPortalLimits: reporterPortalLimitsSchema.optional(),
      privacy: z
        .object({
          euPrivacyMode: z.boolean().optional(),
        })
        .strict()
        .optional(),
      diagnostics: z
        .object({
          activityCapture: z.boolean().optional(),
          consoleCapture: z.boolean().optional(),
          networkCapture: z.boolean().optional(),
          storageKeysCapture: z.boolean().optional(),
        })
        .strict()
        .optional(),
      widgetLauncherButton: widgetLauncherButtonGlobalSchema.optional(),
      smtpEnabled: z.boolean().optional(),
      smtpConfig: z
        .object({
          host: z.string().optional(),
          port: z.number().int().min(1).max(65535).optional(),
          user: z.string().optional(),
          password: z.string().optional(),
          from: z.string().optional(),
        })
        .strict()
        .optional(),
      notifications: z
        .object({
          emailEnabled: z.boolean().optional(),
          notifyOnNewReport: z.boolean().optional(),
          notifyOnStatusChange: z.boolean().optional(),
          notifyOnPriorityChange: z.boolean().optional(),
          notifyOnAssignment: z.boolean().optional(),
          notifyOnDeletion: z.boolean().optional(),
        })
        .optional(),
      reporterNotifications: z
        .object({
          emailEnabled: z.boolean().optional(),
          notifyOnNewReport: z.boolean().optional(),
          notifyOnStatusChange: z.boolean().optional(),
          notifyOnPriorityChange: z.boolean().optional(),
          notifyOnAssignment: z.boolean().optional(),
          messagingEnabled: z.boolean().optional(),
        })
        .optional(),
      retentionDays: z.number().int().min(0).max(3650).optional(),
      screenshot: z
        .object({
          useScreenCaptureAPI: z.boolean().optional(),
          maxScreenshotSize: z.number().int().min(1).max(50).optional(),
          maxImageUploadSizeMb: z.number().int().min(1).max(50).optional(),
          maxVideoUploadSizeMb: z.number().int().min(1).max(100).optional(),
          maxVideoUploadMbPerDay: z.number().int().min(0).max(1048576).optional(),
          enableScreenRecording: z.boolean().optional(),
          allowRecordingMicrophone: z.boolean().optional(),
          maxRecordingDurationSeconds: z.number().int().min(10).max(600).optional(),
          recordingQuality: z.enum(RECORDING_QUALITIES).optional(),
        })
        .optional(),
      rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
      sessionMaxAgeDays: z.number().int().min(1).max(365).optional(),
      updateCheckEnabled: z.boolean().optional(),
      language: projectLanguageSchema.optional(),
    })
    .strict(),

  // Create integration request
  createIntegration: z.object({
    projectId: z.string().min(1, 'Project ID is required'),
    type: z.enum(['github', 'jira', 'slack', 'linear', 'webhook']),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    config: integrationConfigSchema,
  }),

  // Update integration request
  updateIntegration: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
    config: integrationConfigSchema.optional(),
    isActive: z.boolean().optional(),
  }),

  // Integration query filter
  integrationQuery: z.object({
    projectId: z.string().optional(),
  }),

  // Forward report request
  forwardReport: z.object({
    labels: z.array(z.string()).optional(),
    assignees: z.array(z.string()).optional(),
  }),

  // Update user notification preferences
  updateNotificationPreferences: z.object({
    notifyOnNewReport: z.boolean().optional(),
    notifyOnStatusChange: z.boolean().optional(),
    notifyOnPriorityChange: z.boolean().optional(),
    notifyOnAssignment: z.boolean().optional(),
    notifyOnDeletion: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
  }),

  // Update project notification defaults
  updateProjectNotificationDefaults: z.object({
    defaultNotifyOnNewReport: z.boolean().optional(),
    defaultNotifyOnStatusChange: z.boolean().optional(),
    defaultNotifyOnPriorityChange: z.boolean().optional(),
    defaultNotifyOnAssignment: z.boolean().optional(),
    defaultNotifyOnDeletion: z.boolean().optional(),
    defaultEmailEnabled: z.boolean().optional(),
  }),

  // Set integration sync mode
  setSyncMode: z.object({
    syncMode: z.enum(['manual', 'automatic'], {
      error: 'syncMode must be "manual" or "automatic"',
    }),
  }),

  // Reorder projects request
  reorderProjects: z.object({
    projectIds: z
      .array(z.string().min(1, 'Project ID cannot be empty'))
      .min(1, 'At least one project ID is required'),
  }),

  // Invite user request
  inviteUser: z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: z.enum(['admin', 'editor', 'viewer']).optional(),
  }),

  // Reporter message request
  reporterMessage: z.object({
    message: z
      .string()
      .min(1, 'Message is required')
      .max(5000, 'Message must be at most 5000 characters'),
    ccSender: z.boolean().optional(),
  }),

  // Accept invitation request
  acceptInvitation: z.object({
    token: z.string().min(1, 'Token is required'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),

  // Token parameter
  token: z.object({
    token: z.string().min(1, 'Token is required'),
  }),

  apiAccess: z.object({ enabled: z.boolean() }),

  dashboardOverview: z.object({
    projectId: z.string().min(1).max(100).optional(),
    range: z.coerce.number().pipe(z.literal(DASHBOARD_RANGES)).optional().default(30),
    timeZone: z.string().max(100).optional(),
  }),

  dashboardTeam: z.object({
    period: z.enum(TEAM_PERIODS).optional().default('30d'),
  }),

  dashboardPersonal: z.object({
    timeZone: z.string().max(100).optional(),
  }),

  updateGamification: z
    .object({
      enabled: z.boolean().optional(),
      newUsersDefault: z.boolean().optional(),
      allowOptOut: z.boolean().optional(),
      showRanking: z.boolean().optional(),
      users: z.record(z.string().min(1).max(100), z.boolean()).optional(),
    })
    .strict(),

  gamificationOptOut: z.object({ optedOut: z.boolean() }).strict(),

  // Strength rules come from the password policy service
  temporaryPassword: z.object({ password: z.string().min(1, 'Password is required').max(200) }),

  completePasswordReset: z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(1, 'Password is required').max(200),
  }),
};
