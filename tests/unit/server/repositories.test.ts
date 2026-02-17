import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../../src/server/config';
import {
  initDatabase,
  initSchema,
  closeDatabase,
  getDb,
} from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { integrationsRepo } from '../../../src/server/database/repositories/integrations.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../../src/server/database/repositories/files.repo';
import { webhooksRepo } from '../../../src/server/database/repositories/webhooks.repo';
import {
  notificationPreferencesRepo,
  projectNotificationDefaultsRepo,
} from '../../../src/server/database/repositories/notification-preferences.repo';

const originalConfig = { ...config };
let tempDir = '';

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-db-repo-'));
  Object.assign(config, {
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'bugpin.db'),
    uploadsDir: path.join(tempDir, 'uploads'),
    screenshotsDir: path.join(tempDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(tempDir, 'uploads', 'attachments'),
    brandingDir: path.join(tempDir, 'uploads', 'branding'),
    avatarsDir: path.join(tempDir, 'uploads', 'avatars'),
  });
  await initDatabase();
  await initSchema();
});

afterAll(() => {
  closeDatabase();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  Object.assign(config, originalConfig);
});

function resetDb() {
  const db = getDb();
  db.exec('DELETE FROM files');
  db.exec('DELETE FROM reports');
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM notification_preferences');
  db.exec('DELETE FROM project_notification_defaults');
  db.exec('DELETE FROM webhooks');
  db.exec('DELETE FROM integrations');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM projects');
  db.exec('DELETE FROM settings');
}

beforeEach(() => {
  resetDb();
});

async function createProject(name = 'Project') {
  const result = await projectsRepo.create({ name });
  return result.project;
}

async function createUser(email = 'user@example.com') {
  return usersRepo.create({
    email,
    name: 'User',
    passwordHash: 'hash',
    role: 'admin',
  });
}

const baseMetadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop', os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};

describe('projectsRepo', () => {
  it('creates, updates, and deletes projects', async () => {
    const { project, apiKey } = await projectsRepo.create({ name: 'Alpha' });
    expect(apiKey).toContain('proj_');

    const byApiKey = await projectsRepo.findByApiKey(apiKey);
    expect(byApiKey?.id).toBe(project.id);

    const updated = await projectsRepo.update(project.id, { name: 'Beta' });
    expect(updated?.name).toBe('Beta');

    const count = await projectsRepo.count();
    expect(count).toBe(1);

    const newKey = await projectsRepo.regenerateApiKey(project.id);
    expect(newKey).toBeTruthy();

    const deleted = await projectsRepo.delete(project.id);
    expect(deleted).toBe(true);

    const all = await projectsRepo.findAll(true);
    expect(all).toHaveLength(1);
  });
});

describe('usersRepo', () => {
  it('creates, updates, and deletes users', async () => {
    const user = await createUser('Admin@Example.com');
    expect(user.email).toBe('admin@example.com');

    const viewer = await usersRepo.create({
      email: 'viewer@example.com',
      name: 'Viewer',
      passwordHash: 'hash',
      role: 'viewer',
    });

    const allUsers = await usersRepo.findAll();
    expect(allUsers).toHaveLength(2);

    const admins = await usersRepo.findByRole('admin');
    expect(admins.some((entry) => entry.id === user.id)).toBe(true);

    const viewers = await usersRepo.findByRole('viewer');
    expect(viewers.some((entry) => entry.id === viewer.id)).toBe(true);

    const withPassword = await usersRepo.findByEmailWithPassword('admin@example.com');
    expect(withPassword?.passwordHash).toBe('hash');

    const updated = await usersRepo.update(user.id, {
      name: 'Admin',
      isActive: false,
      email: 'Updated@Example.com',
      avatarUrl: null,
      role: 'viewer',
    });
    expect(updated?.isActive).toBe(false);
    expect(updated?.email).toBe('updated@example.com');

    const passwordUpdated = await usersRepo.updatePassword(user.id, 'hash2');
    expect(passwordUpdated).toBe(true);

    await usersRepo.updateLastLogin(user.id);
    const reloaded = await usersRepo.findById(user.id);
    expect(reloaded?.lastLoginAt).toBeTruthy();

    const avatarUpdated = await usersRepo.updateAvatarUrl(user.id, null);
    expect(avatarUpdated?.avatarUrl).toBeUndefined();

    const exists = await usersRepo.emailExists('updated@example.com');
    expect(exists).toBe(true);

    const excluded = await usersRepo.emailExists('updated@example.com', user.id);
    expect(excluded).toBe(false);

    const oldEmailExists = await usersRepo.emailExists('admin@example.com');
    expect(oldEmailExists).toBe(false);

    const deleted = await usersRepo.delete(user.id);
    expect(deleted).toBe(true);
  });
});

