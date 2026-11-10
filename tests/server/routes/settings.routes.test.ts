import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { settingsRoutes } from '../../../src/server/routes/api/settings';
import { settingsService } from '../../../src/server/services/settings.service';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { emailService } from '../../../src/server/services/email.service';
import { authService } from '../../../src/server/services/auth.service';
import { cleanupService } from '../../../src/server/services/cleanup.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { Result } from '../../../src/server/utils/result';
import type { AppSettings, Session, User } from '../../../src/shared/types';

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
const originalCleanupService = { ...cleanupService };
const originalSettingsRepo = { ...settingsRepo };

let storedSettings: AppSettings;

function settingsWithSecrets(): AppSettings {
  return {
    appName: 'BugPin',
    appUrl: 'http://localhost',
    portalBaseUrl: '',
    smtpEnabled: true,
    smtpConfig: {
      host: 'smtp.example.com',
      port: 587,
      user: 'mailer',
      password: 'stored-secret',
      from: 'bugs@example.com',
    },
    s3Enabled: false,
    s3Config: { bucket: 'bucket', accessKeyId: 'AKIA', secretAccessKey: 'stored-key' },
  } as AppSettings;
}

function asRole(role: User['role']) {
  authService.validateSession = async () =>
    Result.ok({ user: { ...baseUser, role }, session: baseSession });
}

