import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';
import { createApp } from '../../src/server/app';
import { projectsService } from '../../src/server/services/projects.service';
import { authService } from '../../src/server/services/auth.service';
import { reportMessagesService } from '../../src/server/services/report-messages.service';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import {
  MAX_REQUEST_BODY_SIZE,
  MAX_SUBMISSION_REQUEST_BODY_SIZE,
} from '../../src/server/utils/request-limits';
import { Result } from '../../src/server/utils/result';
import type { AppSettings, Project } from '../../src/shared/types';

const originalSettings = settingsCacheService.getAll;
const originalAuth = authService.validateSession;
const originalWidgetAccess = projectsService.validateWidgetAccess;
const originalMessages = { ...reportMessagesService };

beforeEach(() => {
  settingsCacheService.getAll = async () =>
    ({ enforceHttps: false, rateLimitPerMinute: 10 }) as AppSettings;
});

afterEach(() => {
  settingsCacheService.getAll = originalSettings;
  authService.validateSession = originalAuth;
  projectsService.validateWidgetAccess = originalWidgetAccess;
  Object.assign(reportMessagesService, originalMessages);
});

for (const [path, method, contentType] of [
  ['/api/widget/submit', 'POST', 'multipart/form-data'],
  ['/api/reports', 'POST', 'multipart/form-data'],
  ['/api/users/me/avatar', 'POST', 'multipart/form-data'],
  ['/api/settings', 'PATCH', 'application/json'],
  ['/api/reports/report/reporter-messages/message/hide', 'POST', 'application/json'],
  ['/api/reports/report/reporter-messages', 'PUT', 'multipart/form-data'],
]) {
  it(`preserves the original ceiling on ${method} ${path}`, async () => {
    expect(MAX_SUBMISSION_REQUEST_BODY_SIZE).toBe(256 * 1024 * 1024);
    expect(MAX_REQUEST_BODY_SIZE).toBeGreaterThan(MAX_SUBMISSION_REQUEST_BODY_SIZE);
    const response = await createApp().request(path, {
      method,
      headers: {
        'content-type': contentType,
        'content-length': String(MAX_SUBMISSION_REQUEST_BODY_SIZE + 1),
      },
      body: 'x',
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
  });
}

it('rejects a streamed public widget request above the old budget without Content-Length', async () => {
  projectsService.validateWidgetAccess = async () =>
    Result.ok({ id: 'project', settings: {} } as Project);
  const chunk = new Uint8Array(1024 * 1024);
  let produced = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced++ < 257) controller.enqueue(chunk);
      else controller.close();
    },
  });
  const response = await createApp().request('/api/widget/submit', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-api-key': 'widget' },
  });
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ error: 'PAYLOAD_TOO_LARGE' });
});

for (const path of [
  '/api/reports',
  '/api/users/me/avatar',
  '/api/reports/report/reporter-messages/message/hide',
]) {
  it(`rejects an unauthenticated streamed request to ${path} before consuming it`, async () => {
    let reads = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 }
    );
    const response = await createApp().request(path, {
      method: 'POST',
      body,
      headers: { 'content-type': 'multipart/form-data' },
    });
    expect(response.status).toBe(401);
    expect(reads).toBe(0);
    expect(cancelled).toBe(true);
  });
}

it('reserves the larger allowance for the authenticated staff message POST', async () => {
  authService.validateSession = async () =>
    Result.ok({
      user: {
        id: 'staff',
        email: 'staff@example.test',
        name: 'Staff',
        role: 'editor',
        isActive: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      session: {
        id: 'session',
        userId: 'staff',
        createdAt: '2026-01-01',
        lastActivityAt: '2026-01-01',
        expiresAt: '2099-01-01',
      },
    });
  reportMessagesService.uploadBodyLimit = async () => Result.ok(300 * 1024 * 1024);
  const send = spyOn(reportMessagesService, 'send').mockResolvedValue(
    Result.ok({
      id: 'message',
      reportId: 'report',
      userId: 'staff',
      authorKind: 'staff',
      reporterId: null,
      authorName: 'Staff',
      message: 'Reply',
      createdAt: '2026-01-01',
      sentAt: '2026-01-01',
      files: [],
      hiddenAt: null,
    })
  );
  try {
    const form = new FormData();
    form.set('message', 'Reply');
    const request = new Request('http://localhost/api/reports/report/reporter-messages', {
      method: 'POST',
      body: form,
      headers: {
        cookie: 'session=session',
        'content-length': String(MAX_SUBMISSION_REQUEST_BODY_SIZE + 1),
      },
    });
    const response = await createApp().request(request);
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    request.headers.delete('cookie');
    const denied = await createApp().request(
      new Request(request.url, {
        method: 'POST',
        body: 'x',
        headers: request.headers,
      })
    );
    expect(denied.status).toBe(401);
  } finally {
    send.mockRestore();
  }
});
