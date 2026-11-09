/** HTTP status for a failed service Result, by its error code */
export function errorStatus(code: string | undefined): 400 | 403 | 404 | 500 | 502 {
  if (!code) return 500;
  if (code === 'FORBIDDEN' || code === 'REPORTER_SUSPENDED') return 403;
  if (code === 'EMAIL_DELIVERY_FAILED') return 502;
  if (code === 'NOT_FOUND' || code.endsWith('_NOT_FOUND')) return 404;
  if (code.startsWith('INVALID_') || code === 'VALIDATION_ERROR' || code === 'PROJECT_NOT_LICENSED')
    return 400;
  return 500;
}

export function reportMessageErrorStatus(
  code: string | undefined
): 400 | 401 | 403 | 404 | 409 | 413 | 500 {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
    case 'PROJECT_NOT_LICENSED':
    case 'MESSAGING_DISABLED':
      return 403;
    case 'CONFIRMATION_REQUIRED':
    case 'REPORT_CLOSED':
      return 409;
    case 'UPLOAD_QUOTA_EXCEEDED':
    case 'VIDEO_QUOTA_EXCEEDED':
    case 'PAYLOAD_TOO_LARGE':
      return 413;
    case 'MESSAGE_WRITE_FAILED':
      return 500;
    default:
      return 400;
  }
}