describe('sessionsRepo', () => {
  it('manages sessions lifecycle', async () => {
    const user = await createUser('session@example.com');
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const session = await sessionsRepo.create({
      userId: user.id,
      expiresAt,
      ipAddress: '127.0.0.1',
    });

    const valid = await sessionsRepo.findValidById(session.id);
    expect(valid).toBeTruthy();

    await sessionsRepo.updateActivity(session.id);

    const extended = await sessionsRepo.extend(
      session.id,
      new Date(Date.now() + 120_000).toISOString(),
    );
    expect(extended).toBe(true);

    const byUser = await sessionsRepo.findByUserId(user.id);
    expect(byUser).toHaveLength(1);

    const deleted = await sessionsRepo.delete(session.id);
    expect(deleted).toBe(true);
  });

  it('deletes expired sessions', async () => {
    const user = await createUser('expired@example.com');
    const expiresAt = new Date(Date.now() - 60_000).toISOString();

    await sessionsRepo.create({ userId: user.id, expiresAt });

    const removed = await sessionsRepo.deleteExpired();
    expect(removed).toBe(1);
  });
});

describe('settingsRepo', () => {
  it('returns defaults when settings are missing', async () => {
    const settings = await settingsRepo.getAll();
    expect(settings.appName).toBe('BugPin');
    expect(settings.notifications.notifyOnNewReport).toBe(true);
  });

  it('updates and reads settings', async () => {
    await settingsRepo.set('app_name', 'BugPin');
    const appName = await settingsRepo.get<string>('app_name');
    expect(appName).toBe('BugPin');

    const updated = await settingsRepo.updateAll({ appUrl: 'https://example.com' });
    expect(updated.appUrl).toBe('https://example.com');

    const merged = await settingsRepo.updateNested('branding', { primaryColor: '#123456' });
    expect(merged.branding.primaryColor).toBe('#123456');
  });
});

describe('integrationsRepo', () => {
  it('creates and updates integrations', async () => {
    const project = await createProject('Integrations');

    const integration = await integrationsRepo.create({
      projectId: project.id,
      type: 'github',
      name: 'GitHub',
      config: { owner: 'org', repo: 'repo', accessToken: 'token' },
    });

    const byProject = await integrationsRepo.findByProjectId(project.id);
    expect(byProject).toHaveLength(1);

    const updated = await integrationsRepo.update(integration.id, { isActive: false });
    expect(updated?.isActive).toBe(false);

    await integrationsRepo.updateLastUsed(integration.id);
    const afterUse = await integrationsRepo.findById(integration.id);
    expect(afterUse?.usageCount).toBe(1);

    const count = await integrationsRepo.countByProject(project.id);
    expect(count).toBe(1);

    const deleted = await integrationsRepo.delete(integration.id);
    expect(deleted).toBe(true);
  });
});

