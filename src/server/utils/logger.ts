type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

// Log level priority (lower number = more verbose)
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get log level based on environment
function getConfiguredLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  // debug in development, info in production
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

// Check if a log level should be output based on configured level
function shouldLog(level: LogLevel): boolean {
  const configuredLevel = getConfiguredLogLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const requestIdPart = entry.requestId ? ` [${entry.requestId}]` : '';
  const message = entry.message;
  const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `${prefix}${requestIdPart} ${message}${context}`;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  requestId?: string,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    requestId,
    context,
  };
}

// Request ID storage (using AsyncLocalStorage pattern for request context)
let currentRequestId: string | undefined;

export const logger = {
  /**
   * Set the current request ID for log correlation
   */
  setRequestId(requestId: string | undefined): void {
    currentRequestId = requestId;
  },

  /**
   * Get the current request ID
   */
  getRequestId(): string | undefined {
    return currentRequestId;
  },

  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    return getConfiguredLogLevel();
  },

  debug(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('debug')) {
      console.debug(formatLog(createLogEntry('debug', message, context, currentRequestId)));
    }
  },

  info(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('info')) {
      console.info(formatLog(createLogEntry('info', message, context, currentRequestId)));
    }
  },

  warn(message: string, context?: Record<string, unknown>): void {
    if (shouldLog('warn')) {
      console.warn(formatLog(createLogEntry('warn', message, context, currentRequestId)));
    }
  },

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (shouldLog('error')) {
      const errorContext =
        error instanceof Error
          ? { ...context, error: error.message, stack: error.stack }
          : error !== undefined
            ? { ...context, error: String(error) }
            : context;
      console.error(formatLog(createLogEntry('error', message, errorContext, currentRequestId)));
    }
  },

  /**
   * Create a child logger with additional context
   */
  child(baseContext: Record<string, unknown>) {
    return {
      debug: (message: string, context?: Record<string, unknown>) =>
        logger.debug(message, { ...baseContext, ...context }),
      info: (message: string, context?: Record<string, unknown>) =>
        logger.info(message, { ...baseContext, ...context }),
      warn: (message: string, context?: Record<string, unknown>) =>
        logger.warn(message, { ...baseContext, ...context }),
      error: (message: string, error?: Error | unknown, context?: Record<string, unknown>) =>
        logger.error(message, error, { ...baseContext, ...context }),
    };
  },
};