function jsonRequest(method: string, body: unknown, cookie = 'session=sess_1'): RequestInit {
  return {
    method,
    headers: { cookie, origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const originalSettingsCacheGetAll = settingsCacheService.getAll;

beforeEach(() => {
  settingsCacheService.getAll = async () => ({ ...storedSettings, appUrl: 'http://localhost' });
  authService.validateSession = async () =>
    Result.ok({
      user: baseUser,
      session: baseSession,
    });

  settingsService.getAll = async () => Result.ok({ appName: 'BugPin' } as never);
  settingsService.getAllRedacted = async () => Result.ok({ appName: 'BugPin' } as never);
  settingsService.update = async () => Result.ok({ appName: 'BugPin' } as never);
  cleanupService.deleteAllReports = async () => ({ deleted: 0, errors: 0 });
  storedSettings = settingsWithSecrets();
  settingsRepo.getAll = async () => storedSettings;

  emailService.sendTestEmail = async () => ({ success: true });
});

afterEach(() => {
  settingsCacheService.getAll = originalSettingsCacheGetAll;
  Object.assign(authService, originalAuthService);
  Object.assign(settingsService, originalSettingsService);
  Object.assign(emailService, originalEmailService);
  Object.assign(cleanupService, originalCleanupService);
  Object.assign(settingsRepo, originalSettingsRepo);
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

  it('reports the Application URL and the request origin as BugPin derives it', async () => {
    settingsCacheService.getAll = async () => ({
      ...storedSettings,
      appUrl: 'https://bugs.example.com',
    });
    const app = createApp();
    const res = await app.request(
      'http://localhost/settings/address-check',
      {
        headers: {
          cookie: 'session=sess_1',
          host: 'bugs.example.com',
          'x-forwarded-proto': 'https',
        },
      },
      { requestIP: () => ({ address: '203.0.113.7' }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      appUrl: 'https://bugs.example.com',
      requestOrigin: 'http://bugs.example.com',
      requiredTrustProxy: 'true',
    });
  });

  it('refuses the address check to non-admins', async () => {
    asRole('editor');
    const app = createApp();
    const res = await app.request('http://localhost/settings/address-check', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 500 when settings fetch fails', async () => {
    settingsService.getAllRedacted = async () => Result.fail('Nope', 'FETCH_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(500);
  });

  it('updates settings', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ appName: 'BugPin' }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts strict privacy settings and rejects invalid values', async () => {
    const app = createApp();
    const accepted = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        privacy: {
          euPrivacyMode: true,
        },
      }),
    });
    expect(accepted.status).toBe(200);

    const rejected = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ privacy: { euPrivacyMode: 'yes' } }),
    });
    expect(rejected.status).toBe(400);
  });

  it('accepts diagnostics defaults and rejects unknown categories', async () => {
    const app = createApp();
    const accepted = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ diagnostics: { networkCapture: false, storageKeysCapture: true } }),
    });
    expect(accepted.status).toBe(200);

    const rejected = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ diagnostics: { screenCapture: true } }),
    });
    expect(rejected.status).toBe(400);
  });

  it('returns 400 when the settings service rejects the values', async () => {
    settingsService.update = async () => Result.fail('Nope', 'INVALID_SMTP_CONFIG');
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ appName: 'BugPin' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 500 when settings update fails unexpectedly', async () => {
    settingsService.update = async () => Result.fail('Nope', 'UPDATE_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      method: 'PUT',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ appName: 'BugPin' }),
    });
    expect(res.status).toBe(500);
  });

  it('validates test email payload', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/settings/test-email', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
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
        origin: 'http://localhost',
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
        origin: 'http://localhost',
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
        origin: 'http://localhost',
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

  it('rejects the read-only secret flags on PUT', async () => {
    const app = createApp();
    const smtp = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', { smtpConfig: { host: 'smtp.example.com', passwordSet: true } })
    );
    expect(smtp.status).toBe(400);

    const s3 = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', { s3Config: { bucket: 'bucket', secretAccessKeySet: true } })
    );
    expect(s3.status).toBe(400);
  });

  it('rejects the removed top-level upload size keys', async () => {
    const app = createApp();
    const res = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', { maxScreenshotSizeMb: 10 })
    );
    expect(res.status).toBe(400);
  });

  it('validates widget colors as #RRGGBB hex', async () => {
    const app = createApp();
    const accepted = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', {
        widgetDialog: { lightBackgroundColor: '#FFFFFF' },
        widgetLauncherButton: { lightButtonColor: '#02658d' },
      })
    );
    expect(accepted.status).toBe(200);

    for (const color of ['', 'red', '#fff', '#12345', '#02658D80', 'transparent']) {
      const rejected = await app.request(
        'http://localhost/settings',
        jsonRequest('PUT', { widgetLauncherButton: { lightButtonColor: color } })
      );
      expect(rejected.status).toBe(400);
    }

    const unknownKey = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', { widgetDialog: { primary: '#123456' } })
    );
    expect(unknownKey.status).toBe(400);
  });

  it('accepts a partial dialog content payload', async () => {
    const app = createApp();
    const res = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', { widgetDialogContent: { showPriority: false, title: null } })
    );
    expect(res.status).toBe(200);
  });

  it('never returns stored secrets from GET', async () => {
    settingsService.getAllRedacted = originalSettingsService.getAllRedacted;
    const app = createApp();
    const res = await app.request('http://localhost/settings', {
      headers: { cookie: 'session=sess_1' },
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('stored-secret');
    expect(text).not.toContain('stored-key');
    const body = JSON.parse(text) as { settings: AppSettings };
    expect(body.settings.smtpConfig.passwordSet).toBe(true);
    expect(body.settings.s3Config.secretAccessKeySet).toBe(true);
  });

  it('never returns stored secrets from PUT', async () => {
    settingsService.update = originalSettingsService.update;
    settingsRepo.updateAll = async (updates) => ({ ...storedSettings, ...updates });
    const app = createApp();
    const res = await app.request(
      'http://localhost/settings',
      jsonRequest('PUT', { smtpConfig: { port: 2525, password: '' } })
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('stored-secret');
    const body = JSON.parse(text) as { settings: AppSettings };
    expect(body.settings.smtpConfig.passwordSet).toBe(true);
    expect(body.settings.smtpConfig.port).toBe(2525);
  });

  it('sends a test email with the stored password when none is given', async () => {
    let usedPassword: string | undefined;
    emailService.sendTestEmail = async (config) => {
      usedPassword = config.password;
      return { success: true };
    };
    const app = createApp();
    const res = await app.request(
      'http://localhost/settings/test-email',
      jsonRequest('POST', {
        smtpConfig: {
          host: 'smtp.example.com',
          port: 587,
          user: 'mailer',
          password: '',
          from: 'bugs@example.com',
        },
        testEmail: 'recipient@example.com',
      })
    );

    expect(res.status).toBe(200);
    expect(usedPassword).toBe('stored-secret');
  });

  describe('DELETE /settings/data', () => {
    it('rejects a missing or wrong confirmation without deleting anything', async () => {
      let calls = 0;
      cleanupService.deleteAllReports = async () => {
        calls++;
        return { deleted: 1, errors: 0 };
      };
      const app = createApp();

      const missing = await app.request(
        'http://localhost/settings/data',
        jsonRequest('DELETE', {})
      );
      expect(missing.status).toBe(400);
      const wrong = await app.request(
        'http://localhost/settings/data',
        jsonRequest('DELETE', { confirmation: 'yes' })
      );
      expect(wrong.status).toBe(400);
      expect(calls).toBe(0);
    });

    it('deletes every report', async () => {
      cleanupService.deleteAllReports = async () => ({ deleted: 4, errors: 0 });
      const app = createApp();
      const res = await app.request(
        'http://localhost/settings/data',
        jsonRequest('DELETE', { confirmation: 'delete' })
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, deleted: 4 });
    });

    it('returns 500 DELETE_DATA_INCOMPLETE when some reports could not be deleted', async () => {
      cleanupService.deleteAllReports = async () => ({ deleted: 3, errors: 2 });
      const app = createApp();
      const res = await app.request(
        'http://localhost/settings/data',
        jsonRequest('DELETE', { confirmation: 'delete' })
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        success: false,
        error: 'DELETE_DATA_INCOMPLETE',
        message: 'Deleted 3 reports, but 2 could not be deleted',
        deleted: 3,
        errors: 2,
      });
    });

    it('returns 500 when the deletion throws', async () => {
      cleanupService.deleteAllReports = async () => {
        throw new Error('disk gone');
      };
      const app = createApp();
      const res = await app.request(
        'http://localhost/settings/data',
        jsonRequest('DELETE', { confirmation: 'delete' })
      );

      expect(res.status).toBe(500);
    });
  });
});

