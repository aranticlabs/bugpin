import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import * as fs from 'node:fs';
import { integrationsService } from '../../src/server/services/integrations.service';
import { githubSyncService } from '../../src/server/services/integrations/github-sync.service';
import { githubService } from '../../src/server/services/integrations/github.service';
import { reportsService } from '../../src/server/services/reports.service';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  getDb,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { reportMessagesRepo } from '../../src/server/database/repositories/report-messages.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { reportMessagesService } from '../../src/server/services/report-messages.service';
import { notificationsService } from '../../src/server/services/notifications.service';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import * as storage from '../../src/server/storage/files';
import { logger } from '../../src/server/utils/logger';
import type { MediaFile } from '../../src/server/services/reports.service';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const originalNotify = notificationsService.notifyReporterMessage;
let directory: string;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
const image = (data: Buffer = png): MediaFile => ({
  data,
  filename: 'picture.png',
  mimeType: 'image/png',
});

beforeEach(async () => {
  closeDatabase();
  settingsCacheService.invalidate();
  directory = mkdtempSync(join(tmpdir(), 'bugpin-message-write-'));
  Object.assign(config, {
    dataDir: directory,
    dbPath: join(directory, 'bugpin.db'),
    screenshotsDir: join(directory, 'screenshots'),
    attachmentsDir: join(directory, 'attachments'),
    brandingDir: join(directory, 'branding'),
    avatarsDir: join(directory, 'avatars'),
  });
  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  await initDatabase();
  await initSchema();
  await runMigrations();
  getDb().exec(`
    INSERT INTO projects (id, name, api_key_hash, api_key_prefix, settings) VALUES ('project', 'Project', 'hash', 'prefix', '{"reporterPortal":{"enabled":true}}');
    INSERT INTO users (id, email, password_hash, name, role) VALUES ('staff', 'staff@example.com', 'hash', 'Staff', 'editor');
    INSERT INTO reporters (id, email, display_name) VALUES ('reporter', 'reporter@example.com', 'Reporter');
    INSERT INTO reporters (id, email, display_name) VALUES ('other', 'other@example.com', 'Other');
    INSERT INTO reports (id, project_id, title, description, original_description, metadata, reporter_id, reporter_email)
      VALUES ('report', 'project', 'Original title', 'Description', 'Original description', '{}', 'reporter', 'reporter@example.com');
    INSERT INTO reports (id, project_id, title, metadata) VALUES ('second', 'project', 'Another report', '{}');
  `);
  notificationsService.notifyReporterMessage = async () => undefined;
});

