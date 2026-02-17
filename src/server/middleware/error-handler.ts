import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// Error Handler

/**
 * Global error handler for Hono
 * Use with app.onError(errorHandler)
 */
export function errorHandler(error: Error, c: Context): Response {
  // Handle Hono HTTP exceptions
  if (error instanceof HTTPException) {
    const status = error.status;
    const message = error.message || 'An error occurred';

    logger.warn('HTTP exception', { status, message, path: c.req.path });

    return c.json(
      {
        success: false,
        error: getErrorCode(status),
        message,
      },
      status,
    );
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    logger.warn('Validation error', { path: c.req.path, details });

    return c.json(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
      400,
    );
  }

  // Handle JSON parse errors
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    logger.warn('JSON parse error', { path: c.req.path, message: error.message });

    return c.json(
      {
        success: false,
        error: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
      400,
    );
  }

  // Log unexpected errors
  logger.error('Unhandled error', error, { path: c.req.path, method: c.req.method });

  // In development, include error details
  if (config.isDev) {
    return c.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
        stack: error.stack,
      },
      500,
    );
  }

  // In production, hide error details
  return c.json(
    {
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    500,
  );
}

/**
 * Not found handler
 * Use with app.notFound(notFoundHandler)
 */
export function notFoundHandler(c: Context): Response {
  return c.json(
    {
      success: false,
      error: 'NOT_FOUND',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404,
  );
}

/**
 * Get error code from HTTP status
 */
function getErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_ALLOWED';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 500:
      return 'INTERNAL_ERROR';
    case 502:
      return 'BAD_GATEWAY';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'ERROR';
  }
}