describe('settings routes permissions', () => {
  const requests: Array<{ name: string; path: string; init: () => RequestInit }> = [
    { name: 'GET /settings', path: '/settings', init: () => ({ method: 'GET' }) },
    {
      name: 'PUT /settings',
      path: '/settings',
      init: () => jsonRequest('PUT', { appName: 'BugPin' }),
    },
    {
      name: 'POST /settings/test-email',
      path: '/settings/test-email',
      init: () =>
        jsonRequest('POST', {
          smtpConfig: { host: 'smtp.example.com', port: 587, from: 'bugs@example.com' },
          testEmail: 'recipient@example.com',
        }),
    },
    {
      name: 'DELETE /settings/data',
      path: '/settings/data',
      init: () => jsonRequest('DELETE', { confirmation: 'delete' }),
    },
  ];

  for (const request of requests) {
    it(`returns 401 for ${request.name} without a session`, async () => {
      const init = request.init();
      const headers = new Headers(init.headers);
      headers.delete('cookie');
      const res = await createApp().request(`http://localhost${request.path}`, {
        ...init,
        headers,
      });
      expect(res.status).toBe(401);
    });

    for (const role of ['viewer', 'editor'] as const) {
      it(`returns 403 for ${request.name} as ${role}`, async () => {
        let deleted = false;
        cleanupService.deleteAllReports = async () => {
          deleted = true;
          return { deleted: 1, errors: 0 };
        };
        asRole(role);
        const init = request.init();
        const res = await createApp().request(`http://localhost${request.path}`, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init.headers)),
            cookie: 'session=sess_1',
            origin: 'http://localhost',
          },
        });
        expect(res.status).toBe(403);
        expect(deleted).toBe(false);
      });
    }
  }
});
