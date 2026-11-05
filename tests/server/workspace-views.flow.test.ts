import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { workspaceViewsService } from '../../src/server/services/workspace-views.service';
import { logger } from '../../src/server/utils/logger';
import type { Project, ReportStatus, User } from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const metadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop' as const, os: 'macOS' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: new Date().toISOString(),
};
let tempDir = '';
let user: User;
let otherUser: User;
let project: Project;

async function createUser(): Promise<User> {
  return usersRepo.create({
    email: `user-${crypto.randomUUID()}@example.test`,
    passwordHash: 'hash',
    name: 'User',
    role: 'viewer',
  });
}

async function createReport(options: {
  status?: ReportStatus;
  assignedTo?: string;
  projectId?: string;
}) {
  const report = await reportsRepo.create({
    projectId: options.projectId ?? project.id,
    title: `Report ${crypto.randomUUID()}`,
    assignedTo: options.assignedTo,
    metadata,
  });
  if (options.status && options.status !== 'open') {
    await reportsRepo.update(report.id, { status: options.status });
  }
  return report;
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-workspace-views-'));
  Object.assign(config, { dataDir: tempDir, dbPath: path.join(tempDir, 'bugpin.db') });
  await initDatabase();
  await initSchema();
  await runMigrations();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
});

beforeEach(async () => {
  user = await createUser();
  otherUser = await createUser();
  project = await projectsRepo.create({ name: `Project ${crypto.randomUUID()}` });
});

describe('pinned projects', () => {
  it('pins and unpins projects per user with active report counts', async () => {
    await createReport({});
    await createReport({ status: 'in_progress' });
    await createReport({ status: 'resolved' });

    expect((await workspaceViewsService.pinProject(user.id, project.id)).success).toBe(true);
    expect((await workspaceViewsService.pinProject(user.id, project.id)).success).toBe(true);

    const pinned = await workspaceViewsService.listPinnedProjects(user.id);
    expect(pinned.success && pinned.value).toEqual([
      { id: project.id, name: project.name, isActive: true, activeReportsCount: 2 },
    ]);
    const others = await workspaceViewsService.listPinnedProjects(otherUser.id);
    expect(others.success && others.value).toEqual([]);

    await workspaceViewsService.unpinProject(user.id, project.id);
    const after = await workspaceViewsService.listPinnedProjects(user.id);
    expect(after.success && after.value).toEqual([]);
  });

  it('pins any number of projects', async () => {
    for (let index = 0; index < 10; index++) {
      const extra = await projectsRepo.create({ name: `Pinned ${index}` });
      expect((await workspaceViewsService.pinProject(user.id, extra.id)).success).toBe(true);
    }

    expect((await workspaceViewsService.pinProject(user.id, project.id)).success).toBe(true);
    const pinned = await workspaceViewsService.listPinnedProjects(user.id);
    expect(pinned.success && pinned.value).toHaveLength(11);
  });

  it('hides deleted projects', async () => {
    await workspaceViewsService.pinProject(user.id, project.id);
    await projectsRepo.delete(project.id);

    const pinned = await workspaceViewsService.listPinnedProjects(user.id);
    expect(pinned.success && pinned.value).toEqual([]);
    const missing = await workspaceViewsService.pinProject(user.id, project.id);
    expect(!missing.success && missing.code).toBe('NOT_FOUND');
  });
});

describe('recent reports', () => {
  it('lists the latest opened reports first, once each', async () => {
    const first = await createReport({});
    const second = await createReport({});

    await workspaceViewsService.recordReportView(user.id, first.id);
    await workspaceViewsService.recordReportView(user.id, second.id);
    await Bun.sleep(5);
    await workspaceViewsService.recordReportView(user.id, first.id);

    const recent = await workspaceViewsService.listRecentReports(user.id, 3);
    expect(recent.success && recent.value.map((report) => report.id)).toEqual([
      first.id,
      second.id,
    ]);
    const others = await workspaceViewsService.listRecentReports(otherUser.id, 3);
    expect(others.success && others.value).toEqual([]);
  });

  it('keeps a bounded history and drops deleted reports', async () => {
    const reports = [];
    for (let index = 0; index < 22; index++) {
      const report = await createReport({});
      reports.push(report);
      await workspaceViewsService.recordReportView(user.id, report.id);
    }
    await reportsRepo.delete(reports[21].id);

    const recent = await workspaceViewsService.listRecentReports(user.id, 50);
    expect(recent.success && recent.value).toHaveLength(19);
    expect(recent.success && recent.value[0].id).toBe(reports[20].id);
  });

  it('rejects unknown reports', async () => {
    const result = await workspaceViewsService.recordReportView(user.id, 'rpt_missing');
    expect(!result.success && result.code).toBe('NOT_FOUND');
  });
});

describe('report view counts', () => {
  it('counts open and in-progress reports only', async () => {
    const before = await workspaceViewsService.getViewCounts(user.id);
    if (!before.success) throw new Error(before.error);

    await createReport({ assignedTo: user.id });
    await createReport({ assignedTo: user.id, status: 'in_progress' });
    await createReport({ assignedTo: user.id, status: 'closed' });
    await createReport({ assignedTo: otherUser.id });
    await createReport({});

    const after = await workspaceViewsService.getViewCounts(user.id);
    if (!after.success) throw new Error(after.error);
    expect(after.value.assignedToMe - before.value.assignedToMe).toBe(2);
    expect(after.value.unassigned - before.value.unassigned).toBe(1);
    expect(after.value.active - before.value.active).toBe(4);
  });
});
