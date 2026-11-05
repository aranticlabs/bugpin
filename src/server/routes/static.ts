import type { Context } from 'hono';
import { config } from '../config.js';
import { hasEEFeature } from '../utils/ee.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { resolvePathInside, resolveStaticPath } from '../utils/safe-path.js';

// Serve admin portal (static files) - handler for both /admin and /admin/*
export const serveAdmin = async (c: Context) => {
  let path = c.req.path.substring('/admin'.length);
  if (path === '' || path === '/') {
    path = '/index.html';
  }

  const filePath = resolveStaticPath(config.adminDir, path);
  if (!filePath) {
    return c.json({ success: false, error: 'NOT_FOUND', message: 'File not found' }, 404);
  }

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
      404
    );
  }

  return c.json({ success: false, error: 'NOT_FOUND', message: 'File not found' }, 404);
};

// Serve branding files (favicons, manifest, etc.)
// Checks custom uploads first, then falls back to default branding assets
export const serveBranding = async (c: Context) => {
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
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
    webmanifest: 'application/manifest+json',
    json: 'application/json',
  };
  const contentType = contentTypes[ext || ''] || 'application/octet-stream';

  if (hasEEFeature('custom-branding')) {
    let customPath = resolveStaticPath(config.brandingDir, filePath);
    const [mode, asset, extra] = filePath.split('/');
    if (
      !extra &&
      (mode === 'light' || mode === 'dark') &&
      /^(favicon-|apple-touch-icon-|android-chrome-)/.test(asset ?? '')
    ) {
      const settings = await settingsRepo.getAll();
      const version =
        mode === 'light'
          ? settings.branding.faviconLightVersion
          : settings.branding.faviconDarkVersion;
      if (/^[0-9a-f-]{36}$/.test(version))
        customPath = resolvePathInside(
          config.brandingDir,
          mode,
          `favicons-${version}`,
          asset ?? ''
        );
    }
    try {
      const customFile = customPath ? Bun.file(customPath) : null;
      if (customFile && (await customFile.exists())) {
        return new Response(customFile, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          },
        });
      }
    } catch {
      // Custom file not found, try default
    }
  }

  // Fallback to default branding assets
  const defaultPath = resolveStaticPath(config.defaultBrandingDir, filePath);
  try {
    const defaultFile = defaultPath ? Bun.file(defaultPath) : null;
    if (defaultFile && (await defaultFile.exists())) {
      return new Response(defaultFile, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    }
  } catch {
    // Default file not found
  }

  return c.json({ success: false, error: 'NOT_FOUND', message: 'Branding file not found' }, 404);
};
