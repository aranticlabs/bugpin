import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { portalReportsRepo } from '../../../src/server/database/repositories/portal-reports.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { reporterOwnershipService } from '../../../src/server/services/reporter-ownership.service';
import { reportsService } from '../../../src/server/services/reports.service';
import { cleanupService } from '../../../src/server/services/cleanup.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { reportersService } from '../../../src/server/services/reporters.service';
import { projectsService } from '../../../src/server/services/projects.service';
import { realtimeService } from '../../../src/server/services/realtime.service';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { Result } from '../../../src/server/utils/result';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let owner: ReturnType<typeof login>;
let other: ReturnType<typeof login>;
let projectId: string;
let reportId: string;
let readers: { cancel(): Promise<void> }[];
const decode = (chunk: { value?: Uint8Array }) => new TextDecoder().decode(chunk.value);
function login(email: string, previousSecret?: string) {
  const token = Result.unwrap(reporterAuthService.mintLoginToken(email, 'request'));
  const session = Result.unwrap(reporterAuthService.exchange(token.secret, previousSecret));
  return {
    id: session.reporter.id,
    secret: session.sessionSecret,
    sessionId: Result.unwrap(reporterAuthService.validateSession(session.sessionSecret)).sessionId,
    cookie: `bugpin_reporter_session=${session.sessionSecret}`,
  };
}
beforeEach(async () => {
  close = await openPortalDatabase();
  await settingsRepo.updateAll({ smtpEnabled: false });
  settingsCacheService.invalidate();
  app = createPortalTestApp();
  owner = login('owner@example.com');
  other = login('other@example.com');
  getDb().run(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ('staff', 'Staff', 'staff@example.com', 'hash', 'admin')"
  );
  projectId = (
    await projectsRepo.create({
      name: 'Project',
      settings: { reporterPortal: { enabled: true, allowNewFeedback: true } },
    })
  ).id;
  reportId = (
    await reportsRepo.create({
      projectId,
      title: 'Owned report',
      metadata: { timestamp: new Date().toISOString() },
    })
  ).id;
  reporterOwnershipRepo.setOwner(reportId, owner.id, null);
  readers = [];
});
afterEach(async () => {
  for (const reader of readers) await reader.cancel().catch(() => {});
  mock.restore();
  close();
});
function request(cookie = owner.cookie) {
  return app.request(`${portalOrigin}/api/portal/events`, { headers: { Cookie: cookie } });
}
async function open(cookie = owner.cookie) {
  const response = await request(cookie);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  const reader = response.body!.getReader();
  readers.push(reader);
  expect(decode(await reader.read())).toBe(': connected\n\n');
  return reader;
}
async function streamLimit(limit: number) {
  const settings = await settingsCacheService.getAll();
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...settings.reporterPortalLimits, sseStreamsPerSession: limit },
  });
  settingsCacheService.invalidate();
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
function publish(type: 'report.updated' | 'message.created' = 'report.updated') {
  realtimeService.publish(type, { reportId, projectId });
}

it('sends only owned allowlisted hints, taking the project from storage and excluding staff activity and raw payload fields', async () => {
  const reader = await open();
  const foreign = (
    await reportsRepo.create({
      projectId,
      title: 'Other owner',
      metadata: { timestamp: new Date().toISOString() },
    })
  ).id;
  reporterOwnershipRepo.setOwner(foreign, other.id, null);
  realtimeService.publish('message.created', { reportId: foreign, projectId });
  realtimeService.publish('report.updated', { reportId: 'missing', projectId });
  realtimeService.publish('reporter_activity.changed', { reportId, projectId });
  realtimeService.publish('message.created', {
    reportId,
    projectId: 'forged-project',
    ...{ body: 'secret', email: 'private@example.com' },
  });
  expect(decode(await reader.read())).toBe(
    `event: message.created\ndata: {"reportId":"${reportId}","projectId":"${projectId}"}\n\n`
  );
  publish();
  expect(decode(await reader.read())).toBe(
    `event: report.updated\ndata: {"reportId":"${reportId}","projectId":"${projectId}"}\n\n`
  );
});

