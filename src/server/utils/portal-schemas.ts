import { z } from 'zod';
import { REPORT_STATUSES, SUPPORTED_LOCALES } from '@shared/types';

export const portalReportQuerySchema = z
  .object({
    projectId: z.string().min(1).max(200).optional(),
    status: z.enum(REPORT_STATUSES).optional(),
    groupByStatus: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    cursor: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict()
  .refine((input) => !input.groupByStatus || !input.cursor || input.status !== undefined, {
    message: 'A board cursor requires a status',
    path: ['cursor'],
  });

export type PortalReportQuery = z.output<typeof portalReportQuerySchema>;

export const portalCursorSchema = z
  .object({
    updatedAt: z
      .string()
      .max(40)
      .refine((value) => Number.isFinite(Date.parse(value))),
    id: z.string().min(1).max(200),
  })
  .strict();

export type PortalReportCursor = z.output<typeof portalCursorSchema>;

export const portalProfileSchema = z
  .object({
    displayName: z
      .string()
      .transform((value) =>
        value
          .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '')
          .normalize('NFC')
          .trim()
      )
      .pipe(z.string().min(1).max(80))
      .optional(),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    emailUpdates: z.boolean().optional(),
  })
  .strict();