describe('reportsRepo', () => {
  it('creates, updates, and deletes reports', async () => {
    const project = await createProject('Reports');

    const user = await createUser('resolver@example.com');
    const report = await reportsRepo.create({
      projectId: project.id,
      title: 'Login crash',
      description: 'Crash on login',
      priority: 'medium',
      metadata: baseMetadata,
    });

    const updated = await reportsRepo.update(report.id, {
      status: 'resolved',
      resolvedBy: user.id,
    });
    expect(updated?.resolvedAt).toBeTruthy();

    const reopened = await reportsRepo.update(report.id, { status: 'open' });
    expect(reopened?.resolvedAt).toBeUndefined();

    const closed = await reportsRepo.update(report.id, { status: 'closed' });
    expect(closed?.closedAt).toBeTruthy();

    const deleted = await reportsRepo.delete(report.id);
    expect(deleted).toBe(true);

    const projectAfter = await projectsRepo.findById(project.id);
    expect(projectAfter?.reportsCount).toBe(0);
  });

  it('filters and searches reports', async () => {
    const project = await createProject('Search');
    const first = await reportsRepo.create({
      projectId: project.id,
      title: 'Crash on login',
      description: 'Login crash',
      priority: 'high',
      metadata: baseMetadata,
    });
    await reportsRepo.create({
      projectId: project.id,
      title: 'UI glitch',
      description: 'Minor UI issue',
      priority: 'low',
      metadata: baseMetadata,
    });

    await reportsRepo.update(first.id, { status: 'in_progress' });

    const result = await reportsRepo.find({
      projectId: project.id,
      status: ['in_progress'],
      priority: ['high'],
      search: 'Crash',
    });

    expect(result.total).toBe(1);
    expect(result.data[0].title).toBe('Crash on login');
  });

  it('handles github sync fields', async () => {
    const project = await createProject('GitHub');
    const report = await reportsRepo.create({
      projectId: project.id,
      title: 'Issue',
      priority: 'low',
      metadata: baseMetadata,
    });

    await reportsRepo.updateGitHubSyncStatus(report.id, {
      status: 'synced',
      issueNumber: 123,
      issueUrl: 'https://github.com/org/repo/issues/123',
    });

    const synced = await reportsRepo.findSyncedByProject(project.id);
    expect(synced).toHaveLength(1);

    const byIssue = await reportsRepo.findByGitHubIssueNumber(project.id, 123);
    expect(byIssue?.id).toBe(report.id);

    await reportsRepo.markPendingSync(report.id);
    const pending = await reportsRepo.findByGitHubSyncStatus('pending', project.id);
    expect(pending).toHaveLength(1);

    await reportsRepo.clearGitHubSyncStatus(report.id);
    const unsynced = await reportsRepo.findUnsyncedByProject(project.id);
    expect(unsynced).toHaveLength(1);
  });

  it('returns stats and bulk updates', async () => {
    const project = await createProject('Stats');
    const first = await reportsRepo.create({
      projectId: project.id,
      title: 'One',
      priority: 'low',
      metadata: baseMetadata,
    });
    const second = await reportsRepo.create({
      projectId: project.id,
      title: 'Two',
      priority: 'low',
      metadata: baseMetadata,
    });

    const updatedCount = await reportsRepo.bulkUpdate([first.id, second.id], { status: 'closed' });
    expect(updatedCount).toBe(2);

    const stats = await reportsRepo.getStats(project.id);
    expect(stats.total).toBe(2);
    expect(stats.byStatus.closed).toBe(2);

    const count = await reportsRepo.countByProject(project.id);
    expect(count).toBe(2);

    const db = getDb();
    const oldDate = new Date(Date.now() - 86400_000 * 10).toISOString();
    db.run('UPDATE reports SET created_at = ? WHERE id = ?', [oldDate, first.id]);
    const oldIds = await reportsRepo.findIdsOlderThan(5);
    expect(oldIds).toContain(first.id);
  });
});

