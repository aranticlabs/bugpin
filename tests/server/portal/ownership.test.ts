import { afterEach, beforeEach, expect, it, spyOn, mock } from 'bun:test';
import { widgetRoutes } from '../../../src/server/routes/widget/submit';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { reportsService } from '../../../src/server/services/reports.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { githubSyncService } from '../../../src/server/services/integrations/github-sync.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { emailService } from '../../../src/server/services/email.service';
import { Result } from '../../../src/server/utils/result';
import { hashToken } from '../../../src/server/utils/secure-token';
import type { Project } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin, portalPost } from './helpers';

let close: () => void;
let project: Project;
const metadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'test' },
  device: { type: 'desktop', os: 'Linux' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: '2026-11-08T12:00:00.000Z',
} as const;

beforeEach(async () => {
  close = await openPortalDatabase();
  getDb().run(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES ('staff', 'staff@example.com', 'Staff', 'unused', 'admin')"
  );
  project = await projectsRepo.create({
    name: 'Portal project',
    settings: { reporterPortal: { enabled: true, allowNewFeedback: false } },
  });
  spyOn(notificationsService, 'notifyNewReport').mockResolvedValue(undefined);
  spyOn(notificationsService, 'notifyReporterSubmission').mockResolvedValue(undefined);
  spyOn(githubSyncService, 'getAutoSyncIntegration').mockResolvedValue(null);
});
afterEach(() => {
  mock.restore();
  close();
});

function login(email = 'jane@example.com', reportId?: string) {
  const token = Result.unwrap(reporterAuthService.mintLoginToken(email, 'request', reportId));
  return Result.unwrap(reporterAuthService.exchange(token.secret));
}

