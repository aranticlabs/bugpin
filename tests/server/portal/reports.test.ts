import { afterEach, beforeEach, expect, it } from 'bun:test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { reportMessagesRepo } from '../../../src/server/database/repositories/report-messages.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { config } from '../../../src/server/config';
import { Result } from '../../../src/server/utils/result';
import { REPORT_STATUSES, type ReportStatus } from '../../../src/shared/types';
import type {
  PortalProject,
  PortalReportBoard,
  PortalReportDetail,
  PortalReportList,
} from '../../../src/shared/portal-types';
import { createPortalTestApp, openPortalDatabase, portalOrigin } from './helpers';

let close: () => void;
let app: ReturnType<typeof createPortalTestApp>;
let projectId: string;
let owner: ReturnType<typeof login>;
let other: ReturnType<typeof login>;
const past = '2026-01-01T00:00:00.000Z';
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function login(email: string) {
  const token = Result.unwrap(reporterAuthService.mintLoginToken(email, 'request'));
  const session = Result.unwrap(reporterAuthService.exchange(token.secret));
  return { id: session.reporter.id, cookie: `bugpin_reporter_session=${session.sessionSecret}` };
}

beforeEach(async () => {
  close = await openPortalDatabase();
  app = createPortalTestApp();
  owner = login('owner@example.com');
  other = login('other@example.com');
  getDb().run(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ('staff', 'Staff display', 'staff-secret@example.com', 'unused', 'admin')"
  );
  projectId = (
    await projectsRepo.create({
      name: 'Owned project',
      settings: {
        reporterPortal: { enabled: true, allowNewReports: true },
      },
    })
  ).id;
});
afterEach(() => close());

async function report(
  reporterId = owner.id,
  options: {
    projectId?: string;
    status?: ReportStatus;
    updatedAt?: string;
    createdAt?: string;
    title?: string;
    description?: string;
  } = {}
) {
  const item = await reportsRepo.create({
    projectId: options.projectId ?? projectId,
    title: options.title ?? `Report ${crypto.randomUUID()}`,
    description: options.description ?? 'Original submitted description',
    priority: 'highest',
    assignedTo: 'staff',
    reporterEmail: 'private-contact@example.com',
    reporterName: 'Private contact',
    metadata: {
      timestamp: past,
      url: 'https://shop.example.com/checkout?token=secret-query#secret-fragment',
      title: 'Private page title',
      referrer: 'https://referrer.example.com',
      browser: { name: 'Chrome', version: '131', userAgent: 'Private user agent' },
      device: { type: 'desktop', os: 'Windows', osVersion: '11' },
      viewport: { width: 1920, height: 1080, devicePixelRatio: 2 },
      timezone: 'Europe/Berlin',
      pageLoadTime: 1234,
      consoleErrors: [{ type: 'error', message: 'Private console error', timestamp: past }],
    },
  });
  reporterOwnershipRepo.setOwner(item.id, reporterId, null);
  getDb().run('UPDATE reports SET status = ?, updated_at = ?, created_at = ? WHERE id = ?', [
    options.status ?? 'open',
    options.updatedAt ?? past,
    options.createdAt ?? past,
    item.id,
  ]);
  return item;
}

