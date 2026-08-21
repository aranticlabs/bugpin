import type { MiddlewareHandler } from 'hono';
import { z, ZodSchema } from 'zod';
import { isValidUrl, normalizeUrl } from '../utils/validators.js';
import { SUPPORTED_LOCALES } from '@shared/types';

const localeEnumValues = SUPPORTED_LOCALES as readonly [string, ...string[]];

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

const positionEnum = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']);
const buttonShapeEnum = z.enum(['rectangle', 'round']);
const themeEnum = z.enum(['auto', 'light', 'dark']);
const hexColor = z.string();
const nullableString = z.string().nullable();

const launcherButtonCommonFields = {
  position: positionEnum.optional(),
  buttonShape: buttonShapeEnum.optional(),
  buttonIcon: nullableString.optional(),
  buttonIconSize: z.number().optional(),
  buttonIconStroke: z.number().optional(),
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
    darkButtonColor: hexColor.optional(),
    darkTextColor: hexColor.optional(),
    darkButtonHoverColor: hexColor.optional(),
    darkTextHoverColor: hexColor.optional(),
    darkBackgroundColor: hexColor.optional(),
    darkSecondaryColor: hexColor.optional(),
    darkInputColor: hexColor.optional(),
    darkForegroundColor: hexColor.optional(),
  })
  .strict();

const projectScreenshotSchema = z
  .object({
    useScreenCaptureAPI: z.boolean().optional(),
    maxScreenshotSize: z.number().int().min(1).max(50).optional(),
    maxImageUploadSizeMb: z.number().int().min(1).max(50).optional(),
    maxVideoUploadSizeMb: z.number().int().min(1).max(500).optional(),
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

const projectSettingsSchema = z
  .object({
    defaultAssigneeUserId: z.string().nullable().optional(),
    language: projectLanguageSchema.optional(),
    widgetLauncherButton: widgetLauncherButtonProjectSchema.optional(),
    widgetDialog: widgetDialogColorsSchema.optional(),
    screenshot: projectScreenshotSchema.optional(),
    security: projectSecuritySchema.optional(),
    branding: projectBrandingSchema.optional(),
    fields: projectFieldsSchema.optional(),
    notifyReporter: z.boolean().optional(),
    reporterNotifications: projectReporterNotificationsSchema.optional(),
    widget: projectLegacyWidgetSchema.optional(),
  })
  .strict();

const globalLocalizedTextField = z.union([z.null(), localizedStringSchema]);

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
    sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'status', 'priority']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
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
    events: z.array(z.string()).optional(),
  }),

  // Update webhook request
  updateWebhook: z.object({
    name: z.string().min(1).optional(),
    url: z.string().url().optional(),
    secret: z.string().optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),

  // Update settings request
  updateSettings: z.object({
    appName: z.string().min(1).max(100).optional(),
    appUrl: z.string().optional(),
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
        maxVideoUploadSizeMb: z.number().int().min(1).max(500).optional(),
      })
      .optional(),
    maxScreenshotSizeMb: z.number().int().min(1).max(50).optional(),
    maxImageUploadSizeMb: z.number().int().min(1).max(50).optional(),
    maxVideoUploadSizeMb: z.number().int().min(1).max(500).optional(),
    rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
    sessionMaxAgeDays: z.number().int().min(1).max(365).optional(),
    updateCheckEnabled: z.boolean().optional(),
    language: projectLanguageSchema.optional(),
  }),

  // Create integration request
  createIntegration: z.object({
    projectId: z.string().min(1, 'Project ID is required'),
    type: z.enum(['github', 'jira', 'slack', 'linear', 'webhook']),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    config: z.record(z.string(), z.unknown()),
  }),

  // Update integration request
  updateIntegration: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
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
};
