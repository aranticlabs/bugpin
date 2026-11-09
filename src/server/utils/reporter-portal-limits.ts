import { z } from 'zod';
import { DEFAULT_REPORTER_PORTAL_LIMITS as defaults } from '@shared/types';

export const reporterPortalLimitsSchema = z
  .object({
    loginRequestsPerEmailPer15Min: z
      .number()
      .int()
      .min(1)
      .max(defaults.loginRequestsPerEmailPer15Min * 10),
    loginRequestsPerIpPer15Min: z
      .number()
      .int()
      .min(1)
      .max(defaults.loginRequestsPerIpPer15Min * 10),
    loginExchangesPerIpPer15Min: z
      .number()
      .int()
      .min(1)
      .max(defaults.loginExchangesPerIpPer15Min * 10),
    messagesPerReporterPerMinute: z
      .number()
      .int()
      .min(1)
      .max(defaults.messagesPerReporterPerMinute * 10),
    messagesPerReporterPerDay: z
      .number()
      .int()
      .min(1)
      .max(defaults.messagesPerReporterPerDay * 10),
    submissionsPerReporterPerHour: z
      .number()
      .int()
      .min(1)
      .max(defaults.submissionsPerReporterPerHour * 10),
    submissionsPerReporterPerDay: z
      .number()
      .int()
      .min(1)
      .max(defaults.submissionsPerReporterPerDay * 10),
    sseStreamsPerSession: z.number().int().min(1).max(10),
    uploadMbPerReporterPerDay: z
      .number()
      .int()
      .min(1)
      .max(defaults.uploadMbPerReporterPerDay * 10),
  })
  .strict()
  .partial();
