import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from '../../../../src/server/node_modules/hono/dist/index.js';
import { authService } from '../../../../src/server/services/auth.service';
import { Result } from '../../../../src/server/utils/result';
import type { Session, User } from '../../../../src/shared/types';

// Mock EE module to ensure requireEEFeature returns 402
const eeUrl = new URL('../../../../src/server/utils/ee.js', import.meta.url).href;
mock.module(eeUrl, () => ({
  isEEAvailable: () => false,
  hasEEFeature: () => false,
  requireEEFeature: () => async (c: { json: (data: unknown, status: number) => Response }) => {
    return c.json(
      {
        error: 'Enterprise Edition required',
        code: 'EE_REQUIRED',
        feature: 's3-storage',
        upgradeUrl: 'https://bugpin.io/pricing',
      },
      402,
    );
  },
}));

// Import routes after mocking
const { storageRoutes } = await import('../../../../src/server/routes/api/storage');

const baseUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const viewerUser: User = {
  ...baseUser,
  id: 'usr_2',
  email: 'viewer@example.com',
  name: 'Viewer',
  role: 'viewer',
};

const baseSession: Session = {
  id: 'sess_1',
  userId: 'usr_1',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };

let currentUser = baseUser;

beforeEach(() => {
  currentUser = baseUser;

  authService.validateSession = async () =>
    Result.ok({
      user: currentUser,
      session: baseSession,
    });
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
});

function createApp() {
  const app = new Hono();
  app.route('/storage', storageRoutes);
  return app;
}

describe('storage routes (CE stub - returns 402)', () => {
  describe('GET /storage/stats', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/storage/stats', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
      expect(body.upgradeUrl).toBe('https://bugpin.io/pricing');
    });

    it('returns 403 for viewer before EE check', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request('http://localhost/storage/stats', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /storage/migration/status', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/storage/migration/status', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });

    it('returns 403 for viewer before EE check', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request('http://localhost/storage/migration/status', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /storage/migrate', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/storage/migrate', {
        method: 'POST',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });

    it('returns 403 for viewer before EE check', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request('http://localhost/storage/migrate', {
        method: 'POST',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /storage/migrate/cancel', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/storage/migrate/cancel', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });

    it('returns 403 for viewer before EE check', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request('http://localhost/storage/migrate/cancel', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /storage/s3/test', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/storage/s3/test', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });

    it('returns 403 for viewer before EE check', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request('http://localhost/storage/s3/test', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(403);
    });
  });
});
