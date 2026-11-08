import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { reporterMessagesRoutes } from '../../../src/server/routes/api/reporter-messages';
import { reportMessagesService } from '../../../src/server/services/report-messages.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
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
  authorKind: 'staff',
  reporterId: null,
  authorName: 'Admin User',
  files: [],
  hiddenAt: null,
  message: 'We are looking into this.',
  sentAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalReportMessagesService = { ...reportMessagesService };

let userRole: User['role'] = 'admin';

beforeEach(() => {
  userRole = 'admin';
  reportMessagesService.uploadBodyLimit = async () => Result.ok(1024 * 1024);
  reportMessagesService.setHidden = async () => Result.ok(baseMessage);

  authService.validateSession = async () =>
    Result.ok({
      user: { ...baseUser, role: userRole },
      session: baseSession,
    });

  reportMessagesService.send = async (_reportId, _userId, _message) => Result.ok(baseMessage);

  reportMessagesService.listByReport = async () => Result.ok([baseMessage]);
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(reportMessagesService, originalReportMessagesService);
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
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when service returns NOT_FOUND', async () => {
    reportMessagesService.send = async () => Result.fail('Report not found', 'NOT_FOUND');

    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: 'Hello' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when service returns NO_REPORTER_EMAIL', async () => {
    reportMessagesService.send = async () => Result.fail('No reporter email', 'NO_REPORTER_EMAIL');

    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
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
    reportMessagesService.listByReport = async () => Result.ok([]);
    const app = createApp();
    const res = await app.request('http://localhost/reports/rpt_1/reporter-messages', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages).toHaveLength(0);
  });
});

describe('message uploads and moderation', () => {
  it('parses multipart text, files and the CC flag', async () => {
    let received: Parameters<typeof reportMessagesService.send> | undefined;
    reportMessagesService.send = async (...args) => {
      received = args;
      return Result.ok(baseMessage);
    };
    const form = new FormData();
    form.set('message', ' A reply ');
    form.set('ccSender', 'false');
    form.append('files[]', new File(['image'], 'picture.png', { type: 'image/png' }));
    const response = await createApp().request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: form,
    });
    expect(response.status).toBe(200);
    expect(received?.slice(0, 4)).toEqual(['rpt_1', 'usr_1', 'A reply', false]);
    expect(received?.[4]).toEqual([
      { filename: 'picture.png', mimeType: 'image/png', data: Buffer.from('image') },
    ]);
  });

  it('accepts a multipart file without text', async () => {
    const form = new FormData();
    form.append('files[]', new File(['image'], 'picture.png', { type: 'image/png' }));
    expect(
      (
        await createApp().request('http://localhost/reports/rpt_1/reporter-messages', {
          method: 'POST',
          headers: { cookie: 'session=sess_1' },
          body: form,
        })
      ).status
    ).toBe(200);
  });

  it('rejects a sixth file before calling the service', async () => {
    let sent = false;
    reportMessagesService.send = async () => {
      sent = true;
      return Result.ok(baseMessage);
    };
    const form = new FormData();
    form.set('message', 'Reply');
    for (let i = 0; i < 6; i++)
      form.append('files[]', new File(['image'], `${i}.png`, { type: 'image/png' }));
    const response = await createApp().request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: form,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'INVALID_FILE' });
    expect(sent).toBe(false);
  });

  it('bounds streamed multipart bodies without trusting Content-Length', async () => {
    reportMessagesService.uploadBodyLimit = async () => Result.ok(16);
    const form = new FormData();
    form.set('message', 'Reply');
    const request = new Request('http://localhost/reports/rpt_1/reporter-messages', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: form,
    });
    request.headers.delete('content-length');
    const response = await createApp().request(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects malformed JSON and invalid multipart booleans', async () => {
    const app = createApp();
    expect(
      (
        await app.request('http://localhost/reports/rpt_1/reporter-messages', {
          method: 'POST',
          headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
          body: '{',
        })
      ).status
    ).toBe(400);
    const form = new FormData();
    form.set('message', 'Reply');
    form.set('ccSender', 'yes');
    expect(
      (
        await app.request('http://localhost/reports/rpt_1/reporter-messages', {
          method: 'POST',
          headers: { cookie: 'session=sess_1' },
          body: form,
        })
      ).status
    ).toBe(400);
  });

  it('maps daily quota failure to 413', async () => {
    reportMessagesService.send = async () => Result.fail('Limit reached', 'UPLOAD_QUOTA_EXCEEDED');
    expect(
      (
        await createApp().request('http://localhost/reports/rpt_1/reporter-messages', {
          method: 'POST',
          headers: { cookie: 'session=sess_1', 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'Reply' }),
        })
      ).status
    ).toBe(413);
  });

  for (const action of ['hide', 'unhide']) {
    for (const role of ['admin', 'editor', 'viewer'] as const) {
      it(`${role} ${role === 'viewer' ? 'cannot' : 'can'} ${action} messages`, async () => {
        userRole = role;
        const response = await createApp().request(
          `http://localhost/reports/rpt_1/reporter-messages/msg_1/${action}`,
          {
            method: 'POST',
            headers: { cookie: 'session=sess_1' },
          }
        );
        expect(response.status).toBe(role === 'viewer' ? 403 : 200);
      });
    }
    it(`rejects reporter cookies on ${action}`, async () => {
      const response = await createApp().request(
        `http://localhost/reports/rpt_1/reporter-messages/msg_1/${action}`,
        {
          method: 'POST',
          headers: { cookie: 'bugpin_reporter_session=reporter' },
        }
      );
      expect(response.status).toBe(401);
    });
  }
  it('rejects reporter cookies on staff read and send endpoints', async () => {
    const app = createApp();
    for (const method of ['GET', 'POST']) {
      expect(
        (
          await app.request('http://localhost/reports/rpt_1/reporter-messages', {
            method,
            headers: { cookie: 'bugpin_reporter_session=reporter' },
          })
        ).status
      ).toBe(401);
    }
  });
});