it('attaches widget reports across enabled projects after verified login even without confirmation emails', async () => {
  const app = createPortalTestApp();
  app.route('/api/widget', widgetRoutes);
  await settingsRepo.updateAll({
    reporterNotifications: {
      emailEnabled: false,
      notifyOnNewReport: false,
      notifyOnStatusChange: false,
      notifyOnPriorityChange: false,
      notifyOnAssignment: false,
      messagingEnabled: true,
    },
  });
  settingsCacheService.invalidate();
  const submitted = await app.request(`${portalOrigin}/api/widget/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': project.apiKey },
    body: JSON.stringify({
      title: 'First submitted report',
      description: 'Original text',
      reporterEmail: 'JANE@example.com',
      metadata,
    }),
  });
  expect(submitted.status).toBe(201);
  const { reportId } = (await submitted.json()) as { reportId: string };
  expect((await reportsRepo.findById(reportId))!.claimableEmail).toBe('jane@example.com');
  expect((await reportsRepo.findById(reportId))!.reporterId).toBeUndefined();
  const secondProject = await projectsRepo.create({
    name: 'Second project',
    settings: { reporterPortal: { enabled: true, allowNewFeedback: false } },
  });
  const secondReport = await reportsRepo.create({
    projectId: secondProject.id,
    title: 'Another claimable report',
    metadata,
    claimableEmail: 'jane@example.com',
  });
  const unchangedTimestamp = '2026-01-01T00:00:00.000Z';
  getDb().run('UPDATE reports SET updated_at = ? WHERE id IN (?, ?)', [
    unchangedTimestamp,
    reportId,
    secondReport.id,
  ]);
  const minted = Result.unwrap(
    reporterAuthService.mintLoginToken('jane@example.com', 'request', reportId)
  );
  const exchange = await portalPost(app, '/auth/exchange', { token: minted.secret });
  expect(exchange.status).toBe(200);
  const session = (await exchange.json()) as {
    reporter: { id: string };
    attachedReportCount: number;
    targetReportId: string;
  };
  expect(session.attachedReportCount).toBe(2);
  expect(session.targetReportId).toBe(reportId);
  for (const id of [reportId, secondReport.id]) {
    const report = (await reportsRepo.findById(id))!;
    expect(report.reporterId).toBe(session.reporter.id);
    expect(report.claimableEmail).toBeUndefined();
    expect(report.ownerSeenAt).toBeUndefined();
    expect(report.updatedAt).toBe(unchangedTimestamp);
    expect(
      getDb()
        .query(
          'SELECT action, user_id, new_value FROM report_history WHERE report_id = ? AND action = ?'
        )
        .get(id, 'owner_assigned')
    ).toEqual({ action: 'owner_assigned', user_id: null, new_value: session.reporter.id });
  }
});

it('does not make disabled, anonymous, or manually created reports claimable', async () => {
  await projectsRepo.update(project.id, {
    settings: { reporterPortal: { enabled: false, allowNewFeedback: false } },
  });
  const disabled = Result.unwrap(
    await reportsService.create({
      apiKey: project.apiKey,
      title: 'Disabled portal report',
      reporterEmail: 'jane@example.com',
      metadata,
    })
  );
  await projectsRepo.update(project.id, {
    settings: { reporterPortal: { enabled: true, allowNewFeedback: false } },
  });
  const anonymous = Result.unwrap(
    await reportsService.create({
      apiKey: project.apiKey,
      title: 'Anonymous widget report',
      metadata,
    })
  );
  const manual = Result.unwrap(
    await reportsService.createManual(
      {
        projectId: project.id,
        title: 'Manually created report',
        reporterEmail: 'jane@example.com',
      },
      'staff'
    )
  );
  expect(login().attachedReportCount).toBe(0);
  for (const report of [disabled, anonymous, manual]) {
    expect((await reportsRepo.findById(report.id))!.claimableEmail).toBeUndefined();
    expect((await reportsRepo.findById(report.id))!.reporterId).toBeUndefined();
  }
});

it('leaves claimability intact while disabled and attaches on a later login after re-enabling', async () => {
  const report = await reportsRepo.create({
    projectId: project.id,
    title: 'Claimable report',
    metadata,
    claimableEmail: 'jane@example.com',
  });
  await projectsRepo.update(project.id, {
    settings: { reporterPortal: { enabled: false, allowNewFeedback: false } },
  });
  const first = login();
  expect(first.attachedReportCount).toBe(0);
  expect(first.targetReportId).toBeUndefined();
  expect(reporterAuthService.validateSession(first.sessionSecret).success).toBe(true);
  expect(reporterOwnershipRepo.canAccess(report.id, first.reporter.id)).toBe(false);
  await projectsRepo.update(project.id, {
    settings: { reporterPortal: { enabled: true, allowNewFeedback: false } },
  });
  expect(login().attachedReportCount).toBe(1);
  expect(reporterOwnershipRepo.canAccess(report.id, first.reporter.id)).toBe(true);
  expect(reporterOwnershipRepo.canAccess(report.id, 'other-reporter')).toBe(false);
});

it('keeps original text and claimability unchanged when staff edit description or contact details', async () => {
  const report = Result.unwrap(
    await reportsService.create({
      apiKey: project.apiKey,
      title: 'Original widget report',
      description: 'Original text',
      reporterEmail: 'jane@example.com',
      metadata,
    })
  );
  await reportsRepo.update(report.id, {
    description: 'Staff notes',
    reporterEmail: 'other@example.com',
  });
  getDb().run('UPDATE reports SET reporter_email = ? WHERE id = ?', [
    'other@example.com',
    report.id,
  ]);
  const updated = (await reportsRepo.findById(report.id))!;
  expect(updated.originalDescription).toBe('Original text');
  expect(updated.claimableEmail).toBe('jane@example.com');
  expect(login('other@example.com').attachedReportCount).toBe(0);
  expect(login().attachedReportCount).toBe(1);
});

it('rolls attachments and their audit entries back on a failed exchange', async () => {
  const report = await reportsRepo.create({
    projectId: project.id,
    title: 'Claimable report',
    metadata,
    claimableEmail: 'jane@example.com',
  });
  const token = Result.unwrap(reporterAuthService.mintLoginToken('jane@example.com', 'request'));
  getDb().exec(
    "CREATE TRIGGER refuse_session BEFORE INSERT ON reporter_sessions BEGIN SELECT RAISE(ABORT, 'refused'); END;"
  );
  expect(() => reporterAuthService.exchange(token.secret)).toThrow('refused');
  const unchanged = (await reportsRepo.findById(report.id))!;
  expect(unchanged.reporterId).toBeUndefined();
  expect(unchanged.claimableEmail).toBe('jane@example.com');
  expect(
    getDb().query('SELECT 1 FROM report_history WHERE report_id = ?').get(report.id)
  ).toBeNull();
  expect(
    getDb()
      .query('SELECT consumed_at FROM reporter_auth_tokens WHERE token_hash = ?')
      .get(hashToken(token.secret))
  ).toEqual({ consumed_at: null });
});

it('does not return an unauthorized token navigation target', async () => {
  const report = await reportsRepo.create({
    projectId: project.id,
    title: 'Historical report',
    metadata,
    reporterEmail: 'jane@example.com',
  });
  expect(login('jane@example.com', report.id).targetReportId).toBeUndefined();
});

it('uses the portal setting independently of widget project activation', async () => {
  const report = await reportsRepo.create({
    projectId: project.id,
    title: 'Claimable report',
    metadata,
    claimableEmail: 'jane@example.com',
  });
  await projectsRepo.update(project.id, { isActive: false });
  const session = login();
  expect(session.attachedReportCount).toBe(1);
  expect(reporterOwnershipRepo.canAccess(report.id, session.reporter.id)).toBe(true);
});
