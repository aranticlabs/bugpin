import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { authRoutes } from '../../../src/server/routes/api/auth';
import { authService } from '../../../src/server/services/auth.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { Result } from '../../../src/server/utils/result';
import type { AppSettings, Session, User } from '../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'user@example.com',
  name: 'User',
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
const originalSettingsRepo = { ...settingsRepo };

const originalSettingsCacheGetAll = settingsCacheService.getAll;

beforeEach(() => {
  settingsCacheService.getAll = async () => ({ appUrl: 'http://localhost' }) as AppSettings;
  authService.login = async () => Result.ok({ user: baseUser, session: baseSession });
  authService.logout = async () => Result.ok(undefined);
  authService.changePassword = async () => Result.ok(undefined);
  authService.validateSession = async () => Result.ok({ user: baseUser, session: baseSession });

  settingsRepo.getAll = async () =>
    ({
      appName: 'BugPin',
      appUrl: '',
      retentionDays: 90,
      rateLimitPerMinute: 10,
      sessionMaxAgeDays: 7,
      smtpEnabled: false,
      smtpConfig: {},
      s3Enabled: false,
      s3Config: {},
    }) as AppSettings;
});

afterEach(() => {
  settingsCacheService.getAll = originalSettingsCacheGetAll;
  Object.assign(authService, originalAuthService);
  Object.assign(settingsRepo, originalSettingsRepo);
});

function createApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

describe('auth routes', () => {
  it('logs in and sets session cookie', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') || '').toContain('session=');
  });

  it('returns 401 on failed login', async () => {
    authService.login = async () => Result.fail('Invalid', 'INVALID_CREDENTIALS');
    const app = createApp();
    const res = await app.request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'bad' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns current user when authenticated', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/auth/me', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authenticated: boolean };
    expect(body.authenticated).toBe(true);
  });

  it('logs out and clears cookie', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/auth/logout', {
      method: 'POST',
      headers: { cookie: 'session=sess_1', origin: 'http://localhost' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') || '').toContain('session=');
  });

  it('changes password for authenticated user', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/auth/change-password', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ currentPassword: 'old', newPassword: 'newpassword' }),
    });
    expect(res.status).toBe(200);
  });
});
