import { Hono, Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { httpsEnforcement } from './middleware/https-enforcement.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

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

  // CORS configuration
  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Allow requests from any origin in development
        if (config.isDev) {
          return origin;
        }
        // In production, allow same-origin and configured origins
        if (!origin) {
          return null; // Same-origin requests
        }
        // Allow configured origins
        const allowedOrigins = config.corsOrigins;
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return origin;
        }
        return null;
      },
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      maxAge: 86400, // 24 hours
    }),
  );

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

  // Serve admin portal (static files) - handler for both /admin and /admin/*
  const serveAdmin = async (c: Context) => {
    let path = c.req.path.substring('/admin'.length);
    if (path === '' || path === '/') {
      path = '/index.html';
    }

    const filePath = `${config.adminDir}${path}`;

    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        // Set content type based on extension
        const ext = path.split('.').pop()?.toLowerCase();
        const contentTypes: Record<string, string> = {
          html: 'text/html',
          js: 'application/javascript',
          css: 'text/css',
          json: 'application/json',
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          svg: 'image/svg+xml',
          ico: 'image/x-icon',
        };
        const contentType = contentTypes[ext || ''] || 'application/octet-stream';

        return new Response(file, {
          headers: { 'Content-Type': contentType },
        });
      }

      // For non-asset paths, fallback to index.html for SPA routing
      if (!path.includes('.')) {
        const indexFile = Bun.file(`${config.adminDir}/index.html`);
        if (await indexFile.exists()) {
          return new Response(indexFile, {
            headers: { 'Content-Type': 'text/html' },
          });
        }
      }
    } catch {
      // File not found
    }

    // In development, suggest running the admin dev server
    if (config.isDev) {
      return c.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message:
            'Admin not built. Run "bun run build:admin" or "bun run dev:admin" for development.',
        },
        404,
      );
    }

    return c.json({ success: false, error: 'NOT_FOUND', message: 'File not found' }, 404);
  };
  app.all('/admin', serveAdmin);
  app.all('/admin/*', serveAdmin);

  // Serve branding files (favicons, manifest, etc.)
  // Checks custom uploads first, then falls back to default branding assets
  const serveBranding = async (c: Context) => {
    // Handle both /branding/* and /admin/branding/* paths
    let filePath = c.req.path;
    if (filePath.startsWith('/admin/branding/')) {
      filePath = filePath.substring('/admin/branding/'.length);
    } else {
      filePath = filePath.substring('/branding/'.length);
    }

    // Handle dynamic site.webmanifest generation
    if (filePath.endsWith('site.webmanifest')) {
      const mode = filePath.includes('light/') ? 'light' : 'dark';
      const manifest = {
        name: 'BugPin',
        short_name: 'BugPin',
        icons: [
          {
            src: `/branding/${mode}/android-chrome-192x192-${mode}.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `/branding/${mode}/android-chrome-512x512-${mode}.png`,
            sizes: '512x512',
            type: 'image/png',
          },
        ],
        theme_color: mode === 'dark' ? '#18181b' : '#ffffff',
        background_color: mode === 'dark' ? '#18181b' : '#ffffff',
        display: 'standalone',
      };
      return c.json(manifest);
    }

    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      png: 'image/png',
      ico: 'image/x-icon',
      svg: 'image/svg+xml',
      webmanifest: 'application/manifest+json',
      json: 'application/json',
    };
    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    // Try custom uploads first
    const customPath = `${config.brandingDir}/${filePath}`;
    try {
      const customFile = Bun.file(customPath);
      if (await customFile.exists()) {
        return new Response(customFile, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400', // 24 hours
          },
        });
      }
    } catch {
      // Custom file not found, try default
    }

    // Fallback to default branding assets
    const defaultPath = `${config.defaultBrandingDir}/${filePath}`;
    try {
      const defaultFile = Bun.file(defaultPath);
      if (await defaultFile.exists()) {
        return new Response(defaultFile, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400', // 24 hours
          },
        });
      }
    } catch {
      // Default file not found
    }

    return c.json({ success: false, error: 'NOT_FOUND', message: 'Branding file not found' }, 404);
  };
  app.get('/branding/*', serveBranding);
  app.get('/admin/branding/*', serveBranding);

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