function request(path: string, cookie = owner.cookie, method = 'GET', range?: string) {
  return app.request(`${portalOrigin}/api/portal${path}`, {
    method,
    headers: { Cookie: cookie, ...(range ? { Range: range } : {}) },
  });
}
async function list(query = ''): Promise<PortalReportList> {
  const response = await request(`/reports${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as PortalReportList;
}
async function detail(id: string, cookie = owner.cookie): Promise<PortalReportDetail> {
  const response = await request(`/reports/${id}`, cookie);
  expect(response.status).toBe(200);
  return ((await response.json()) as { report: PortalReportDetail }).report;
}
async function file(reportId: string, messageId?: string) {
  const path = join(config.dataDir, `${crypto.randomUUID()}.png`);
  writeFileSync(path, bytes);
  return filesRepo.create({
    reportId,
    messageId,
    type: 'screenshot',
    path,
    filename: 'bad"\r\nname.png',
    mimeType: 'image/png',
    sizeBytes: bytes.length,
    width: 1,
    height: 1,
  });
}
function staffMessage(reportId: string, body = 'Visible staff message') {
  const message = reportMessagesRepo.insert(reportId, { kind: 'staff', userId: 'staff' }, body)!;
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [past, message.id]);
  return message;
}

it('lists only enabled owned projects with upload limits and submission availability', async () => {
  await report();
  await report(other.id);
  const disabled = await projectsRepo.create({ name: 'Disabled', settings: {} });
  await report(owner.id, { projectId: disabled.id });
  const foreign = await projectsRepo.create({
    name: 'Other project',
    settings: { reporterPortal: { enabled: true, allowNewReports: true } },
  });
  await report(other.id, { projectId: foreign.id });
  const readOnly = await projectsRepo.create({
    name: 'Read only',
    settings: { reporterPortal: { enabled: true, allowNewReports: false } },
  });
  await report(owner.id, { projectId: readOnly.id });
  await projectsRepo.update(projectId, {
    settings: {
      reporterPortal: { enabled: true, allowNewReports: true },
      screenshot: { maxImageUploadSizeMb: 3, maxVideoUploadSizeMb: 7 },
    },
  });
  const response = await request('/projects');
  const body = (await response.json()) as { projects: PortalProject[] };
  expect(body.projects.map((p) => p.id)).toEqual([projectId, readOnly.id]);
  expect(body.projects[0]).toEqual({
    id: projectId,
    name: 'Owned project',
    allowNewReports: true,
    maxImageMb: 3,
    maxVideoMb: 7,
  });
  const settings = await settingsCacheService.getAll();
  expect(body.projects[1]).toMatchObject({
    allowNewReports: false,
    maxImageMb: settings.screenshot.maxImageUploadSizeMb,
    maxVideoMb: settings.screenshot.maxVideoUploadSizeMb,
  });
});

it('paginates chronologically with ID ties and reports full filtered totals and unread counts', async () => {
  const items = [await report(), await report(), await report()];
  getDb().run('UPDATE reports SET updated_at = ? WHERE id = ?', [
    '2026-01-01 00:00:00',
    items[1].id,
  ]);
  const sorted = items.map((r) => r.id).sort();
  for (const item of items) staffMessage(item.id);
  await report(other.id);
  const first = await list('?limit=1');
  expect(first.reports.map((r) => r.id)).toEqual(sorted.slice(0, 1));
  expect(first.total).toBe(3);
  expect(first.unreadCount).toBe(3);
  const second = await list(`?limit=1&cursor=${first.nextCursor}`);
  const third = await list(`?limit=1&cursor=${second.nextCursor}`);
  expect([...first.reports, ...second.reports, ...third.reports].map((r) => r.id)).toEqual(sorted);
  expect(second.total).toBe(3);
  expect(third.unreadCount).toBe(3);
  expect(third.nextCursor).toBeNull();
  expect(Object.keys(first.reports[0]).sort()).toEqual(
    [
      'id',
      'title',
      'status',
      'project',
      'createdAt',
      'updatedAt',
      'unread',
      'replyCount',
      'latestReply',
    ].sort()
  );
  expect((await list('?projectId=unknown')).total).toBe(0);
});

it('returns four independent board pages with complete counts and status cursors', async () => {
  for (const status of ['open', 'in_progress', 'resolved', 'closed'] as const) {
    for (let index = 0; index < 3; index++) staffMessage((await report(owner.id, { status })).id);
  }
  const response = await request('/reports?groupByStatus=true&limit=1');
  const board = (await response.json()) as PortalReportBoard;
  expect(board.unreadCount).toBe(12);
  expect(Object.keys(board.columns).sort()).toEqual(
    ['open', 'in_progress', 'resolved', 'closed'].sort()
  );
  for (const status of REPORT_STATUSES) {
    const column = board.columns[status];
    expect(column.total).toBe(3);
    expect(column.reports).toHaveLength(1);
    expect(column.reports[0].status).toBe(status);
    const next = await list(`?status=${status}&limit=1&cursor=${column.nextCursor}`);
    expect(next.reports[0].id).not.toBe(column.reports[0].id);
    expect(next.total).toBe(3);
  }
  const response2 = await request(
    `/reports?groupByStatus=true&status=open&limit=1&cursor=${board.columns.open.nextCursor}`
  );
  const filtered = (await response2.json()) as PortalReportBoard;
  expect(filtered.columns.open.total).toBe(3);
  expect(filtered.columns.closed.total).toBe(0);
  expect(filtered.unreadCount).toBe(3);
});

it('keeps detail DTOs allowlisted and separates original files from visible message files', async () => {
  const item = await report();
  await reportsRepo.update(item.id, {
    title: 'Current staff title',
    description: 'Private staff edit',
  });
  const original = await file(item.id);
  const staff = staffMessage(item.id);
  const attachment = await file(item.id, staff.id);
  const own = reportMessagesRepo.insert(
    item.id,
    { kind: 'reporter', reporterId: owner.id },
    'Reporter reply'
  )!;
  const hidden = staffMessage(item.id, 'Hidden staff message');
  const hiddenFile = await file(item.id, hidden.id);
  reportMessagesRepo.setHidden(item.id, hidden.id, 'staff', true);
  getDb().run("UPDATE users SET name = 'Renamed staff' WHERE id = 'staff'");
  const result = await detail(item.id);
  expect(result.title).toBe('Current staff title');
  expect(result.description).toBe('Original submitted description');
  expect(result.assigneeName).toBe('Renamed staff');
  expect(result.files.map((f) => f.id)).toEqual([original.id]);
  expect(result.messages.map((m) => m.id)).toEqual([staff.id, own.id]);
  expect(result.messages[0]).toMatchObject({ authorName: 'Staff display', isOwn: false });
  expect(result.messages[1].isOwn).toBe(true);
  expect(result.messages[0].files.map((f) => f.id)).toEqual([attachment.id]);
  expect(Object.keys(result).sort()).toEqual(
    [
      'id',
      'title',
      'description',
      'status',
      'project',
      'assigneeName',
      'createdAt',
      'updatedAt',
      'files',
      'messages',
      'statusEvents',
      'environment',
      'canReply',
      'canSubmitNewReport',
    ].sort()
  );
  expect(result.environment).toEqual({
    pageUrl: 'https://shop.example.com/checkout',
    browser: 'Chrome 131',
    os: 'Windows 11',
    viewport: { width: 1920, height: 1080 },
    timezone: 'Europe/Berlin',
  });
  expect(Object.keys(result.messages[0]).sort()).toEqual(
    [
      'id',
      'authorKind',
      'authorName',
      'isOwn',
      'isPreviousReporter',
      'body',
      'files',
      'createdAt',
    ].sort()
  );
  expect(Object.keys(result.files[0]).sort()).toEqual(
    ['id', 'type', 'mimeType', 'sizeBytes', 'width', 'height', 'url'].sort()
  );
  expect(JSON.stringify(result)).not.toContain('staff-secret@example.com');
  expect(JSON.stringify(result)).not.toContain('private-contact@example.com');
  for (const secret of [
    'secret-query',
    'secret-fragment',
    'Private page title',
    'referrer.example.com',
    'Private user agent',
    'Private console error',
    '1234',
  ])
    expect(JSON.stringify(result)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain(hiddenFile.id);
});

it('marks only the authorized owner as seen without changing recency or staff activity', async () => {
  const item = await report();
  staffMessage(item.id);
  getDb().run(
    'UPDATE reports SET last_reporter_activity_at = ?, reporter_activity_seen_at = ? WHERE id = ?',
    [past, null, item.id]
  );
  expect((await list()).unreadCount).toBe(1);
  expect((await request(`/reports/${item.id}`, other.cookie)).status).toBe(404);
  expect((await reportsRepo.findById(item.id))!.ownerSeenAt).toBeUndefined();
  await detail(item.id);
  expect((await list()).unreadCount).toBe(0);
  const current = (await reportsRepo.findById(item.id))!;
  expect(current.updatedAt).toBe(past);
  expect(current.lastReporterActivityAt).toBe(past);
  expect(current.reporterActivitySeenAt).toBeUndefined();
  expect(current.ownerSeenAt).toBeDefined();
});

it('ignores hidden staff messages for unread state and resets it on reassignment', async () => {
  const item = await report();
  const message = staffMessage(item.id);
  expect((await list()).unreadCount).toBe(1);
  reportMessagesRepo.setHidden(item.id, message.id, 'staff', true);
  expect((await list()).unreadCount).toBe(0);
  reportMessagesRepo.setHidden(item.id, message.id, 'staff', false);
  await detail(item.id);
  reporterOwnershipRepo.setOwner(item.id, other.id, null);
  expect((await request(`/reports/${item.id}`)).status).toBe(404);
  const response = await request('/reports', other.cookie);
  const body = (await response.json()) as PortalReportList;
  expect(body.reports[0].unread).toBe(true);
  expect((await detail(item.id, other.cookie)).id).toBe(item.id);
});

it('computes reply availability from status and effective messaging settings', async () => {
  const item = await report();
  expect((await detail(item.id)).canReply).toBe(true);
  for (const status of ['resolved', 'closed'] as const) {
    await reportsRepo.update(item.id, { status });
    expect((await detail(item.id)).canReply).toBe(status === 'resolved');
  }
  await reportsRepo.update(item.id, { status: 'open' });
  const global = await settingsCacheService.getAll();
  await settingsRepo.updateAll({
    reporterNotifications: { ...global.reporterNotifications, messagingEnabled: false },
  });
  settingsCacheService.invalidate();
  expect((await detail(item.id)).canReply).toBe(false);
  await projectsRepo.update(projectId, {
    settings: {
      reporterPortal: { enabled: true, allowNewReports: false },
      reporterNotifications: { messagingEnabled: true },
    },
  });
  expect((await detail(item.id)).canReply).toBe(true);
  expect((await detail(item.id)).canSubmitNewReport).toBe(false);
  await projectsRepo.update(projectId, {
    settings: { reporterPortal: { enabled: true, allowNewReports: true }, notifyReporter: false },
  });
  expect((await detail(item.id)).canReply).toBe(false);
});

it('authorizes original and visible chat files equally for GET, HEAD, and ranges', async () => {
  const item = await report();
  const foreign = await report(other.id);
  const original = await file(item.id);
  const message = staffMessage(item.id);
  const attachment = await file(item.id, message.id);
  for (const uploaded of [original, attachment]) {
    const url = `/reports/${item.id}/files/${uploaded.id}`;
    for (const method of ['GET', 'HEAD']) {
      for (const range of [undefined, 'bytes=1-3', 'bytes=-2']) {
        const response = await request(url, owner.cookie, method, range);
        expect(response.status).toBe(range ? 206 : 200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(response.headers.get('content-disposition')).toBe(
          'inline; filename="bad___name.png"'
        );
        const body = new Uint8Array(await response.arrayBuffer());
        expect(body).toEqual(
          method === 'HEAD'
            ? new Uint8Array()
            : range === 'bytes=1-3'
              ? bytes.slice(1, 4)
              : range === 'bytes=-2'
                ? bytes.slice(-2)
                : bytes
        );
      }
      expect((await request(url, other.cookie, method, 'bytes=1-3')).status).toBe(404);
      expect(
        (await request(`/reports/${foreign.id}/files/${uploaded.id}`, other.cookie, method)).status
      ).toBe(404);
    }
    expect((await request(url, owner.cookie, 'GET', 'bytes=100-200')).status).toBe(416);
  }
  reportMessagesRepo.setHidden(item.id, message.id, 'staff', true);
  for (const method of ['GET', 'HEAD'])
    expect(
      (
        await request(
          `/reports/${item.id}/files/${attachment.id}`,
          owner.cookie,
          method,
          'bytes=0-1'
        )
      ).status
    ).toBe(404);
});

it('removes disabled, inactive, and deleted projects from every read without ending the session', async () => {
  const item = await report();
  const uploaded = await file(item.id);
  for (const update of [
    { settings: { reporterPortal: { enabled: false, allowNewReports: false } } },
    { settings: { reporterPortal: { enabled: true, allowNewReports: true } }, isActive: false },
    { isActive: true, deletedAt: new Date().toISOString() },
  ]) {
    if ('deletedAt' in update)
      getDb().run('UPDATE projects SET deleted_at = ? WHERE id = ?', [
        update.deletedAt!,
        projectId,
      ]);
    else await projectsRepo.update(projectId, update);
    expect((await list()).total).toBe(0);
    expect((await request(`/reports/${item.id}`)).status).toBe(404);
    expect((await request(`/reports/${item.id}/files/${uploaded.id}`)).status).toBe(404);
    expect((await request('/projects')).status).toBe(200);
    expect((await request('/me')).status).toBe(200);
  }
});

it('rejects invalid limits, statuses, board cursors, and malformed cursor payloads', async () => {
  const item = await report();
  for (const query of [
    '?limit=0',
    '?limit=51',
    '?limit=1.5',
    '?limit=bad',
    '?status=private',
    '?groupByStatus=yes',
    '?cursor=bad',
    '?groupByStatus=true&cursor=abc',
    '?priority=highest',
  ]) {
    expect((await request(`/reports${query}`)).status).toBe(400);
  }
  for (const [value, sort] of [
    [{ sort: 'updated', at: 'bad', id: item.id }, 'updated'],
    [{ sort: 'updated', at: past, id: '' }, 'updated'],
    [{ sort: 'updated', at: past, id: item.id, extra: true }, 'updated'],
    [{ updatedAt: past, id: item.id }, 'updated'],
    [{ sort: 'newest', at: past, id: item.id }, 'updated'],
    [{ sort: 'updated', at: past, id: item.id }, 'oldest'],
    [null, 'updated'],
  ] as const) {
    const cursor = Buffer.from(JSON.stringify(value)).toString('base64url');
    expect((await request(`/reports?sort=${sort}&cursor=${cursor}`)).status).toBe(400);
  }
  for (const query of ['?sort=priority', `?q=${'x'.repeat(201)}`])
    expect((await request(`/reports${query}`)).status).toBe(400);
  expect((await list('?limit=50')).total).toBe(1);
});

it('applies project and status filters to complete counts while preserving chronological order', async () => {
  const open = await report();
  staffMessage(open.id);
  const resolved = await report(owner.id, {
    status: 'resolved',
    updatedAt: '2026-02-01T00:00:00.000Z',
  });
  staffMessage(resolved.id);
  const secondProject = await projectsRepo.create({
    name: 'Second',
    settings: { reporterPortal: { enabled: true, allowNewReports: false } },
  });
  const second = await report(owner.id, {
    projectId: secondProject.id,
    updatedAt: '2026-03-01 00:00:00',
  });
  staffMessage(second.id);
  staffMessage((await report(other.id)).id);
  const disabled = await projectsRepo.create({ name: 'Disabled', settings: {} });
  staffMessage((await report(owner.id, { projectId: disabled.id })).id);
  expect((await list()).reports.map((r) => r.id)).toEqual([second.id, resolved.id, open.id]);
  const filtered = await list(`?projectId=${projectId}&status=open&limit=1`);
  expect(filtered.total).toBe(1);
  expect(filtered.unreadCount).toBe(1);
  expect(filtered.reports[0].id).toBe(open.id);
  const response = await request(`/reports?groupByStatus=true&projectId=${projectId}&limit=1`);
  const board = (await response.json()) as PortalReportBoard;
  expect(board.columns.open.total).toBe(1);
  expect(board.columns.resolved.total).toBe(1);
  expect(board.unreadCount).toBe(2);
});

it('rejects a file whose message association belongs to another report', async () => {
  const item = await report();
  const foreign = await report(other.id);
  const message = staffMessage(foreign.id);
  const uploaded = await file(item.id);
  getDb().run('UPDATE files SET message_id = ? WHERE id = ?', [message.id, uploaded.id]);
  expect((await detail(item.id)).files).toEqual([]);
  for (const method of ['GET', 'HEAD']) {
    expect(
      (await request(`/reports/${item.id}/files/${uploaded.id}`, owner.cookie, method, 'bytes=0-1'))
        .status
    ).toBe(404);
  }
});

it('rejects revoked sessions on every authenticated read', async () => {
  const item = await report();
  const uploaded = await file(item.id);
  getDb().run('UPDATE reporter_sessions SET revoked_at = ? WHERE reporter_id = ?', [
    new Date().toISOString(),
    owner.id,
  ]);
  for (const path of [
    '/me',
    '/projects',
    '/reports',
    `/reports/${item.id}`,
    `/reports/${item.id}/files/${uploaded.id}`,
  ]) {
    expect((await request(path)).status).toBe(401);
  }
});

it('masks previous reporters after reassignment while preserving staff and current author snapshots', async () => {
  const item = await report();
  getDb().run('UPDATE reporters SET display_name = ? WHERE id = ?', [
    'alice.private-localpart',
    owner.id,
  ]);
  const earlier = reportMessagesRepo.insert(
    item.id,
    { kind: 'reporter', reporterId: owner.id },
    'Earlier reply'
  )!;
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [past, earlier.id]);
  expect((await detail(item.id)).messages[0].authorName).toBe(earlier.authorName);
  const staff = staffMessage(item.id, 'Staff reply');
  const staffTime = '2026-01-01T00:00:01.000Z';
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [staffTime, staff.id]);
  reporterOwnershipRepo.setOwner(item.id, other.id, null);
  const current = reportMessagesRepo.insert(
    item.id,
    { kind: 'reporter', reporterId: other.id },
    'Current reply'
  )!;
  const currentTime = '2026-01-01T00:00:02.000Z';
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [currentTime, current.id]);
  const result = await detail(item.id, other.cookie);
  expect(result.messages).toEqual([
    {
      id: earlier.id,
      authorKind: 'reporter',
      authorName: '',
      isPreviousReporter: true,
      isOwn: false,
      body: 'Earlier reply',
      files: [],
      createdAt: past,
    },
    {
      id: staff.id,
      authorKind: 'staff',
      authorName: staff.authorName,
      isPreviousReporter: false,
      isOwn: false,
      body: 'Staff reply',
      files: [],
      createdAt: staffTime,
    },
    {
      id: current.id,
      authorKind: 'reporter',
      authorName: current.authorName,
      isPreviousReporter: false,
      isOwn: true,
      body: 'Current reply',
      files: [],
      createdAt: currentTime,
    },
  ]);
  expect(JSON.stringify(result.messages)).not.toContain(earlier.authorName);
  getDb().run('DELETE FROM reporters WHERE id = ?', [owner.id]);
  expect((await detail(item.id, other.cookie)).messages[0]).toMatchObject({
    authorName: '',
    isPreviousReporter: true,
  });
});

it('returns the same not-found response for GET and HEAD when an original or chat object is missing', async () => {
  const item = await report();
  const message = staffMessage(item.id);
  for (const uploaded of [await file(item.id), await file(item.id, message.id)]) {
    unlinkSync(uploaded.path);
    for (const range of [undefined, 'bytes=0-3', 'bytes=100-200']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await request(
          `/reports/${item.id}/files/${uploaded.id}`,
          owner.cookie,
          method,
          range
        );
        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
      }
    }
  }
});

it('searches titles and original descriptions literally and sorts with matching cursors', async () => {
  const titled = await report(owner.id, {
    title: 'Checkout 100% broken',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
  });
  const described = await report(owner.id, {
    title: 'Payment page',
    description: 'The under_score field is empty',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-06T00:00:00.000Z',
  });
  const plain = await report(owner.id, {
    title: 'Profile page',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  });
  getDb().run('UPDATE reports SET description = ? WHERE id = ?', [
    'Staff edit mentions checkout',
    plain.id,
  ]);
  await report(other.id, { title: 'Checkout for someone else' });
  expect((await list('?q=checkout')).reports.map((r) => r.id)).toEqual([titled.id]);
  expect((await list('?q=100%25')).reports.map((r) => r.id)).toEqual([titled.id]);
  expect((await list('?q=%25')).reports.map((r) => r.id)).toEqual([titled.id]);
  expect((await list('?q=under_score')).reports.map((r) => r.id)).toEqual([described.id]);
  expect((await list('?q=_')).reports.map((r) => r.id)).toEqual([described.id]);
  expect((await list('?q=%20%20')).total).toBe(3);
  const orders = {
    updated: [described.id, plain.id, titled.id],
    newest: [titled.id, plain.id, described.id],
    oldest: [described.id, plain.id, titled.id],
  };
  for (const [sort, expected] of Object.entries(orders)) {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page: PortalReportList = await list(
        `?sort=${sort}&limit=1${cursor ? `&cursor=${cursor}` : ''}`
      );
      ids.push(...page.reports.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(expected);
  }
  const board = (await (
    await request('/reports?groupByStatus=true&q=payment')
  ).json()) as PortalReportBoard;
  expect(board.columns.open.reports.map((r) => r.id)).toEqual([described.id]);
});

it('counts reports per status for the project and search filters but not the status filter', async () => {
  await report(owner.id, { title: 'Alpha one' });
  await report(owner.id, { title: 'Alpha two', status: 'resolved' });
  await report(owner.id, { title: 'Beta', status: 'resolved' });
  const secondProject = await projectsRepo.create({
    name: 'Second',
    settings: { reporterPortal: { enabled: true, allowNewReports: false } },
  });
  await report(owner.id, { projectId: secondProject.id, title: 'Alpha elsewhere' });
  await report(other.id, { title: 'Alpha foreign' });
  expect((await list()).statusCounts).toEqual({
    open: 2,
    in_progress: 0,
    resolved: 2,
    closed: 0,
  });
  const filtered = await list(`?status=open&q=alpha&projectId=${projectId}`);
  expect(filtered.total).toBe(1);
  expect(filtered.statusCounts).toEqual({ open: 1, in_progress: 0, resolved: 1, closed: 0 });
});

it('summarizes visible replies with the latest one masked like the conversation', async () => {
  const item = await report();
  const quiet = await report();
  expect((await list()).reports.find((r) => r.id === quiet.id)).toMatchObject({
    replyCount: 0,
    latestReply: null,
  });
  const earlier = reportMessagesRepo.insert(
    item.id,
    { kind: 'reporter', reporterId: owner.id },
    'Earlier reply'
  )!;
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [past, earlier.id]);
  const staff = staffMessage(item.id, `Staff ${'x'.repeat(300)}`);
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [
    '2026-01-01T00:00:01.000Z',
    staff.id,
  ]);
  const hidden = staffMessage(item.id, 'Hidden latest');
  getDb().run('UPDATE report_messages SET created_at = ? WHERE id = ?', [
    '2026-01-01T00:00:03.000Z',
    hidden.id,
  ]);
  reportMessagesRepo.setHidden(item.id, hidden.id, 'staff', true);
  const summary = (await list()).reports.find((r) => r.id === item.id)!;
  expect(summary.replyCount).toBe(2);
  expect(summary.latestReply).toEqual({
    authorKind: 'staff',
    authorName: 'Staff display',
    isOwn: false,
    isPreviousReporter: false,
    body: `Staff ${'x'.repeat(154)}`,
    fileCount: 0,
    createdAt: '2026-01-01T00:00:01.000Z',
  });
  await file(item.id, earlier.id);
  await file(item.id, earlier.id);
  await file(item.id, staff.id);
  reportMessagesRepo.setHidden(item.id, staff.id, 'staff', true);
  expect((await list()).reports.find((r) => r.id === item.id)).toMatchObject({
    replyCount: 1,
    latestReply: { authorKind: 'reporter', isOwn: true, body: 'Earlier reply', fileCount: 2 },
  });
  reporterOwnershipRepo.setOwner(item.id, other.id, null);
  const reassigned = (await (await request('/reports', other.cookie)).json()) as PortalReportList;
  expect(reassigned.reports[0].latestReply).toEqual({
    authorKind: 'reporter',
    authorName: '',
    isOwn: false,
    isPreviousReporter: true,
    body: 'Earlier reply',
    fileCount: 2,
    createdAt: past,
  });
  expect(JSON.stringify(reassigned)).not.toContain(earlier.authorName);
});

it('returns status changes with staff names and hides captured details of portal reports', async () => {
  const item = await report();
  getDb().run(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ('gone', 'Former staff', 'gone@example.com', 'unused', 'editor')"
  );
  const rows: [string, string | null, string, string, string][] = [
    ['h1', 'staff', 'open', 'in_progress', '2026-01-02T00:00:00.000Z'],
    ['h2', 'gone', 'in_progress', 'resolved', '2026-01-03T00:00:00.000Z'],
    ['h3', null, 'resolved', 'private', '2026-01-04T00:00:00.000Z'],
  ];
  for (const [id, userId, from, to, createdAt] of rows)
    getDb().run(
      `INSERT INTO report_history (id, report_id, user_id, action, old_value, new_value, created_at)
       VALUES (?, ?, ?, 'status_changed', ?, ?, ?)`,
      [id, item.id, userId, from, to, createdAt]
    );
  getDb().run(
    `INSERT INTO report_history (id, report_id, user_id, action, old_value, new_value, created_at)
     VALUES ('h4', ?, 'staff', 'priority_changed', 'low', 'high', ?)`,
    [item.id, past]
  );
  getDb().run("UPDATE report_history SET user_id = NULL WHERE user_id = 'gone'");
  getDb().run("DELETE FROM users WHERE id = 'gone'");
  expect((await detail(item.id)).statusEvents).toEqual([
    {
      id: 'h1',
      from: 'open',
      to: 'in_progress',
      actorName: 'Staff display',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'h2',
      from: 'in_progress',
      to: 'resolved',
      actorName: null,
      createdAt: '2026-01-03T00:00:00.000Z',
    },
  ]);
  getDb().run('UPDATE reports SET metadata = ? WHERE id = ?', [
    JSON.stringify({ timestamp: past, portal: true, url: 'https://portal.example.com' }),
    item.id,
  ]);
  expect((await detail(item.id)).environment).toBeNull();
  getDb().run('UPDATE reports SET metadata = ? WHERE id = ?', [
    JSON.stringify({ timestamp: past }),
    item.id,
  ]);
  expect((await detail(item.id)).environment).toBeNull();
  getDb().run('UPDATE reports SET metadata = ? WHERE id = ?', [
    JSON.stringify({ timestamp: past, device: { type: 'desktop' } }),
    item.id,
  ]);
  expect((await detail(item.id)).environment).toBeNull();
  getDb().run('UPDATE reports SET metadata = ? WHERE id = ?', [
    JSON.stringify({ timestamp: past, url: 'https://user:secret@shop.example.com/cart?token=1' }),
    item.id,
  ]);
  expect((await detail(item.id)).environment?.pageUrl).toBe('https://shop.example.com/cart');
  getDb().run('UPDATE reports SET metadata = ? WHERE id = ?', [
    JSON.stringify({ timestamp: past, url: 'file:///Users/someone/page.html', timezone: 'UTC' }),
    item.id,
  ]);
  expect((await detail(item.id)).environment).toMatchObject({ pageUrl: null, timezone: 'UTC' });
  const handOver = (id: string, from: string) =>
    getDb().run(
      `INSERT INTO report_history (id, report_id, user_id, action, old_value, new_value, created_at)
       VALUES (?, ?, NULL, 'owner_assigned', ?, ?, ?)`,
      [id, item.id, from, owner.id, past]
    );
  handOver('claimed', 'claim@example.com');
  handOver('returned', owner.id);
  expect((await detail(item.id)).environment).toMatchObject({ timezone: 'UTC' });
  handOver('reassigned', other.id);
  expect((await detail(item.id)).environment).toBeNull();
});
