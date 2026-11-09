import { Hono, Context, Next } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { requestBodyLimit } from './middleware/body-limit.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { httpsEnforcement } from './middleware/https-enforcement.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { widgetCors } from './middleware/cors.js';
import { serveAdmin, serveBranding } from './routes/static.js';

// Extend Hono context with request ID
declare module 'hono' {
  interface ContextVariableMap {
    requestId: string;
  }
}

export function createApp(): Hono {
  const app = new Hono();

  // Global Middleware

  // HTTPS enforcement (must be first to redirect before other processing)
  app.use('*', httpsEnforcement);

  // Security headers (with exception for widget.js to allow cross-origin loading)
  app.use('*', async (c, next) => {
    // Skip secure headers for widget.js to allow custom CORS
    if (c.req.path === '/widget.js') {
      return next();
    }
    return secureHeaders({
      permissionsPolicy: {
        displayCapture: ['self'],
      },
    })(c, next);
  });

  // Request ID middleware - adds unique ID to each request for tracing
  app.use('*', async (c: Context, next: Next) => {
    const requestId = c.req.header('x-request-id') || crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);

    // Set request ID in logger for correlation
    logger.setRequestId(requestId);

    try {
      await next();
    } finally {
      // Clear request ID after request completes
      logger.setRequestId(undefined);
    }
  });

  // Request logging (development only)
  if (config.isDev) {
    app.use('*', honoLogger());
  }

  // CORS applies to the public widget API only; every other route stays same-origin
  app.use('/api/widget/*', widgetCors);

  app.use('*', requestBodyLimit);

  // Routes

  // Health check
  app.get('/health', (c) => {
    return c.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: config.version,
    });
  });

  // API routes
  const apiRouter = createApiRouter();
  app.route('/api', apiRouter);

  // Admin Console and branding assets (static files)
  app.get('/branding/*', serveBranding);
  app.get('/admin/branding/*', serveBranding);
  app.all('/admin', serveAdmin);
  app.all('/admin/*', serveAdmin);

  // Serve widget script
  app.get('/widget.js', async (c) => {
    const filePath = `${config.widgetDir}/widget.js`;

    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=3600', // 1 hour
            'Access-Control-Allow-Origin': '*', // Allow widget to be loaded from any domain
            'Cross-Origin-Resource-Policy': 'cross-origin',
          },
        });
      }
    } catch {
      // File not found
    }

    return c.json({ success: false, error: 'NOT_FOUND', message: 'Widget not found' }, 404);
  });

  // Root redirect
  app.get('/', (c) => {
    if (config.isProd) {
      return c.redirect('/admin/');
    }
    return c.json({
      success: true,
      message: 'BugPin API Server',
      version: config.version,
      docs: '/api',
    });
  });

  // Error Handling

  // Global error handler
  app.onError(errorHandler);

  // 404 handler
  app.notFound(notFoundHandler);

  return app;
}
