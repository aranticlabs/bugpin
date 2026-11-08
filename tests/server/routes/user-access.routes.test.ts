import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { usersRoutes } from '../../../src/server/routes/api/users';
import { passwordResetRoutes } from '../../../src/server/routes/api/password-reset';
import { authService } from '../../../src/server/services/auth.service';
import { userAccessService } from '../../../src/server/services/user-access.service';
import { passwordResetService } from '../../../src/server/services/password-reset.service';
import { Result } from '../../../src/server/utils/result';
import type { Session, User } from '../../../src/shared/types';

const admin: User = {
  id: 'usr_admin',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const session: Session = {
  id: 'sess_1',
  userId: admin.id,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalUserAccessService = { ...userAccessService };
const originalPasswordResetService = { ...passwordResetService };

let role: User['role'] = 'admin';
let calls: string[] = [];

function createApp() {
  const app = new Hono();
  app.route('/users', usersRoutes);
  app.route('/password-reset', passwordResetRoutes);
  return app;
}

function request(path: string, method: string, body?: unknown) {
  return createApp().request(`http://localhost${path}`, {
    method,
    headers: {
      cookie: 'session=sess_1',
      'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  role = 'admin';
  calls = [];
  authService.validateSession = async () =>
    Result.ok({ user: { ...admin, role }, session: { ...session } });
  userAccessService.setTemporaryPassword = async (id, password) => {
    calls.push(`temporary:${id}:${password}`);
    return password === 'weak' ? Result.fail('Too short', 'WEAK_PASSWORD') : Result.ok(undefined);
  };
  userAccessService.signOutEverywhere = async (id) => {
    calls.push(`sign-out:${id}`);
    return id === 'usr_missing' ? Result.fail('User not found', 'NOT_FOUND') : Result.ok(3);
  };
  passwordResetService.sendResetEmail = async (id) => {
    calls.push(`reset-email:${id}`);
    return Result.ok(undefined);
  };
  passwordResetService.validateToken = async (token) =>
    token === 'good'
      ? Result.ok({ email: 'user@example.com', name: 'User' })
      : Result.fail('This reset link is invalid or has expired', 'INVALID_TOKEN');
  passwordResetService.completeReset = async (token, password) => {
    calls.push(`complete:${token}:${password}`);
    return token === 'good'
      ? Result.ok(undefined)
      : Result.fail('This reset link is invalid or has expired', 'INVALID_TOKEN');
  };
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(userAccessService, originalUserAccessService);
  Object.assign(passwordResetService, originalPasswordResetService);
});

describe('admin user access routes', () => {
  it('sets a temporary password', async () => {
    const res = await request('/users/usr_2/temporary-password', 'POST', {
      password: 'temporary-pass-3',
    });
    expect(res.status).toBe(200);
    expect(calls).toEqual(['temporary:usr_2:temporary-pass-3']);
  });

  it('reports password policy failures', async () => {
    const res = await request('/users/usr_2/temporary-password', 'POST', { password: 'weak' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'WEAK_PASSWORD' });
  });

  it('sends a password reset email', async () => {
    const res = await request('/users/usr_2/password-reset-email', 'POST');
    expect(res.status).toBe(200);
    expect(calls).toEqual(['reset-email:usr_2']);
  });

  it('signs a user out everywhere', async () => {
    const res = await request('/users/usr_2/sessions', 'DELETE');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ended: 3 });
  });

  it('returns 404 for unknown users', async () => {
    const res = await request('/users/usr_missing/sessions', 'DELETE');
    expect(res.status).toBe(404);
  });

  it.each([
    ['/users/usr_2/temporary-password', 'POST', { password: 'temporary-pass-3' }],
    ['/users/usr_2/password-reset-email', 'POST', undefined],
    ['/users/usr_2/sessions', 'DELETE', undefined],
    ['/users/usr_2/api-access', 'PATCH', { enabled: true }],
    ['/users/usr_2/api-tokens', 'GET', undefined],
    ['/users/usr_2/api-tokens', 'DELETE', undefined],
  ])('keeps %s %s admin-only', async (path, method, body) => {
    role = 'editor';
    const res = await request(path, method, body);
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe('public password reset routes', () => {
  it('describes a valid link', async () => {
    const res = await createApp().request('http://localhost/password-reset/validate/good');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { email: 'user@example.com' } });
  });

  it('rejects an unknown link', async () => {
    const res = await createApp().request('http://localhost/password-reset/validate/bad');
    expect(res.status).toBe(404);
  });

  it('completes a reset without a session', async () => {
    const res = await createApp().request('http://localhost/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'good', password: 'replacement-password-2' }),
    });
    expect(res.status).toBe(200);
    expect(calls).toEqual(['complete:good:replacement-password-2']);
  });

  it('requires a token and a password', async () => {
    const res = await createApp().request('http://localhost/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'good' }),
    });
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