it('delivers invalidations from committed portal writes so the client can refetch safe content', async () => {
  const reader = await open();
  const reply = await portalPost(
    app,
    `/reports/${reportId}/messages`,
    { body: 'New reply' },
    owner.cookie
  );
  expect(reply.status).toBe(201);
  expect(decode(await reader.read())).toBe(
    `event: message.created\ndata: {"reportId":"${reportId}","projectId":"${projectId}"}\n\n`
  );
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('title', 'New feedback');
  const response = await app.request(`${portalOrigin}/api/portal/reports`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, Origin: portalOrigin, 'X-BugPin-Portal': '1' },
    body: form,
  });
  expect(response.status).toBe(201);
  const created = (await response.json()) as { report: { id: string } };
  expect(decode(await reader.read())).toBe(
    `event: report.updated\ndata: {"reportId":"${created.report.id}","projectId":"${projectId}"}\n\n`
  );
  const detail = await app.request(`${portalOrigin}/api/portal/reports/${reportId}`, {
    headers: { Cookie: owner.cookie },
  });
  expect(
    ((await detail.json()) as { report: { messages: { body: string }[] } }).report.messages.map(
      (message) => message.body
    )
  ).toEqual(['New reply']);
});

it('limits streams per reporter session to three by default and releases cancelled slots independently', async () => {
  expect((await settingsCacheService.getAll()).reporterPortalLimits.sseStreamsPerSession).toBe(3);
  const first = await open();
  await open();
  await open();
  expect((await request()).status).toBe(429);
  await open(other.cookie);
  await first.cancel();
  await open();
});

it('uses configured limits from one through ten and rejects the next stream with RATE_LIMITED', async () => {
  for (const limit of [1, 10]) {
    await streamLimit(limit);
    const opened = [];
    for (let i = 0; i < limit; i++) opened.push(await open());
    const denied = await request();
    expect(denied.status).toBe(429);
    expect(((await denied.json()) as { error: string }).error).toBe('RATE_LIMITED');
    for (const reader of opened) await reader.cancel();
  }
});

for (const state of ['revoked', 'expired', 'absolute-expiry', 'suspended', 'deleted'] as const) {
  it(`revalidates and closes a ${state} reporter on heartbeat`, async () => {
    const pulse = captureHeartbeat();
    const reader = await open();
    if (state === 'revoked')
      getDb().run('UPDATE reporter_sessions SET revoked_at = ? WHERE id = ?', [
        new Date().toISOString(),
        owner.sessionId,
      ]);
    if (state === 'expired')
      getDb().run(
        "UPDATE reporter_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
        [owner.sessionId]
      );
    if (state === 'absolute-expiry')
      getDb().run(
        "UPDATE reporter_sessions SET absolute_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?",
        [owner.sessionId]
      );
    if (state === 'suspended')
      getDb().run('UPDATE reporters SET suspended_at = ? WHERE id = ?', [
        new Date().toISOString(),
        owner.id,
      ]);
    if (state === 'deleted') getDb().run('DELETE FROM reporters WHERE id = ?', [owner.id]);
    await pulse();
    expect((await reader.read()).done).toBe(true);
  });
}

for (const action of ['logout', 'revoke', 'suspend', 'delete', 'switch'] as const) {
  it(`immediately closes invalidated sessions after ${action} without closing another reporter's stream`, async () => {
    const reader = await open();
    const unaffected = await open(other.cookie);
    if (action === 'logout') reporterAuthService.logout(owner.sessionId);
    if (action === 'revoke') Result.unwrap(reportersService.revokeSessions(owner.id, 'staff'));
    if (action === 'suspend') Result.unwrap(reportersService.suspend(owner.id, 'staff'));
    if (action === 'delete') Result.unwrap(reportersService.delete(owner.id, 'staff'));
    if (action === 'switch') {
      login('other@example.com', owner.secret);
    }
    expect((await reader.read()).done).toBe(true);
    reporterOwnershipRepo.setOwner(reportId, other.id, null);
    publish();
    expect(decode(await unaffected.read())).toContain(`"reportId":"${reportId}"`);
  });
}

for (const change of [
  'reassignment',
  'removal',
  'disabled',
  'inactive',
  'deleted-project',
] as const) {
  it(`sends an empty access.changed and closes on ${change}`, async () => {
    const reader = await open();
    if (change === 'reassignment')
      Result.unwrap(
        await reporterOwnershipService.set(reportId, { reporterId: other.id }, 'staff')
      );
    if (change === 'removal')
      Result.unwrap(await reporterOwnershipService.remove(reportId, 'staff'));
    if (change === 'disabled')
      Result.unwrap(
        await projectsService.update(projectId, {
          settings: { reporterPortal: { enabled: false, allowNewFeedback: false } },
        })
      );
    if (change === 'inactive')
      Result.unwrap(await projectsService.update(projectId, { isActive: false }));
    if (change === 'deleted-project') Result.unwrap(await projectsService.delete(projectId));
    expect(decode(await reader.read())).toBe('event: access.changed\ndata: {}\n\n');
    expect((await reader.read()).done).toBe(true);
  });
}

