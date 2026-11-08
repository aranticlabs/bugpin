import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { gamificationRoutes } from '../../../src/server/routes/api/gamification';
import {
  gamificationService,
  type UpdateGamificationInput,
} from '../../../src/server/services/gamification.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type {
  GamificationSelf,
  GamificationSettings,
  Session,
  User,
} from '../../../src/shared/types';

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

const settings: GamificationSettings = {
  enabled: true,
  newUsersDefault: true,
  allowOptOut: true,
  showRanking: true,
  users: [],
};

const self: GamificationSelf = { available: true, canOptOut: true, optedOut: false, active: true };

const originalAuthService = { ...authService };
const originalGamificationService = { ...gamificationService };

let lastUpdate: UpdateGamificationInput | undefined;
let lastOptOut: boolean | undefined;

function asRole(role: User['role']) {
  authService.validateSession = async () =>
    Result.ok({ user: { ...baseUser, role }, session: baseSession });
}

function request(method: string, path: string, body?: unknown, cookie = 'session=sess_1') {
  const app = new Hono();
  app.route('/gamification', gamificationRoutes);
  return app.request(`http://localhost/gamification${path}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  lastUpdate = undefined;
  lastOptOut = undefined;
  asRole('admin');
  gamificationService.getSettings = async () => Result.ok(settings);
  gamificationService.update = async (input) => {
    lastUpdate = input;
    return Result.ok({ ...settings, ...input, users: [] });
  };
  gamificationService.getSelf = async () => Result.ok(self);
  gamificationService.setOptOut = async (_user, optedOut) => {
    lastOptOut = optedOut;
    return Result.ok({ ...self, optedOut, active: !optedOut });
  };
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(gamificationService, originalGamificationService);
});

describe('gamification routes', () => {
  it('returns 401 without a session', async () => {
    const res = await request('GET', '', undefined, '');
    expect(res.status).toBe(401);
  });

  it('returns the workspace settings to admins', async () => {
    const res = await request('GET', '');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, gamification: settings });
  });

  for (const role of ['editor', 'viewer'] as const) {
    it(`rejects GET and PUT for ${role}s`, async () => {
      asRole(role);
      expect((await request('GET', '')).status).toBe(403);
      expect((await request('PUT', '', { enabled: false })).status).toBe(403);
      expect(lastUpdate).toBeUndefined();
    });
  }

  it('updates the workspace settings', async () => {
    const res = await request('PUT', '', { enabled: false, users: { usr_2: false } });
    expect(res.status).toBe(200);
    expect(lastUpdate).toEqual({ enabled: false, users: { usr_2: false } });
  });

  it('rejects unknown keys and wrong types on PUT', async () => {
    expect((await request('PUT', '', { enabled: 'yes' })).status).toBe(400);
    expect((await request('PUT', '', { ranking: true })).status).toBe(400);
    expect((await request('PUT', '', { users: { usr_2: 'on' } })).status).toBe(400);
    expect(lastUpdate).toBeUndefined();
  });

  it('returns 404 when the update names an unknown user', async () => {
    gamificationService.update = async () => Result.fail('User usr_x not found', 'NOT_FOUND');
    const res = await request('PUT', '', { users: { usr_x: true } });
    expect(res.status).toBe(404);
  });

  it('returns the signed-in user state from GET /me for every role', async () => {
    asRole('viewer');
    const res = await request('GET', '/me');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, gamification: self });
  });

  it('lets a user opt out', async () => {
    asRole('editor');
    const res = await request('PATCH', '/me', { optedOut: true });
    expect(res.status).toBe(200);
    expect(lastOptOut).toBe(true);
  });

  it('rejects PATCH /me when opting out is not allowed', async () => {
    gamificationService.setOptOut = async () =>
      Result.fail('Gamification cannot be changed for this account', 'FORBIDDEN');
    const res = await request('PATCH', '/me', { optedOut: true });
    expect(res.status).toBe(403);
  });

  it('validates the PATCH /me body', async () => {
    expect((await request('PATCH', '/me', {})).status).toBe(400);
    expect((await request('PATCH', '/me', { optedOut: 'yes' })).status).toBe(400);
    expect((await request('PATCH', '/me', { optedOut: true, extra: 1 })).status).toBe(400);
    expect(lastOptOut).toBeUndefined();
  });
});
