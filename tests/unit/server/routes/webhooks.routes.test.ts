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
        feature: 'webhooks',
        upgradeUrl: 'https://bugpin.io/pricing',
      },
      402,
    );
  },
}));

// Import routes after mocking
const { webhooksRoutes } = await import('../../../../src/server/routes/api/webhooks');

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

beforeEach(() => {
  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
});

function createApp() {
  const app = new Hono();
  app.route('/webhooks', webhooksRoutes);
  return app;
}

describe('webhooks routes (CE stub - returns 402)', () => {
  describe('GET /webhooks', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/webhooks', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
      expect(body.upgradeUrl).toBe('https://bugpin.io/pricing');
    });
  });

  describe('GET /webhooks/:id', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/webhooks/whk_1', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('POST /webhooks', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/webhooks?projectId=prj_1', {
        method: 'POST',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Webhook',
          url: 'https://example.com/new',
          events: ['report.created'],
        }),
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('PATCH /webhooks/:id', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/webhooks/whk_1', {
        method: 'PATCH',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Webhook',
        }),
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('DELETE /webhooks/:id', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/webhooks/whk_1', {
        method: 'DELETE',
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });

  describe('POST /webhooks/:id/test', () => {
    it('returns 402 when EE not available', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/webhooks/whk_1/test', {
        method: 'POST',
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.code).toBe('EE_REQUIRED');
    });
  });
});
