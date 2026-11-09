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
