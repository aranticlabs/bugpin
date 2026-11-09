import { PortalApiError } from '../api/client';
import type { Catalog } from './catalog';

export function errorKey(error: unknown): keyof Catalog {
  const messages: Record<string, keyof Catalog> = {
    REPORT_CLOSED: 'reportClosed',
    MESSAGING_DISABLED: 'messagingOff',
    INVALID_FILE: 'invalidFiles',
    UPLOAD_QUOTA_EXCEEDED: 'uploadQuota',
    VIDEO_QUOTA_EXCEEDED: 'uploadQuota',
    PAYLOAD_TOO_LARGE: 'uploadTooLarge',
    RATE_LIMITED: 'rateLimited',
    NOT_FOUND: 'notFound',
    VALIDATION_ERROR: 'invalidForm',
  };
  return error instanceof PortalApiError
    ? (messages[error.code] ?? 'requestFailed')
    : 'requestFailed';
}
