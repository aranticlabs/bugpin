import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { reporterMessagesRoutes } from '../../../src/server/routes/api/reporter-messages';
import { reporterMessagesService } from '../../../src/server/services/reporter-messages.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type { AppSettings } from '../../../src/shared/types';
import type { Session, User, ReporterMessage } from '../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin User',
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

const baseMessage: ReporterMessage = {
  id: 'msg_1',
  reportId: 'rpt_1',
  userId: 'usr_1',
  userName: 'Admin User',
  message: 'We are looking into this.',
  sentAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalReporterMessagesService = { ...reporterMessagesService };

let userRole: User['role'] = 'admin';

const originalSettingsCacheGetAll = settingsCacheService.getAll;

beforeEach(() => {
  settingsCacheService.getAll = async () => ({ appUrl: 'http://localhost' }) as AppSettings;
  userRole = 'admin';

  authService.validateSession = async () =>
    Result.ok({
      user: { ...baseUser, role: userRole },
      session: baseSession,
    });

  reporterMessagesService.send = async (_reportId, _userId, _message) => Result.ok(baseMessage);

  reporterMessagesService.listByReport = async () => Result.ok([baseMessage]);
});

afterEach(() => {
  settingsCacheService.getAll = originalSettingsCacheGetAll;
  Object.assign(authService, originalAuthService);
  Object.assign(reporterMessagesService, originalReporterMessagesService);
});

function createApp() {
  const app = new Hono();
  app.route('/reports', reporterMessagesRoutes);
  return app;
}

describe('reporter-messages routes POST', () => {
  it('creates message and returns it', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'We are looking into this.' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; reporterMessage: { id: string } };
    expect(body.success).toBe(true);
    expect(body.reporterMessage.id).toBe('msg_1');
  });

  it('returns 400 with empty message', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when service returns NOT_FOUND', async () => {
    reporterMessagesService.send = async () => Result.fail('Report not found', 'NOT_FOUND');

    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when service returns NO_REPORTER_EMAIL', async () => {
    reporterMessagesService.send = async () =>
      Result.fail('No reporter email', 'NO_REPORTER_EMAIL');

    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello' }),
    });
    expect(res.status).toBe(400);
  });

  it('blocks viewer from posting messages', async () => {
    userRole = 'viewer';
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows editor to post messages', async () => {
    userRole = 'editor';
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'We are looking into this.' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('reporter-messages routes GET', () => {
  it('returns messages list', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; messages: { id: string }[] };
    expect(body.success).toBe(true);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe('msg_1');
  });

  it('allows viewer to list messages', async () => {
    userRole = 'viewer';
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns empty array when no messages', async () => {
    reporterMessagesService.listByReport = async () => Result.ok([]);
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toHaveLength(0);
  });
});