it('rechecks scope on heartbeat and never emits a stale report hint after ownership loss', async () => {
  const pulse = captureHeartbeat();
  const reader = await open();
  reporterOwnershipRepo.setOwner(reportId, other.id, null);
  publish();
  await pulse();
  expect(decode(await reader.read())).toBe('event: access.changed\ndata: {}\n\n');
  expect((await reader.read()).done).toBe(true);
});

it('sends heartbeat comments after a valid session and scope check', async () => {
  const pulse = captureHeartbeat();
  const reader = await open();
  await pulse();
  expect(decode(await reader.read())).toBe(': heartbeat\n\n');
});

it('closes blocked heartbeats and frees the stream slot', async () => {
  await streamLimit(1);
  const pulse = captureHeartbeat();
  const reader = await open();
  await pulse();
  const pending = pulse();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pulse();
  await pending;
  expect(decode(await reader.read())).toBe(': heartbeat\n\n');
  expect((await reader.read()).done).toBe(true);
  await open();
});

it('closes blocked event writes without requiring more traffic and releases the stream slot', async () => {
  await streamLimit(1);
  const pulse = captureHeartbeat();
  const reader = await open();
  publish();
  publish();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pulse();
  expect((await request()).status).toBe(429);
  await pulse();
  expect(decode(await reader.read())).toContain('event: report.updated');
  expect((await reader.read()).done).toBe(true);
  await open();
});

it('bounds pending event hints and releases a slow reader slot', async () => {
  await streamLimit(1);
  await open();
  for (let index = 0; index < 40; index++) publish();
  await open();
});