afterEach(() => {
  notificationsService.notifyReporterMessage = originalNotify;
  settingsCacheService.invalidate();
  closeDatabase();
  rmSync(directory, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
});

function counts() {
  return getDb()
    .query(
      'SELECT (SELECT COUNT(*) FROM report_messages) AS messages, (SELECT COUNT(*) FROM files) AS files'
    )
    .get();
}

function stagedFiles(): string[] {
  return readdirSync(config.screenshotsDir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.png'))
    .map(String);
}

function projectSettings(settings: object): void {
  getDb().run('UPDATE projects SET settings = ? WHERE id = ?', [
    JSON.stringify(settings),
    'project',
  ]);
}

async function uploadLimit(mb: number): Promise<void> {
  const settings = await settingsCacheService.getAll();
  const limits = { ...settings.reporterPortalLimits, uploadMbPerReporterPerDay: mb };
  getDb().run("INSERT OR REPLACE INTO settings (key, value) VALUES ('reporter_portal_limits', ?)", [
    JSON.stringify(limits),
  ]);
  settingsCacheService.invalidate();
}

describe('message writes', () => {
  it('saves text and media with a server-derived author snapshot', async () => {
    const notify = spyOn(notificationsService, 'notifyReporterMessage');
    try {
      const result = await reportMessagesService.send('report', 'staff', ' A reply ', true, [
        image(),
      ]);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error);
      expect(result.value).toMatchObject({
        message: 'A reply',
        authorKind: 'staff',
        authorName: 'Staff',
        userId: 'staff',
      });
      expect(result.value.files).toHaveLength(1);
      expect(result.value.files[0]).toMatchObject({
        reportId: 'report',
        messageId: result.value.id,
        uploadedByReporterId: null,
      });
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      notify.mockRestore();
    }
  });

  it('accepts file-only messages and five files', async () => {
    const result = await reportMessagesService.send(
      'report',
      'staff',
      '',
      false,
      Array.from({ length: 5 }, () => image())
    );
    expect(result.success).toBe(true);
    expect(counts()).toEqual({ messages: 1, files: 5 });
  });

  it('rejects six files before writing anything', async () => {
    const result = await reportMessagesService.send(
      'report',
      'staff',
      'Reply',
      false,
      Array.from({ length: 6 }, () => image())
    );
    expect(result).toMatchObject({ success: false, code: 'INVALID_FILE' });
    expect(counts()).toEqual({ messages: 0, files: 0 });
    expect(stagedFiles()).toEqual([]);
  });

  for (const body of ['', ' '.repeat(10), 'x'.repeat(5001)]) {
    it(`rejects invalid text of length ${body.length}`, async () => {
      expect(await reportMessagesService.send('report', 'staff', body)).toMatchObject({
        success: false,
        code: 'VALIDATION_ERROR',
      });
      expect(counts()).toEqual({ messages: 0, files: 0 });
    });
  }

  for (const file of [
    image(Buffer.from('invalid')),
    { ...image(), mimeType: 'image/svg+xml' },
    { ...image(), mimeType: 'application/pdf' },
  ]) {
    it(`rejects invalid ${file.mimeType} content atomically`, async () => {
      expect(
        await reportMessagesService.send('report', 'staff', 'Reply', false, [image(), file])
      ).toMatchObject({ success: false, code: 'INVALID_FILE' });
      expect(counts()).toEqual({ messages: 0, files: 0 });
      expect(stagedFiles()).toEqual([]);
    });
  }

  it('uses project size limits', async () => {
    projectSettings({ screenshot: { maxImageUploadSizeMb: 0.00001 } });
    expect(
      await reportMessagesService.send('report', 'staff', 'Reply', false, [image()])
    ).toMatchObject({ success: false, code: 'INVALID_FILE' });
    expect(stagedFiles()).toEqual([]);
  });

  it('returns a controlled failure when the staff author is absent', async () => {
    getDb().run("DELETE FROM users WHERE id = 'staff'");
    expect(
      reportMessagesRepo.insert('report', { kind: 'staff', userId: 'staff' }, 'Reply')
    ).toBeNull();
    expect(await reportMessagesService.send('report', 'staff', 'Reply')).toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(counts()).toEqual({ messages: 0, files: 0 });
  });

  it('rejects an author that disappears while files are being stored', async () => {
    const save = storage.saveFile;
    const staged = spyOn(storage, 'saveFile').mockImplementation(async (data) => {
      const result = await save(data);
      getDb().run("DELETE FROM users WHERE id = 'staff'");
      return result;
    });
    try {
      expect(
        await reportMessagesService.send('report', 'staff', 'Reply', false, [image()])
      ).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
      expect(counts()).toEqual({ messages: 0, files: 0 });
      expect(stagedFiles()).toEqual([]);
    } finally {
      staged.mockRestore();
    }
  });

  it('handles the author disappearing immediately before INSERT', async () => {
    const insert = reportMessagesRepo.insert;
    const race = spyOn(reportMessagesRepo, 'insert').mockImplementation(
      (reportId, author, body) => {
        getDb().run("DELETE FROM users WHERE id = 'staff'");
        return insert.call(reportMessagesRepo, reportId, author, body);
      }
    );
    try {
      expect(
        await reportMessagesService.send('report', 'staff', 'Reply', false, [image()])
      ).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
      expect(counts()).toEqual({ messages: 0, files: 0 });
      expect(stagedFiles()).toEqual([]);
    } finally {
      race.mockRestore();
    }
  });

  it('rolls back the message and all file records if an insert fails', async () => {
    const insert = filesRepo.insert;
    let calls = 0;
    const failed = spyOn(filesRepo, 'insert').mockImplementation((data) => {
      if (++calls === 2) throw new Error('Storage record failed');
      return insert.call(filesRepo, data);
    });
    try {
      expect(
        await reportMessagesService.send('report', 'staff', 'Reply', false, [image(), image()])
      ).toMatchObject({ success: false, code: 'MESSAGE_WRITE_FAILED' });
      expect(counts()).toEqual({ messages: 0, files: 0 });
      expect(stagedFiles()).toEqual([]);
    } finally {
      failed.mockRestore();
    }
  });

  it('discards already staged files if later storage fails', async () => {
    const save = storage.saveFile;
    let calls = 0;
    const failed = spyOn(storage, 'saveFile').mockImplementation(async (data) => {
      if (++calls === 2) throw new Error('Storage failed');
      return save(data);
    });
    try {
      expect(
        await reportMessagesService.send('report', 'staff', 'Reply', false, [image(), image()])
      ).toMatchObject({ success: false, code: 'MESSAGE_WRITE_FAILED' });
      expect(counts()).toEqual({ messages: 0, files: 0 });
      expect(stagedFiles()).toEqual([]);
    } finally {
      failed.mockRestore();
    }
  });

  it('keeps the saved message when email delivery fails', async () => {
    notificationsService.notifyReporterMessage = async () => {
      throw new Error('SMTP unavailable');
    };
    expect((await reportMessagesService.send('report', 'staff', 'Reply')).success).toBe(true);
    expect(counts()).toEqual({ messages: 1, files: 0 });
  });

  it('rejects a mismatched report/message file association', async () => {
    const message = reportMessagesRepo.insert(
      'report',
      { kind: 'staff', userId: 'staff' },
      'Reply'
    );
    if (!message) throw new Error('Missing message');
    const file = {
      reportId: 'second',
      messageId: message.id,
      type: 'screenshot' as const,
      filename: 'x.png',
      path: '/x.png',
      mimeType: 'image/png',
      sizeBytes: 1,
    };
    expect(() => filesRepo.insert(file)).toThrow('Message does not belong to this report');
    await expect(filesRepo.create(file)).rejects.toThrow('Message does not belong to this report');
    expect(counts()).toEqual({ messages: 1, files: 0 });
  });
});

describe('reporter policy and quotas', () => {
  it('allows resolved replies without changing report content or status', async () => {
    getDb().run("UPDATE reports SET status = 'resolved' WHERE id = 'report'");
    expect(
      (await reportMessagesService.sendReporter('report', 'reporter', 'More details', [image()]))
        .success
    ).toBe(true);
    expect(
      getDb()
        .query(
          "SELECT status, title, original_description, priority, assigned_to, last_reporter_activity_at FROM reports WHERE id = 'report'"
        )
        .get()
    ).toMatchObject({
      status: 'resolved',
      title: 'Original title',
      original_description: 'Original description',
      priority: 'medium',
      assigned_to: null,
      last_reporter_activity_at: expect.any(String),
    });
    const files = await filesRepo.findByReportId('report');
    expect(files[0].uploadedByReporterId).toBe('reporter');
    expect(await filesRepo.findOriginalByReportId('report')).toEqual([]);
  });

  for (const settings of [
    { reporterNotifications: { messagingEnabled: false } },
    { notifyReporter: false },
  ]) {
    it('enforces messaging off for staff and reporters while retaining readable history', async () => {
      await reportMessagesService.send('report', 'staff', 'Before');
      projectSettings({ reporterPortal: { enabled: true }, ...settings });
      expect(await reportMessagesService.send('report', 'staff', 'After')).toMatchObject({
        success: false,
        code: 'MESSAGING_DISABLED',
      });
      expect(await reportMessagesService.sendReporter('report', 'reporter', 'After')).toMatchObject(
        { success: false, code: 'MESSAGING_DISABLED' }
      );
      expect((await reportMessagesService.listForReporter('report', 'reporter')).success).toBe(
        true
      );
      expect(counts()).toEqual({ messages: 1, files: 0 });
    });
  }

  it('denies other reporters and disabled projects', async () => {
    expect(await reportMessagesService.sendReporter('report', 'other', 'Reply')).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
    projectSettings({ reporterPortal: { enabled: false } });
    expect(await reportMessagesService.sendReporter('report', 'reporter', 'Reply')).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
    expect(counts()).toEqual({ messages: 0, files: 0 });
  });

  it('rechecks closed status after files are staged', async () => {
    const save = storage.saveFile;
    const closed = spyOn(storage, 'saveFile').mockImplementation(async (data) => {
      const file = await save(data);
      getDb().run("UPDATE reports SET status = 'closed' WHERE id = 'report'");
      return file;
    });
    try {
      expect(
        await reportMessagesService.sendReporter('report', 'reporter', 'Reply', [image()])
      ).toMatchObject({ success: false, code: 'REPORT_CLOSED' });
      expect(counts()).toEqual({ messages: 0, files: 0 });
      expect(stagedFiles()).toEqual([]);
      expect(
        (await reportMessagesService.send('report', 'staff', 'Staff can still reply')).success
      ).toBe(true);
    } finally {
      closed.mockRestore();
    }
  });

  it('enforces the daily cap atomically across concurrent uploads', async () => {
    await uploadLimit(1);
    const large = image(Buffer.concat([png, Buffer.alloc(600 * 1024)]));
    const results = await Promise.all([
      reportMessagesService.sendReporter('report', 'reporter', 'First', [large]),
      reportMessagesService.sendReporter('report', 'reporter', 'Second', [large]),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)).toMatchObject({
      code: 'UPLOAD_QUOTA_EXCEEDED',
    });
    expect(counts()).toEqual({ messages: 1, files: 1 });
    expect(stagedFiles()).toHaveLength(1);
  });

  it('counts original uploads by their uploader across projects and exempts staff', async () => {
    await uploadLimit(1);
    getDb().exec(
      "INSERT INTO projects (id, name, api_key_hash, api_key_prefix) VALUES ('elsewhere', 'Other project', 'other-hash', 'other-prefix'); UPDATE reports SET project_id = 'elsewhere' WHERE id = 'second';"
    );
    await filesRepo.create({
      reportId: 'second',
      uploadedByReporterId: 'reporter',
      type: 'screenshot',
      filename: 'original.png',
      path: '/original.png',
      mimeType: 'image/png',
      sizeBytes: 1024 * 1024,
    });
    expect(
      await reportMessagesService.sendReporter('report', 'reporter', 'Reply', [image()])
    ).toMatchObject({ success: false, code: 'UPLOAD_QUOTA_EXCEEDED' });
    expect(
      (await reportMessagesService.send('report', 'staff', 'Staff reply', false, [image()])).success
    ).toBe(true);
  });

  it('honors the project video budget with SQLite-formatted timestamps', async () => {
    projectSettings({
      reporterPortal: { enabled: true },
      screenshot: { maxVideoUploadMbPerDay: 1 },
    });
    await filesRepo.create({
      reportId: 'second',
      type: 'video',
      filename: 'old.mp4',
      path: '/old.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1024 * 1024,
    });
    getDb().exec("UPDATE files SET created_at = datetime('now')");
    const video = {
      data: Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]),
      mimeType: 'video/mp4',
      filename: 'video.mp4',
    };
    expect(
      await reportMessagesService.sendReporter('report', 'reporter', 'Reply', [video])
    ).toMatchObject({ success: false, code: 'VIDEO_QUOTA_EXCEEDED' });
    expect(counts()).toEqual({ messages: 0, files: 1 });
  });
});