describe('filesRepo', () => {
  it('tracks file storage totals', async () => {
    const project = await createProject('Files');
    const report = await reportsRepo.create({
      projectId: project.id,
      title: 'File report',
      priority: 'medium',
      metadata: baseMetadata,
    });

    const file = await filesRepo.create({
      reportId: report.id,
      type: 'screenshot',
      filename: 'screen.png',
      path: '/tmp/screen.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      width: 10,
      height: 10,
    });

    await filesRepo.create({
      reportId: report.id,
      type: 'attachment',
      filename: 'doc.pdf',
      path: 's3://bucket/doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 200,
    });

    const byReport = await filesRepo.findByReportId(report.id);
    expect(byReport).toHaveLength(2);

    const size = await filesRepo.getSizeByReportId(report.id);
    expect(size).toBe(300);

    const totals = await filesRepo.getTotalSize();
    expect(totals).toBe(300);

    const storageCounts = await filesRepo.countByStorageType();
    expect(storageCounts.s3).toBe(1);
    expect(storageCounts.local).toBe(1);

    const updated = await filesRepo.updatePath(file.id, '/tmp/renamed.png');
    expect(updated).toBe(true);

    const deleted = await filesRepo.deleteByReportId(report.id);
    expect(deleted).toBe(2);
  });
});

describe('webhooksRepo', () => {
  it('creates and updates webhooks', async () => {
    const project = await createProject('Webhooks');

    const webhook = await webhooksRepo.create({
      projectId: project.id,
      name: 'Hook',
      url: 'https://example.com/webhook',
      events: ['report.created'],
    });

    const secondary = await webhooksRepo.create({
      projectId: project.id,
      name: 'Hook 2',
      url: 'https://example.com/webhook2',
      events: ['report.updated', 'report.created'],
      secret: 'secret',
    });

    const all = await webhooksRepo.findAll();
    expect(all).toHaveLength(2);

    const byProject = await webhooksRepo.findByProjectId(project.id);
    expect(byProject).toHaveLength(2);

    const byEvent = await webhooksRepo.findActiveByEvent(project.id, 'report.created');
    expect(byEvent.length).toBeGreaterThan(0);

    const updated = await webhooksRepo.update(secondary.id, {
      isActive: false,
      secret: null,
      events: ['report.created'],
    });
    expect(updated?.isActive).toBe(false);

    const active = await webhooksRepo.findActiveByProjectId(project.id);
    expect(active).toHaveLength(1);

    await webhooksRepo.recordTrigger(webhook.id, 200, true);
    const reloaded = await webhooksRepo.findById(webhook.id);
    expect(reloaded?.failureCount).toBe(0);

    await webhooksRepo.recordTrigger(webhook.id, 500, false);
    const failed = await webhooksRepo.findById(webhook.id);
    expect(failed?.failureCount).toBe(1);

    const removed = await webhooksRepo.delete(webhook.id);
    expect(removed).toBe(true);

    const removedByProject = await webhooksRepo.deleteByProjectId(project.id);
    expect(removedByProject).toBe(1);
  });
});

describe('notificationPreferencesRepo', () => {
  it('creates and updates preferences with defaults', async () => {
    const project = await createProject('Notifications');
    const user = await createUser('notify@example.com');

    await projectNotificationDefaultsRepo.upsert(project.id, { defaultEmailEnabled: false });

    const created = await notificationPreferencesRepo.upsert(user.id, project.id, {
      notifyOnAssignment: false,
    });
    expect(created.emailEnabled).toBe(false);

    const updated = await notificationPreferencesRepo.upsert(user.id, project.id, {
      emailEnabled: true,
    });
    expect(updated.emailEnabled).toBe(true);

    const byUser = await notificationPreferencesRepo.findByUser(user.id);
    expect(byUser).toHaveLength(1);

    const enabled = await notificationPreferencesRepo.findByProjectWithEmailEnabled(project.id);
    expect(enabled).toHaveLength(1);

    const deleted = await notificationPreferencesRepo.delete(user.id, project.id);
    expect(deleted).toBe(true);
  });

  it('creates defaults when missing', async () => {
    const project = await createProject('Defaults');
    const user = await createUser('defaults@example.com');

    const prefs = await notificationPreferencesRepo.getOrCreate(user.id, project.id);
    expect(prefs.notifyOnNewReport).toBe(true);

    const removed = await projectNotificationDefaultsRepo.delete(project.id);
    expect(removed).toBe(false);
  });
});
