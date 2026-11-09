import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import { readdirSync } from 'node:fs';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { reportHistoryRepo } from '../../../src/server/database/repositories/report-history.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { portalSubmissionsService } from '../../../src/server/services/portal-submissions.service';
import { reportMessagesService } from '../../../src/server/services/report-messages.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { githubSyncService } from '../../../src/server/services/integrations/github-sync.service';
import { syncQueueService } from '../../../src/server/services/integrations/sync-queue.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { clearAllRateLimits } from '../../../src/server/middleware/rate-limit';
import { getEEHooks } from '../../../src/server/utils/ee-hooks';
import { config } from '../../../src/server/config';
import { Result } from '../../../src/server/utils/result';
import type { PortalMessage, PortalReportDetail } from '../../../src/shared/portal-types';
import type { ReporterPortalLimits, ProjectSettings } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let reporterId: string;
let cookie: string;
let projectId: string;
let reportId: string;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const past = '2026-01-01T00:00:00.000Z';

beforeEach(async () => {
  close = await openPortalDatabase();
  await settingsRepo.updateAll({ smtpEnabled: false });
  settingsCacheService.invalidate();
  app = createPortalTestApp();
  const token = Result.unwrap(reporterAuthService.mintLoginToken('owner@example.com', 'request'));
  const session = Result.unwrap(reporterAuthService.exchange(token.secret));
  reporterId = session.reporter.id;
  cookie = `bugpin_reporter_session=${session.sessionSecret}`;
  getDb().run("UPDATE reporters SET display_name = 'Owner display', locale = 'de' WHERE id = ?", [
    reporterId,
  ]);
  getDb().run(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ('staff', 'Staff', 'staff@example.com', 'hash', 'admin')"
  );
  projectId = (
    await projectsRepo.create({
      name: 'Owned project',
      settings: {
        reporterPortal: { enabled: true, allowNewFeedback: true },
        defaultAssigneeUserId: 'staff',
      },
    })
  ).id;
  reportId = (
    await reportsRepo.create({
      projectId,
      title: 'Original report',
      description: 'Original description',
      priority: 'highest',
      assignedTo: 'staff',
      metadata: { timestamp: past },
    })
  ).id;
  reporterOwnershipRepo.setOwner(reportId, reporterId, null);
  getDb().run('UPDATE reports SET updated_at = ?, last_reporter_activity_at = NULL WHERE id = ?', [
    past,
    reportId,
  ]);
  spyOn(notificationsService, 'notifyReporterActivity').mockResolvedValue();
  spyOn(notificationsService, 'notifyNewReport').mockResolvedValue();
  spyOn(githubSyncService, 'getAutoSyncIntegration').mockResolvedValue(null);
});
afterEach(async () => {
  await tick();
  mock.restore();
  close();
});
function tick() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
async function limits(update: Partial<ReporterPortalLimits>) {
  const settings = await settingsCacheService.getAll();
  await settingsRepo.updateAll({
    reporterPortalLimits: { ...settings.reporterPortalLimits, ...update },
  });
  settingsCacheService.invalidate();
  clearAllRateLimits();
}
function submit(fields: Record<string, string> = {}, files: File[] = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    projectId,
    title: 'New feedback',
    description: 'Submitted description',
    ...fields,
  }))
    form.set(key, value);
  for (const file of files) form.append('files[]', file);
  return multipart('/reports', form);
}
function multipart(path: string, form: FormData) {
  return app.request(`${portalOrigin}/api/portal${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: portalOrigin, 'X-BugPin-Portal': '1' },
    body: form,
  });
}
function reply(body: unknown = { body: 'Reporter reply' }) {
  return portalPost(app, `/reports/${reportId}/messages`, body, cookie);
}
function image(bytes = png) {
  return new File([bytes], 'picture.png', { type: 'image/png' });
}
function diskFiles() {
  return readdirSync(config.dataDir, { recursive: true }).filter((path) =>
    String(path).endsWith('.png')
  );
}
function count(table: string) {
  return getDb().query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n;
}
async function project(settings: ProjectSettings) {
  await projectsRepo.update(projectId, { settings });
}

it('creates owner-attributed feedback with original content, safe metadata, default assignment, and a neutral creation history', async () => {
  const createdHook = spyOn(getEEHooks(), 'onReportCreated').mockResolvedValue();
  const response = await submit({}, [image()]);
  expect(response.status).toBe(201);
  const dto = ((await response.json()) as { report: PortalReportDetail }).report;
  expect(dto).toMatchObject({
    title: 'New feedback',
    description: 'Submitted description',
    status: 'open',
    assigneeName: 'Staff',
    messages: [],
    canReply: true,
  });
  expect(dto.files).toHaveLength(1);
  const saved = (await reportsRepo.findById(dto.id))!;
  expect(saved).toMatchObject({
    source: 'portal',
    reporterId,
    reporterEmail: 'owner@example.com',
    reporterName: 'Owner display',
    reporterLocale: 'de',
    originalDescription: 'Submitted description',
    priority: 'medium',
    assignedTo: 'staff',
  });
  expect(saved.metadata).toEqual({ timestamp: saved.createdAt, portal: true });
  expect(saved.lastReporterActivityAt).toBe(saved.createdAt);
  expect(saved.updatedAt).toBe(saved.createdAt);
  expect(
    getDb().query('SELECT action, user_id FROM report_history WHERE report_id = ?').all(dto.id)
  ).toEqual([{ action: 'created', user_id: null }]);
  expect((await filesRepo.findByReportId(dto.id))[0]).toMatchObject({
    uploadedByReporterId: reporterId,
    messageId: null,
  });
  await tick();
  expect(notificationsService.notifyReporterActivity).toHaveBeenCalledTimes(1);
  expect(notificationsService.notifyNewReport).not.toHaveBeenCalled();
  expect(createdHook).toHaveBeenCalledWith(
    expect.objectContaining({ id: dto.id, source: 'portal' })
  );
  expect(JSON.stringify(dto)).not.toContain('owner@example.com');
  expect(JSON.stringify(dto)).not.toContain(config.dataDir);
});

it('uses the portal title limit without expanding the existing staff creation limit', async () => {
  for (const title of ['abc', 'x'.repeat(501)]) expect((await submit({ title })).status).toBe(400);
  expect((await submit({ title: 'x'.repeat(500) })).status).toBe(201);
  expect((await submit({ title: 'four' })).status).toBe(201);
  expect((await submit({ description: 'x'.repeat(10001) })).status).toBe(400);
  const { reportsService } = await import('../../../src/server/services/reports.service');
  expect(
    (await reportsService.createManual({ projectId, title: 'x'.repeat(201) }, 'staff')).success
  ).toBe(false);
});

it('rejects forged identity, control fields, unknown projects, and projects without an existing owned report', async () => {
  for (const key of [
    'reporterId',
    'reporterEmail',
    'reporterName',
    'reporterLocale',
    'status',
    'priority',
    'assignedTo',
    'source',
    'metadata',
  ]) {
    clearAllRateLimits();
    expect((await submit({ [key]: 'forged' })).status).toBe(400);
  }
  clearAllRateLimits();
  const other = await projectsRepo.create({
    name: 'No ownership',
    settings: { reporterPortal: { enabled: true, allowNewFeedback: true } },
  });
  for (const id of ['unknown', other.id])
    expect((await submit({ projectId: id })).status).toBe(404);
  for (const reporterPortal of [
    { enabled: false, allowNewFeedback: true },
    { enabled: true, allowNewFeedback: false },
  ]) {
    await project({ reporterPortal });
    expect((await submit()).status).toBe(404);
  }
  expect(count('reports')).toBe(1);
});

it('posts safe reporter messages for every replyable status without altering report fields or original attachments', async () => {
  const hook = spyOn(getEEHooks(), 'onReportMessageCreated').mockResolvedValue();
  for (const status of ['open', 'in_progress', 'resolved'] as const) {
    await reportsRepo.update(reportId, { status });
    const response = await reply({ body: '  Reply text  ' });
    expect(response.status).toBe(201);
    const dto = ((await response.json()) as { message: PortalMessage }).message;
    expect(dto).toEqual({
      id: expect.any(String),
      authorKind: 'reporter',
      authorName: 'Owner display',
      isOwn: true,
      body: 'Reply text',
      files: [],
      createdAt: expect.any(String),
    });
    const saved = (await reportsRepo.findById(reportId))!;
    expect(saved).toMatchObject({
      status,
      priority: 'highest',
      assignedTo: 'staff',
      title: 'Original report',
      description: 'Original description',
      originalDescription: 'Original description',
    });
    expect(saved.updatedAt).toBe(dto.createdAt);
    expect(Date.parse(saved.lastReporterActivityAt!)).toBeGreaterThanOrEqual(
      Date.parse(dto.createdAt)
    );
    expect(await filesRepo.findByReportId(reportId)).toEqual([]);
  }
  await tick();
  expect(hook).toHaveBeenCalledTimes(3);
  expect(notificationsService.notifyReporterActivity).toHaveBeenCalledTimes(3);
  expect(githubSyncService.getAutoSyncIntegration).not.toHaveBeenCalled();
});

it('accepts files-only messages and rejects empty, long, forged, or excessive attachment messages', async () => {
  for (const body of [
    { body: '   ' },
    { body: 'x'.repeat(5001) },
    { body: 'valid', authorKind: 'staff' },
  ])
    expect((await reply(body)).status).toBe(400);
  const form = new FormData();
  form.append('files[]', image());
  const response = await multipart(`/reports/${reportId}/messages`, form);
  expect(response.status).toBe(201);
  const dto = ((await response.json()) as { message: PortalMessage }).message;
  expect(dto.body).toBe('');
  expect(dto.files).toHaveLength(1);
  expect(dto.files[0].url).toBe(`/api/portal/reports/${reportId}/files/${dto.files[0].id}`);
  const excessive = new FormData();
  for (let i = 0; i < 6; i++) excessive.append('files[]', image());
  expect((await multipart(`/reports/${reportId}/messages`, excessive)).status).toBe(400);
  expect(
    (
      await submit(
        {},
        Array.from({ length: 6 }, () => image())
      )
    ).status
  ).toBe(400);
  expect(count('report_messages')).toBe(1);
});

it('returns closed, messaging-disabled, unauthorized, and missing errors without writing messages', async () => {
  await reportsRepo.update(reportId, { status: 'closed' });
  expect((await reply()).status).toBe(409);
  await reportsRepo.update(reportId, { status: 'open' });
  await project({
    reporterPortal: { enabled: true, allowNewFeedback: true },
    reporterNotifications: { messagingEnabled: false },
  });
  expect((await reply()).status).toBe(403);
  await project({ reporterPortal: { enabled: false, allowNewFeedback: true } });
  expect((await reply()).status).toBe(404);
  await project({ reporterPortal: { enabled: true, allowNewFeedback: true } });
  reporterOwnershipRepo.setOwner(reportId, null, null);
  expect((await reply()).status).toBe(404);
  getDb().run('UPDATE reporter_sessions SET revoked_at = ? WHERE reporter_id = ?', [
    new Date().toISOString(),
    reporterId,
  ]);
  expect((await reply()).status).toBe(401);
  expect((await submit()).status).toBe(401);
  expect(count('report_messages')).toBe(0);
});

it('enforces live per-reporter minute/day message and hour/day submission limits', async () => {
  for (const setting of ['messagesPerReporterPerMinute', 'messagesPerReporterPerDay'] as const) {
    await limits({
      messagesPerReporterPerMinute: 10,
      messagesPerReporterPerDay: 100,
      [setting]: 1,
    });
    expect((await reply()).status).toBe(201);
    const denied = await reply();
    expect(denied.status).toBe(429);
    expect(((await denied.json()) as { error: string }).error).toBe('RATE_LIMITED');
  }
  for (const setting of [
    'submissionsPerReporterPerHour',
    'submissionsPerReporterPerDay',
  ] as const) {
    await limits({
      submissionsPerReporterPerHour: 5,
      submissionsPerReporterPerDay: 20,
      [setting]: 1,
    });
    expect((await submit()).status).toBe(201);
    expect((await submit()).status).toBe(429);
  }
});

it('rejects oversized bodies, invalid signatures and MIME types before persistence', async () => {
  const headers = {
    Cookie: cookie,
    Origin: portalOrigin,
    'X-BugPin-Portal': '1',
    'content-type': 'multipart/form-data; boundary=boundary',
    'content-length': '9999999999',
  };
  for (const path of ['/reports', `/reports/${reportId}/messages`])
    expect(
      (
        await app.request(`${portalOrigin}/api/portal${path}`, {
          method: 'POST',
          headers,
          body: 'small',
        })
      ).status
    ).toBe(413);
  for (const upload of [
    new File(['bad'], 'bad.png', { type: 'image/png' }),
    new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }),
  ]) {
    expect((await submit({}, [upload])).status).toBe(400);
    const form = new FormData();
    form.append('files[]', upload);
    expect((await multipart(`/reports/${reportId}/messages`, form)).status).toBe(400);
  }
  expect(count('files')).toBe(0);
  expect(count('reports')).toBe(1);
  expect(diskFiles()).toEqual([]);
});

it('rolls back reports, files, history, and activity when an insert fails', async () => {
  const before = count('report_history');
  const failHistory = spyOn(reportHistoryRepo, 'insert').mockImplementation(() => {
    throw new Error('Storage failure');
  });
  expect((await submit({}, [image()])).status).toBe(500);
  expect(count('reports')).toBe(1);
  expect(count('files')).toBe(0);
  expect(count('report_history')).toBe(before);
  expect(diskFiles()).toEqual([]);
  failHistory.mockRestore();
  spyOn(filesRepo, 'insert').mockImplementation(() => {
    throw new Error('Storage failure');
  });
  const form = new FormData();
  form.append('files[]', image());
  expect((await multipart(`/reports/${reportId}/messages`, form)).status).toBe(500);
  expect(count('report_messages')).toBe(0);
  expect((await reportsRepo.findById(reportId))!.updatedAt).toBe(past);
  expect(diskFiles()).toEqual([]);
});

it('rechecks access and size limits after file staging and leaves no partial report', async () => {
  for (const change of ['ownership', 'allow-new', 'size'] as const) {
    await project({ reporterPortal: { enabled: true, allowNewFeedback: true } });
    reporterOwnershipRepo.setOwner(reportId, reporterId, null);
    const upload = image();
    spyOn(upload, 'arrayBuffer').mockImplementation(async () => {
      if (change === 'ownership') reporterOwnershipRepo.setOwner(reportId, null, null);
      if (change === 'allow-new')
        await project({ reporterPortal: { enabled: true, allowNewFeedback: false } });
      if (change === 'size')
        await project({
          reporterPortal: { enabled: true, allowNewFeedback: true },
          screenshot: { maxImageUploadSizeMb: 0.000001 },
        });
      return png.buffer.slice(0) as ArrayBuffer;
    });
    const result = await portalSubmissionsService.create(
      reporterId,
      { projectId, title: 'Stale upload' },
      [upload]
    );
    expect(result.success).toBe(false);
    expect(count('reports')).toBe(1);
    expect(count('files')).toBe(0);
    expect(diskFiles()).toEqual([]);
  }
});

it('keeps the reporter daily upload cap atomic across concurrent new feedback and replies, including reassigned reports', async () => {
  await limits({ uploadMbPerReporterPerDay: 1 });
  const bytes = new Uint8Array(600 * 1024);
  bytes.set(png);
  const form = new FormData();
  form.set('body', 'Concurrent reply');
  form.append('files[]', image(bytes));
  const responses = await Promise.all([
    submit({}, [image(bytes)]),
    multipart(`/reports/${reportId}/messages`, form),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 413]);
  const deniedResponse = responses.find((response) => response.status === 413)!;
  expect(((await deniedResponse.json()) as { error: string }).error).toBe('UPLOAD_QUOTA_EXCEEDED');
  expect(count('files')).toBe(1);
  const uploader = getDb().query<{ id: string }, []>('SELECT report_id AS id FROM files').get()!;
  reporterOwnershipRepo.setOwner(uploader.id, null, null);
  reporterOwnershipRepo.setOwner(reportId, reporterId, null);
  const denied = await reportMessagesService.sendReporter(reportId, reporterId, 'Another reply', [
    image(bytes),
  ]);
  expect(denied.success).toBe(false);
  if (!denied.success) expect(denied.code).toBe('UPLOAD_QUOTA_EXCEEDED');
  expect(diskFiles()).toHaveLength(1);
});

it('enforces the shared project video budget across feedback and replies', async () => {
  await project({
    reporterPortal: { enabled: true, allowNewFeedback: true },
    screenshot: { maxVideoUploadMbPerDay: 1 },
  });
  const bytes = new Uint8Array(600 * 1024);
  bytes.set([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
  const upload = () => new File([bytes], 'clip.mp4', { type: 'video/mp4' });
  const results = await Promise.all([
    portalSubmissionsService.create(reporterId, { projectId, title: 'Video feedback' }, [upload()]),
    reportMessagesService.sendReporter(reportId, reporterId, 'Video reply', [upload()]),
  ]);
  expect(results.filter((result) => result.success)).toHaveLength(1);
  expect(results.filter((result) => !result.success).map((result) => result.code)).toEqual([
    'VIDEO_QUOTA_EXCEEDED',
  ]);
});

it('preserves committed feedback when notification delivery fails and queues configured issue sync once', async () => {
  spyOn(notificationsService, 'notifyReporterActivity').mockRejectedValue(
    new Error('Delivery failed')
  );
  spyOn(getEEHooks(), 'onReportCreated').mockRejectedValue(new Error('Webhook failed'));
  spyOn(githubSyncService, 'getAutoSyncIntegration').mockResolvedValue({
    id: 'integration',
  } as Awaited<ReturnType<typeof githubSyncService.getAutoSyncIntegration>>);
  const enqueue = spyOn(syncQueueService, 'enqueue').mockResolvedValue(Result.ok(undefined));
  const response = await submit();
  expect(response.status).toBe(201);
  const dto = ((await response.json()) as { report: PortalReportDetail }).report;
  await tick();
  expect(await reportsRepo.findById(dto.id)).not.toBeNull();
  expect(enqueue).toHaveBeenCalledWith(dto.id, 'integration');
});
