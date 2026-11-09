export function errorStatus(
  code: string | undefined
): 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 502 {
  if (!code) return 500;
  if (code === 'UNAUTHORIZED') return 401;
  if (['REPORT_CLOSED', 'CONFIRMATION_REQUIRED', 'PORTAL_PREREQUISITES_MISSING'].includes(code))
    return 409;
  if (['UPLOAD_QUOTA_EXCEEDED', 'VIDEO_QUOTA_EXCEEDED', 'PAYLOAD_TOO_LARGE'].includes(code))
    return 413;
  if (code === 'MESSAGING_DISABLED') return 403;
  if (code === 'RATE_LIMITED') return 429;
  if (['FORBIDDEN', 'REPORTER_SUSPENDED', 'PROJECT_NOT_LICENSED'].includes(code)) return 403;
  if (code === 'EMAIL_DELIVERY_FAILED') return 502;
  if (code === 'NOT_FOUND' || code.endsWith('_NOT_FOUND')) return 404;
  if (code.startsWith('INVALID_') || code === 'VALIDATION_ERROR' || code === 'NO_REPORTER_EMAIL')
    return 400;
  return 500;
}
