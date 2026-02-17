import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../../src/server/node_modules/hono/dist/index.js';
import { settingsRoutes } from '../../../../src/server/routes/api/settings';
import { settingsService } from '../../../../src/server/services/settings.service';
import { emailService } from '../../../../src/server/services/email.service';
import { authService } from '../../../../src/server/services/auth.service';
import { Result } from '../../../../src/server/utils/result';
import type { Session, User } from '../../../../src/shared/types';

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
const originalSettingsService = { ...settingsService };
const originalEmailService = { ...emailService };

beforeEach(() => {
  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });

  settingsService.getAll = async () => Result.ok({ appName: 'BugPin' } as never);
  settingsService.update = async () => Result.ok({ appName: 'BugPin' } as never);

  emailService.sendTestEmail = async () => ({ success: true });
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(settingsService, originalSettingsService);
  Object.assign(emailService, originalEmailService);
});

function createApp() {
  const app = new Hono();
  app.route('/settings', settingsRoutes);
  return app;
}

describe('settings routes', () => {
  it('returns settings for admin', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when settings fetch fails', async () => {
    settingsService.getAll = async () => Result.fail('Nope', 'FETCH_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('updates settings', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ appName: 'BugPin' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when settings update fails', async () => {
    settingsService.update = async () => Result.fail('Nope', 'UPDATE_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ appName: 'BugPin' }),
    });
    expect(res.status).toBe(400);
  });

  it('validates test email payload', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/settings/test-email', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('handles SMTP errors', async () => {
    emailService.sendTestEmail = async () => ({ success: false, error: 'SMTP down' });
    const app = createApp();
    const res = await app.request('http://localhost/settings/test-email', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        smtpConfig: {
          host: 'smtp.example.com',
          port: 587,
          from: 'test@example.com',
        },
        testEmail: 'recipient@example.com',
        appName: 'BugPin',
      }),
    });
    expect(res.status).toBe(400);
  });

  it('sends test email', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/settings/test-email', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        smtpConfig: {
          host: 'smtp.example.com',
          port: 587,
          from: 'test@example.com',
        },
        testEmail: 'recipient@example.com',
        appName: 'BugPin',
      }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 500 when test email throws', async () => {
    emailService.sendTestEmail = async () => {
      throw new Error('Boom');
    };
    const app = createApp();
    const res = await app.request('http://localhost/settings/test-email', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        smtpConfig: {
          host: 'smtp.example.com',
          port: 587,
          from: 'test@example.com',
        },
        testEmail: 'recipient@example.com',
        appName: 'BugPin',
      }),
    });
    expect(res.status).toBe(500);
  });
});
