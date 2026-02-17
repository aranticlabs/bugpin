import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { brandingService } from '../../../src/server/services/branding.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type { Session, User } from '../../../src/shared/types';

// Mock EE module to ensure requireEEFeature returns 402 for admin branding routes
const eeUrl = new URL('../../../src/server/utils/ee.js', import.meta.url).href;
mock.module(eeUrl, () => ({
  isEEAvailable: () => false,
  hasEEFeature: () => false,
  requireEEFeature: () => async (c: { json: (data: unknown, status: number) => Response }) => {
    return c.json(
      {
        error: 'Enterprise Edition required',
        code: 'EE_REQUIRED',
        feature: 'custom-branding',
        upgradeUrl: 'https://bugpin.io/pricing',
      },
      402,
    );
  },
}));

// Import routes after mocking
const brandingRoutes = (await import('../../../src/server/routes/api/branding')).default;

const baseUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseSession: Session = {
  id: 'sess_1',
  userId: 'usr_1',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalBrandingService = { ...brandingService };

beforeEach(() => {
  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });

  brandingService.updateWidgetPrimaryColors = async () => Result.ok(undefined);
  brandingService.getBrandingConfig = async () =>
    Result.ok({
      primaryColor: '#000000',
      logoLightUrl: null,
      logoDarkUrl: null,
      iconLightUrl: null,
      iconDarkUrl: null,
      faviconLightVersion: 'v1',
      faviconDarkVersion: 'v1',
      adminThemeColors: { primary: '#000000', hover: '#111111' } as never,
      widgetPrimaryColors: { primary: '#000000', hover: '#111111' } as never,
    });
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(brandingService, originalBrandingService);
});

function createApp() {
  const app = new Hono();
  app.route('/branding', brandingRoutes);
  return app;
}

describe('branding routes - CE features (should work)', () => {
  describe('GET /branding/config', () => {
    it('returns branding config without auth', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/config');
      expect(res.status).toBe(200);
    });

    it('returns 500 when branding config fetch fails', async () => {
      brandingService.getBrandingConfig = async () => Result.fail('GET_FAILED', 'GET_FAILED');
      const app = createApp();
      const res = await app.request('http://localhost/branding/config');
      expect(res.status).toBe(500);
    });

    it('returns 500 when branding config throws', async () => {
      brandingService.getBrandingConfig = async () => {
        throw new Error('Boom');
      };
      const app = createApp();
      const res = await app.request('http://localhost/branding/config');
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /branding/widget-primary-colors', () => {
    it('updates widget primary colors', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/widget-primary-colors', {
        method: 'PUT',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ primary: '#123456', hover: '#654321' }),
      });
      expect(res.status).toBe(200);
    });

    it('returns 400 when widget primary colors update fails', async () => {
      brandingService.updateWidgetPrimaryColors = async () =>
        Result.fail('UPDATE_FAILED', 'UPDATE_FAILED');
      const app = createApp();
      const res = await app.request('http://localhost/branding/widget-primary-colors', {
        method: 'PUT',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ primary: '#123456', hover: '#654321' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 500 when widget primary colors update throws', async () => {
      brandingService.updateWidgetPrimaryColors = async () => {
        throw new Error('Boom');
      };
      const app = createApp();
      const res = await app.request('http://localhost/branding/widget-primary-colors', {
        method: 'PUT',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ primary: '#123456', hover: '#654321' }),
      });
      expect(res.status).toBe(500);
    });
  });
});

describe('branding routes - EE features (returns 402)', () => {
  describe('POST /branding/logo/:mode', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const formData = new FormData();
      formData.append('file', new File(['logo'], 'logo.png', { type: 'image/png' }));
      const res = await app.request('http://localhost/branding/logo/light', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
        body: formData,
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('POST /branding/favicon/:mode', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const formData = new FormData();
      formData.append('file', new File(['favicon'], 'favicon.png', { type: 'image/png' }));
      const res = await app.request('http://localhost/branding/favicon/light', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
        body: formData,
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('POST /branding/icon/:mode', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const formData = new FormData();
      formData.append('file', new File(['icon'], 'icon.png', { type: 'image/png' }));
      const res = await app.request('http://localhost/branding/icon/light', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
        body: formData,
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('PUT /branding/primary-color', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/primary-color', {
        method: 'PUT',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ color: '#123456' }),
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('PUT /branding/admin-theme-colors', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/admin-theme-colors', {
        method: 'PUT',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ primary: '#123456', hover: '#654321' }),
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('DELETE /branding/logo/:mode', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/logo/light', {
        method: 'DELETE',
        headers: { cookie: 'session=sess_1' },
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('DELETE /branding/icon/:mode', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/icon/light', {
        method: 'DELETE',
        headers: { cookie: 'session=sess_1' },
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('DELETE /branding/favicon/:mode', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/favicon/light', {
        method: 'DELETE',
        headers: { cookie: 'session=sess_1' },
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('POST /branding/reset', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/branding/reset', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
      });
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });
});
