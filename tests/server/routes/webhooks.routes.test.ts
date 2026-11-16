import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type { Session, User } from '../../../src/shared/types';

// Mock EE module to ensure requireEEFeature returns 402. The real exports stay in place
// because the mock is process-wide and other test files import the rest of the module.
const eeUrl = new URL('../../../src/server/utils/ee.js', import.meta.url).href;
// mock.module replaces the module for every later test file, so keep its other exports.
const realEE = { ...(await import(eeUrl)) };
mock.module(eeUrl, () => ({
  ...realEE,
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
      402
    );
  },
}));

// The routes module builds its EE middleware when it loads, so another test file that
// imported it first would keep the real one. The query string loads a separate instance
// that picks up the mock above.
const webhooksModulePath = '../../../src/server/routes/api/webhooks';
const { webhooksRoutes }: typeof import('../../../src/server/routes/api/webhooks') = await import(
  `${webhooksModulePath}?ce-stub`
);

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
      expect(body).toHaveProperty('code', 'EE_REQUIRED');
      expect(body).toHaveProperty('upgradeUrl', 'https://bugpin.io/pricing');
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
      expect(body).toHaveProperty('code', 'EE_REQUIRED');
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
      expect(body).toHaveProperty('code', 'EE_REQUIRED');
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
      expect(body).toHaveProperty('code', 'EE_REQUIRED');
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
      expect(body).toHaveProperty('code', 'EE_REQUIRED');
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
      expect(body).toHaveProperty('code', 'EE_REQUIRED');
    });
  });
});