describe('message reads and moderation', () => {
  it('loads attachments with one batch lookup for the entire thread', async () => {
    for (let i = 0; i < 4; i++)
      await reportMessagesService.send('report', 'staff', `Reply ${i}`, false, [image()]);
    const single = spyOn(filesRepo, 'findByMessageId');
    const batch = spyOn(filesRepo, 'findByReportMessages');
    try {
      const result = await reportMessagesService.listByReport('report');
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error);
      expect(result.value).toHaveLength(4);
      expect(result.value.every((message) => message.files.length === 1)).toBe(true);
      expect(single).not.toHaveBeenCalled();
      expect(batch).toHaveBeenCalledTimes(1);
    } finally {
      single.mockRestore();
      batch.mockRestore();
    }
  });

  it('hides and unhides messages and attachments for reporters with audited idempotent actions', async () => {
    const sent = await reportMessagesService.send('report', 'staff', 'Reply', false, [image()]);
    if (!sent.success) throw new Error(sent.error);
    expect(
      (await reportMessagesService.setHidden('report', sent.value.id, 'staff', true)).success
    ).toBe(true);
    await reportMessagesService.setHidden('report', sent.value.id, 'staff', true);
    expect(await reportMessagesService.listForReporter('report', 'reporter')).toEqual({
      success: true,
      value: [],
    });
    const staff = await reportMessagesService.listByReport('report');
    if (!staff.success) throw new Error(staff.error);
    expect(staff.value[0].hiddenAt).not.toBeNull();
    expect(staff.value[0].files).toHaveLength(1);
    expect(
      (await reportMessagesService.setHidden('report', sent.value.id, 'staff', false)).success
    ).toBe(true);
    expect(await reportMessagesService.listForReporter('report', 'reporter')).toMatchObject({
      success: true,
      value: [{ body: 'Reply', files: [{ id: sent.value.files[0].id }] }],
    });
    expect(
      getDb().query('SELECT action, new_value FROM report_history ORDER BY rowid').all()
    ).toEqual([
      { action: 'message_hidden', new_value: sent.value.id },
      { action: 'message_unhidden', new_value: sent.value.id },
    ]);
    expect(
      await reportMessagesService.setHidden('second', sent.value.id, 'staff', true)
    ).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('rolls back visibility changes if history cannot be recorded', async () => {
    const sent = await reportMessagesService.send('report', 'staff', 'Reply');
    if (!sent.success) throw new Error(sent.error);
    getDb().exec(
      "CREATE TRIGGER reject_history BEFORE INSERT ON report_history BEGIN SELECT RAISE(ABORT, 'History unavailable'); END;"
    );
    expect(
      await reportMessagesService.setHidden('report', sent.value.id, 'staff', true)
    ).toMatchObject({ success: false, code: 'MESSAGE_WRITE_FAILED' });
    expect(reportMessagesRepo.findById('report', sent.value.id)?.hiddenAt).toBeNull();
  });
});

it('removes partial local writes when storage fails', async () => {
  const write = fs.writeFileSync;
  const failed = spyOn(fs, 'writeFileSync').mockImplementation(
    (...args: Parameters<typeof fs.writeFileSync>) => {
      write(...args);
      throw new Error('Disk full');
    }
  );
  try {
    expect(
      await reportMessagesService.send('report', 'staff', 'Reply', false, [image()])
    ).toMatchObject({ success: false, code: 'MESSAGE_WRITE_FAILED' });
    expect(stagedFiles()).toEqual([]);
    expect(counts()).toEqual({ messages: 0, files: 0 });
  } finally {
    failed.mockRestore();
  }
});

it('keeps chat files out of staff originals and both forwarding paths while cleanup can still find them', async () => {
  const message = await reportMessagesService.send('report', 'staff', 'Reply', false, [image()]);
  if (!message.success) throw new Error(message.error);
  const original = await filesRepo.create({
    reportId: 'report',
    type: 'screenshot',
    filename: 'original.png',
    path: '/original.png',
    mimeType: 'image/png',
    sizeBytes: 10,
  });
  expect(await reportsService.getReportFiles('report')).toEqual({
    success: true,
    value: [original],
  });
  const detail = await reportsService.getByIdWithFiles('report');
  if (!detail.success) throw new Error(detail.error);
  expect(detail.value.files).toEqual([original]);
  expect(await filesRepo.findByReportId('report')).toHaveLength(2);
  getDb().run(
    "INSERT INTO integrations (id, project_id, type, name, config) VALUES ('integration', 'project', 'github', 'GitHub', ?)",
    [JSON.stringify({ owner: 'org', repo: 'repo', accessToken: 'test' })]
  );
  const create = spyOn(githubService, 'createIssue').mockResolvedValue({
    success: true,
    issueNumber: 1,
    issueUrl: 'https://github.com/org/repo/issues/1',
  });
  const update = spyOn(githubService, 'updateIssue').mockResolvedValue({
    success: true,
    issueNumber: 1,
    issueUrl: 'https://github.com/org/repo/issues/1',
  });
  try {
    expect((await integrationsService.forwardReport('report', 'integration')).success).toBe(true);
    expect((await githubSyncService.syncReport('report', 'integration')).success).toBe(true);
    getDb().run("UPDATE reports SET github_issue_number = 1 WHERE id = 'report'");
    expect((await githubSyncService.syncReport('report', 'integration')).success).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    for (const call of create.mock.calls) expect(call[0].files).toEqual([original]);
    expect(update.mock.calls[0][1].files).toEqual([original]);
  } finally {
    create.mockRestore();
    update.mockRestore();
  }
});

it('ignores uploader usage older than the rolling 24-hour window', async () => {
  await uploadLimit(1);
  await filesRepo.create({
    reportId: 'second',
    uploadedByReporterId: 'reporter',
    type: 'screenshot',
    filename: 'old.png',
    path: '/old.png',
    mimeType: 'image/png',
    sizeBytes: 2 * 1024 * 1024,
  });
  getDb().exec("UPDATE files SET created_at = datetime('now', '-25 hours')");
  expect(
    (await reportMessagesService.sendReporter('report', 'reporter', 'Reply', [image()])).success
  ).toBe(true);
});

it('orders mixed SQLite and ISO message timestamps chronologically', async () => {
  getDb()
    .exec(`INSERT INTO report_messages (id, report_id, author_kind, user_id, author_name, body, created_at) VALUES
    ('first', 'report', 'staff', 'staff', 'Staff', 'Earlier', '2026-01-01T08:00:00.000Z'),
    ('second', 'report', 'staff', 'staff', 'Staff', 'Later', '2026-01-01 12:00:00');`);
  expect((await reportMessagesRepo.findByReportId('report')).map((message) => message.id)).toEqual([
    'first',
    'second',
  ]);
});

it('inherits the global messaging switch and permits an explicit project override', async () => {
  getDb().run("INSERT OR REPLACE INTO settings (key, value) VALUES ('reporter_notifications', ?)", [
    JSON.stringify({ messagingEnabled: false }),
  ]);
  settingsCacheService.invalidate();
  expect(await reportMessagesService.send('report', 'staff', 'Reply')).toMatchObject({
    success: false,
    code: 'MESSAGING_DISABLED',
  });
  projectSettings({
    reporterPortal: { enabled: true },
    reporterNotifications: { messagingEnabled: true, emailEnabled: false },
  });
  expect((await reportMessagesService.send('report', 'staff', 'Reply')).success).toBe(true);
});
