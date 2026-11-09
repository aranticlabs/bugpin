import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { eventsRoutes } from '../../../src/server/routes/api/events';
import { realtimeService } from '../../../src/server/services/realtime.service';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { getDb } from '../../../src/server/database/database';
import { openPortalDatabase, portalOrigin } from './helpers';

let close: () => void;
let app: Hono;
let sessionId: string;
let readers: { cancel(): Promise<void> }[];

beforeEach(async () => {
  close = await openPortalDatabase();
  getDb().run(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES ('staff', 'staff@example.com', 'hash', 'Staff', 'admin')"
  );
  sessionId = (
    await sessionsRepo.create({ userId: 'staff', expiresAt: '2099-01-01T00:00:00.000Z' })
  ).id;
  app = new Hono();
  app.route('/api/events', eventsRoutes);
  readers = [];
});
afterEach(async () => {
  for (const reader of readers) await reader.cancel().catch(() => {});
  mock.restore();
  close();
});

async function open() {
  const response = await app.request(`${portalOrigin}/api/events`, {
    headers: { Cookie: `session=${sessionId}` },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  const reader = response.body!.getReader();
  readers.push(reader);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(': connected');
  return reader;
}

function captureHeartbeat() {
  const interval = globalThis.setInterval;
  let heartbeat: () => Promise<void> = async () => {
    throw new Error('Missing heartbeat');
  };
  spyOn(globalThis, 'setInterval').mockImplementation(((
    callback: Parameters<typeof setInterval>[0],
    delay?: number
  ) => {
    expect(delay).toBe(25000);
    heartbeat = async () => {
      await callback();
    };
    return interval(() => {}, delay);
  }) as typeof setInterval);
  return () => heartbeat();
}

it('accepts only staff session cookies, including when Bearer and cookie are supplied together', async () => {
  const credentials: Record<string, string>[] = [
    {},
    { Cookie: 'bugpin_reporter_session=other' },
    { Authorization: 'Bearer token' },
    { Authorization: 'Bearer token', Cookie: `session=${sessionId}` },
  ];
  for (const headers of credentials) {
    expect((await app.request(`${portalOrigin}/api/events`, { headers })).status).toBe(401);
  }
  await open();
});

it('publishes ordered invalidation hints without content and releases a disconnected subscription', async () => {
  const reader = await open();
  realtimeService.publish('message.created', { reportId: 'report', projectId: 'project' });
  realtimeService.publish('reporter_activity.changed', {
    reportId: 'report',
    projectId: 'project',
  });
  const first = new TextDecoder().decode((await reader.read()).value);
  const second = new TextDecoder().decode((await reader.read()).value);
  expect(first).toBe(
    'event: message.created\ndata: {"reportId":"report","projectId":"project"}\n\n'
  );
  expect(second).toBe(
    'event: reporter_activity.changed\ndata: {"reportId":"report","projectId":"project"}\n\n'
  );
  await reader.cancel();
  const next = await open();
  realtimeService.publish('report.updated', { reportId: 'next', projectId: 'project' });
  expect(new TextDecoder().decode((await next.read()).value)).toContain('"reportId":"next"');
});

it('enforces the per-session stream limit and frees the slot on disconnect', async () => {
  const settings = await settingsCacheService.getAll();
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...settings.reporterPortalLimits, sseStreamsPerSession: 1 },
  });
  settingsCacheService.invalidate();
  const reader = await open();
  const denied = await app.request(`${portalOrigin}/api/events`, {
    headers: { Cookie: `session=${sessionId}` },
  });
  expect(denied.status).toBe(429);
  await reader.cancel();
  await open();
});

for (const state of ['revoked', 'expired', 'disabled', 'deleted', 'password-change'] as const) {
  it(`closes a ${state} staff stream on the next heartbeat`, async () => {
    const pulse = captureHeartbeat();
    const reader = await open();
    if (state === 'revoked') await sessionsRepo.delete(sessionId);
    if (state === 'expired')
      getDb().run("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [
        sessionId,
      ]);
    if (state === 'disabled') getDb().run("UPDATE users SET is_active = 0 WHERE id = 'staff'");
    if (state === 'deleted') getDb().run("DELETE FROM users WHERE id = 'staff'");
    if (state === 'password-change')
      getDb().run("UPDATE users SET must_change_password = 1 WHERE id = 'staff'");
    await pulse();
    expect((await reader.read()).done).toBe(true);
  });
}

it('sends heartbeat comments after successful session revalidation', async () => {
  const pulse = captureHeartbeat();
  const reader = await open();
  await pulse();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(': heartbeat\n\n');
});

it('disconnects when a heartbeat remains blocked at the next tick without event traffic', async () => {
  const pulse = captureHeartbeat();
  const reader = await open();
  await pulse();
  const pending = pulse();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pulse();
  await pending;
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(': heartbeat\n\n');
  expect((await reader.read()).done).toBe(true);
});

it('disconnects and frees the session slot when an event write stalls without further traffic', async () => {
  const settings = await settingsCacheService.getAll();
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...settings.reporterPortalLimits, sseStreamsPerSession: 1 },
  });
  settingsCacheService.invalidate();
  const pulse = captureHeartbeat();
  const reader = await open();
  realtimeService.publish('report.updated', { reportId: 'buffered', projectId: 'project' });
  realtimeService.publish('report.updated', { reportId: 'blocked', projectId: 'project' });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pulse();
  const occupied = await app.request(`${portalOrigin}/api/events`, {
    headers: { Cookie: `session=${sessionId}` },
  });
  expect(occupied.status).toBe(429);
  await pulse();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"reportId":"buffered"');
  expect((await reader.read()).done).toBe(true);
  await open();
});

it('disconnects a slow reader once its hint queue is full and releases the subscription', async () => {
  const settings = await settingsCacheService.getAll();
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...settings.reporterPortalLimits, sseStreamsPerSession: 1 },
  });
  settingsCacheService.invalidate();
  await open();
  for (let index = 0; index < 40; index++)
    realtimeService.publish('report.updated', {
      reportId: `report-${index}`,
      projectId: 'project',
    });
  await open();
});

it('keeps a real Bun stream alive beyond the server idle timeout', async () => {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', idleTimeout: 1, fetch: app.fetch });
  try {
    const response = await fetch(new URL('/api/events', server.url), {
      headers: { Cookie: `session=${sessionId}` },
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    readers.push(reader);
    await reader.read();
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    realtimeService.publish('report.updated', { reportId: 'after-idle', projectId: 'project' });
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('after-idle');
    await reader.cancel();
  } finally {
    await server.stop(true);
  }
});