it('keeps a real Bun stream alive beyond the idle timeout and continues delivering authorized hints', async () => {
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', idleTimeout: 1, fetch: app.fetch });
  try {
    const response = await fetch(new URL('/api/portal/events', server.url), {
      headers: { Cookie: owner.cookie },
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    readers.push(reader);
    await reader.read();
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    publish();
    expect(decode(await reader.read())).toContain(`"reportId":"${reportId}"`);
    await reader.cancel();
  } finally {
    await server.stop(true);
  }
});

it('performs one check-only session validation and one scope query per hint or heartbeat', async () => {
  const pulse = captureHeartbeat();
  const reader = await open();
  const validate = spyOn(reporterAuthService, 'validateSession');
  const scope = spyOn(portalReportsRepo, 'visibleScope');
  publish();
  expect(decode(await reader.read())).toContain('event: report.updated');
  expect(validate).toHaveBeenCalledTimes(1);
  expect(validate).toHaveBeenLastCalledWith(owner.secret, false);
  expect(scope).toHaveBeenCalledTimes(1);
  validate.mockClear();
  scope.mockClear();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await pulse();
  expect(decode(await reader.read())).toBe(': heartbeat\n\n');
  expect(validate).toHaveBeenCalledTimes(1);
  expect(validate).toHaveBeenLastCalledWith(owner.secret, false);
  expect(scope).toHaveBeenCalledTimes(1);
});

it('does not renew an idle stream on heartbeat or event delivery and closes at its existing expiry', async () => {
  const pulse = captureHeartbeat();
  const reader = await open();
  const now = Date.now();
  const lastUsedAt = new Date(now - 2 * 3600000).toISOString();
  const expiresAt = new Date(now + 3600000).toISOString();
  getDb().run('UPDATE reporter_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?', [
    lastUsedAt,
    expiresAt,
    owner.sessionId,
  ]);
  const clock = spyOn(Date, 'now').mockReturnValue(now + 30 * 60000);
  await pulse();
  expect(decode(await reader.read())).toBe(': heartbeat\n\n');
  publish();
  expect(decode(await reader.read())).toContain('event: report.updated');
  expect(
    getDb()
      .query('SELECT last_used_at, expires_at FROM reporter_sessions WHERE id = ?')
      .get(owner.sessionId)
  ).toEqual({ last_used_at: lastUsedAt, expires_at: expiresAt });
  clock.mockReturnValue(Date.parse(expiresAt) + 1);
  await pulse();
  expect((await reader.read()).done).toBe(true);
});

for (const target of ['session', 'reporter', 'project'] as const) {
  it(`targets ${target} invalidation without revalidating unrelated streams`, async () => {
    const foreignProject = await projectsRepo.create({
      name: 'Other project',
      settings: { reporterPortal: { enabled: true, allowNewFeedback: true } },
    });
    const foreignReport = await reportsRepo.create({
      projectId: foreignProject.id,
      title: 'Other report',
      metadata: { timestamp: new Date().toISOString() },
    });
    reporterOwnershipRepo.setOwner(foreignReport.id, other.id, null);
    const affected = await open();
    await open(other.cookie);
    const validate = spyOn(reporterAuthService, 'validateSession');
    const scope = spyOn(portalReportsRepo, 'visibleScope');
    if (target === 'session') reporterAuthService.logout(owner.sessionId);
    if (target === 'reporter') Result.unwrap(reportersService.suspend(owner.id, 'staff'));
    if (target === 'project')
      Result.unwrap(
        await projectsService.update(projectId, {
          settings: { reporterPortal: { enabled: false, allowNewFeedback: false } },
        })
      );
    if (target === 'project')
      expect(decode(await affected.read())).toBe('event: access.changed\ndata: {}\n\n');
    expect((await affected.read()).done).toBe(true);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenLastCalledWith(owner.secret, false);
    expect(scope).toHaveBeenCalledTimes(target === 'project' ? 1 : 0);
  });
}

it('deduplicates ownership invalidation per previous reporter and leaves unrelated reporters unchecked', async () => {
  const reader = await open();
  await open(other.cookie);
  const validate = spyOn(reporterAuthService, 'validateSession');
  reporterOwnershipRepo.setOwner(reportId, null, null);
  reporterOwnershipService.announce(
    Array.from({ length: 2 }, () => ({
      reportId,
      projectId,
      action: 'owner_removed' as const,
      oldReporterId: owner.id,
      newReporterId: null,
      actorUserId: 'staff',
    }))
  );
  expect(decode(await reader.read())).toBe('event: access.changed\ndata: {}\n\n');
  expect((await reader.read()).done).toBe(true);
  expect(validate).toHaveBeenCalledTimes(1);
  expect(validate).toHaveBeenLastCalledWith(owner.secret, false);
});

it('delivers access.changed after a stalled ordinary write before closing the stream', async () => {
  const reader = await open();
  publish('report.updated');
  publish('message.created');
  publish('report.updated');
  await new Promise<void>((resolve) => setImmediate(resolve));
  Result.unwrap(reporterOwnershipService.set(reportId, { reporterId: other.id }, 'staff'));
  expect(decode(await reader.read())).toContain('event: report.updated');
  expect(decode(await reader.read())).toContain('event: message.created');
  expect(decode(await reader.read())).toBe('event: access.changed\ndata: {}\n\n');
  expect((await reader.read()).done).toBe(true);
});

for (const mode of ['single', 'retention', 'all'] as const) {
  it(`immediately sends access.changed after successful ${mode} report deletion`, async () => {
    spyOn(notificationsService, 'notifyReportDeleted').mockResolvedValue();
    const second = await reportsRepo.create({
      projectId,
      title: 'Another owned report',
      metadata: { timestamp: new Date().toISOString() },
    });
    reporterOwnershipRepo.setOwner(second.id, owner.id, null);
    const reader = await open();
    await open(other.cookie);
    const validate = spyOn(reporterAuthService, 'validateSession');
    if (mode === 'single') Result.unwrap(await reportsService.delete(reportId));
    if (mode === 'retention') {
      await settingsRepo.updateAll({ retentionDays: 1 });
      getDb().run("UPDATE reports SET created_at = '2000-01-01T00:00:00.000Z'");
      expect(await cleanupService.cleanupOldReports()).toEqual({ deleted: 2, errors: 0 });
    }
    if (mode === 'all')
      expect(await cleanupService.deleteAllReports()).toEqual({ deleted: 2, errors: 0 });
    expect(decode(await reader.read())).toBe('event: access.changed\ndata: {}\n\n');
    expect((await reader.read()).done).toBe(true);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith(owner.secret, false);
    expect(await reportsRepo.findById(reportId)).toBeNull();
  });
}

it('does not invalidate ownership when cleanup deletion fails', async () => {
  await open();
  const remove = spyOn(reportsRepo, 'delete').mockResolvedValue(false);
  const invalidate = spyOn(realtimeService, 'invalidatePortalAccess');
  expect(await cleanupService.deleteAllReports()).toEqual({ deleted: 0, errors: 1 });
  expect(invalidate).not.toHaveBeenCalled();
  expect(await reportsRepo.findById(reportId)).not.toBeNull();
  remove.mockRestore();
});
