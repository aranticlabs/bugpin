/** HTTP status for a failed service Result, by its error code */
export function errorStatus(code: string | undefined): 400 | 403 | 404 | 500 {
  if (!code) return 500;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND' || code.endsWith('_NOT_FOUND')) return 404;
  if (code.startsWith('INVALID_') || code === 'VALIDATION_ERROR') return 400;
  return 500;
}
