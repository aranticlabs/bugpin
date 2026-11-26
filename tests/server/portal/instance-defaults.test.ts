import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { widgetRoutes } from '../../../src/server/routes/widget/submit';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { portalReportsRepo } from '../../../src/server/database/repositories/portal-reports.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { settingsService } from '../../../src/server/services/settings.service';
import { projectsService } from '../../../src/server/services/projects.service';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { githubSyncService } from '../../../src/server/services/integrations/github-sync.service';
import { projectPortalUrl } from '../../../src/server/utils/portal-url';
import { Result } from '../../../src/server/utils/result';
import {
  DEFAULT_REPORTER_PORTAL,
  effectiveReporterPortal,
} from '../../../src/shared/reporter-portal';
import type { Project, ReporterPortalProjectSettings } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin } from './helpers';
import { realtimeService } from '../../../src/server/services/realtime.service';
import { reporterPortalSettingsService } from '../../../src/server/services/reporter-portal-settings.service';

let close: () => void;
const past = '2026-01-01T00:00:00.000Z';
const metadata = {
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'test' },
  device: { type: 'desktop', os: 'Linux' },
  viewport: { width: 100, height: 100, devicePixelRatio: 1 },
  timestamp: past,
} as const;

beforeEach(async () => {
  close = await openPortalDatabase();
  spyOn(notificationsService, 'notifyNewReport').mockResolvedValue(undefined);
  spyOn(notificationsService, 'notifyReporterSubmission').mockResolvedValue(undefined);
  spyOn(githubSyncService, 'getAutoSyncIntegration').mockResolvedValue(null);
});
afterEach(() => {
  mock.restore();
  close();
});

async function setDefault(portal: ReporterPortalProjectSettings): Promise<void> {
  await settingsRepo.updateAll({ reporterPortal: portal });
  settingsCacheService.invalidate();
}

function project(portal?: ReporterPortalProjectSettings | null): Promise<Project> {
  return projectsRepo.create({
    name: `Project ${crypto.randomUUID()}`,
    settings: portal === undefined ? {} : { reporterPortal: portal },
  });
}

function login(email: string) {
  const token = Result.unwrap(reporterAuthService.mintLoginToken(email, 'request'));
  return Result.unwrap(reporterAuthService.exchange(token.secret));
}

async function claimableReport(projectId: string, email: string) {
  return reportsRepo.create({ projectId, title: 'Report', metadata, claimableEmail: email });
}

function listedIds(reporterId: string): string[] {
  return portalReportsRepo
    .list({ kind: 'reporter', reporterId }, { limit: 50 })
    .rows.map((row) => row.id);
}

function teamIds(): string[] {
  return portalReportsRepo.list({ kind: 'operator' }, { limit: 50 }).rows.map((row) => row.id);
}

function submitsAllowed(projectId: string): boolean {
  const row = portalReportsRepo
    .projects({ kind: 'operator' })
    .find((item) => item.id === projectId);
  return Boolean(row?.allowNewFeedback);
}

describe('effectiveReporterPortal', () => {
  const instance = { reporterPortal: { enabled: true, allowNewFeedback: true } };

  it('falls back to the disabled defaults when nothing is configured', () => {
    expect(effectiveReporterPortal(undefined, undefined)).toEqual(DEFAULT_REPORTER_PORTAL);
    expect(DEFAULT_REPORTER_PORTAL).toEqual({ enabled: false, allowNewFeedback: false });
  });

  it('inherits the instance value for a missing or null project value', () => {
    expect(effectiveReporterPortal({}, instance)).toEqual(instance.reporterPortal);
    expect(effectiveReporterPortal({ reporterPortal: null }, instance)).toEqual(
      instance.reporterPortal
    );
  });

  it('lets a project value win in both directions', () => {
    const off = { enabled: false, allowNewFeedback: false };
    expect(effectiveReporterPortal({ reporterPortal: off }, instance)).toEqual(off);
    expect(
      effectiveReporterPortal({ reporterPortal: instance.reporterPortal }, { reporterPortal: off })
    ).toEqual(instance.reporterPortal);
  });
});

describe('reporter visibility with instance defaults', () => {
  it('shows reports of inheriting projects only while the default is on', async () => {
    const inheriting = await project();
    const reporter = login('jane@example.com').reporter;
    const report = await reportsRepo.create({ projectId: inheriting.id, title: 'R', metadata });
    reporterOwnershipRepo.setOwner(report.id, reporter.id, null);

    expect(listedIds(reporter.id)).toEqual([]);
    expect(teamIds()).toEqual([]);

    await setDefault({ enabled: true, allowNewFeedback: false });
    expect(listedIds(reporter.id)).toEqual([report.id]);
    expect(teamIds()).toEqual([report.id]);

    await setDefault({ enabled: false, allowNewFeedback: false });
    expect(listedIds(reporter.id)).toEqual([]);
    expect(teamIds()).toEqual([]);
  });

  it('lets a project override win over the default in both directions', async () => {
    const forcedOff = await project({ enabled: false, allowNewFeedback: false });
    const forcedOn = await project({ enabled: true, allowNewFeedback: false });
    const reporter = login('jane@example.com').reporter;
    const offReport = await reportsRepo.create({ projectId: forcedOff.id, title: 'Off', metadata });
    const onReport = await reportsRepo.create({ projectId: forcedOn.id, title: 'On', metadata });
    reporterOwnershipRepo.setOwner(offReport.id, reporter.id, null);
    reporterOwnershipRepo.setOwner(onReport.id, reporter.id, null);

    await setDefault({ enabled: true, allowNewFeedback: false });
    expect(listedIds(reporter.id)).toEqual([onReport.id]);

    await setDefault({ enabled: false, allowNewFeedback: false });
    expect(listedIds(reporter.id)).toEqual([onReport.id]);
  });

  it('returns a project to inheriting when the override is cleared with null', async () => {
    const created = await project({ enabled: true, allowNewFeedback: false });
    const reporter = login('jane@example.com').reporter;
    const report = await reportsRepo.create({ projectId: created.id, title: 'R', metadata });
    reporterOwnershipRepo.setOwner(report.id, reporter.id, null);
    expect(listedIds(reporter.id)).toEqual([report.id]);

    const updated = await projectsService.update(created.id, {
      settings: { reporterPortal: null },
    });
    expect(Result.unwrap(updated).settings.reporterPortal).toBeUndefined();
    expect(listedIds(reporter.id)).toEqual([]);

    await setDefault({ enabled: true, allowNewFeedback: false });
    expect(listedIds(reporter.id)).toEqual([report.id]);
  });

  it('attaches claimable reports on login only in projects where the portal is effectively on', async () => {
    const inheriting = await project();
    const forcedOff = await project({ enabled: false, allowNewFeedback: false });
    const inheritedReport = await claimableReport(inheriting.id, 'jane@example.com');
    const offReport = await claimableReport(forcedOff.id, 'jane@example.com');

    await setDefault({ enabled: true, allowNewFeedback: false });
    const session = login('jane@example.com');

    expect(session.attachedReportCount).toBe(1);
    expect((await reportsRepo.findById(inheritedReport.id))!.reporterId).toBe(session.reporter.id);
    expect((await reportsRepo.findById(offReport.id))!.reporterId).toBeUndefined();
  });

  it('does not attach claimable reports of inheriting projects while the default is off', async () => {
    const inheriting = await project();
    const report = await claimableReport(inheriting.id, 'jane@example.com');

    const session = login('jane@example.com');

    expect(session.attachedReportCount).toBe(0);
    expect((await reportsRepo.findById(report.id))!.claimableEmail).toBe('jane@example.com');
  });
});

describe('allowNewFeedback with instance defaults', () => {
  it('follows the default for inheriting projects and the override otherwise', async () => {
    const inheriting = await project();
    const forcedOff = await project({ enabled: true, allowNewFeedback: false });
    const forcedOn = await project({ enabled: true, allowNewFeedback: true });
    const reporter = login('jane@example.com').reporter;
    for (const target of [inheriting, forcedOff, forcedOn]) {
      const report = await reportsRepo.create({ projectId: target.id, title: 'R', metadata });
      reporterOwnershipRepo.setOwner(report.id, reporter.id, null);
    }

    await setDefault({ enabled: true, allowNewFeedback: true });
    expect(submitsAllowed(inheriting.id)).toBe(true);
    expect(submitsAllowed(forcedOff.id)).toBe(false);
    expect(submitsAllowed(forcedOn.id)).toBe(true);
    expect(portalReportsRepo.submissionContext(inheriting.id, reporter.id)).not.toBeNull();
    expect(portalReportsRepo.submissionContext(forcedOff.id, reporter.id)).toBeNull();

    await setDefault({ enabled: true, allowNewFeedback: false });
    expect(submitsAllowed(inheriting.id)).toBe(false);
    expect(submitsAllowed(forcedOn.id)).toBe(true);
    expect(portalReportsRepo.submissionContext(inheriting.id, reporter.id)).toBeNull();
  });
});

describe('projectsRepo.hasEnabledReporterPortal', () => {
  it('reflects the instance default for inheriting projects', async () => {
    await project();
    expect(projectsRepo.hasEnabledReporterPortal()).toBe(false);
    await setDefault({ enabled: true, allowNewFeedback: false });
    expect(projectsRepo.hasEnabledReporterPortal()).toBe(true);
  });

  it('ignores the default for projects with their own setting', async () => {
    await project({ enabled: false, allowNewFeedback: false });
    await setDefault({ enabled: true, allowNewFeedback: false });
    expect(projectsRepo.hasEnabledReporterPortal()).toBe(false);
  });

  it('ignores deleted projects that would inherit an enabled default', async () => {
    const created = await project();
    await setDefault({ enabled: true, allowNewFeedback: false });
    await projectsRepo.delete(created.id);
    expect(projectsRepo.hasEnabledReporterPortal()).toBe(false);
  });
});

describe('projectPortalUrl', () => {
  const urls = { appUrl: portalOrigin, portalBaseUrl: '' };

  it('uses the instance default when the project has no setting', () => {
    const on = { ...urls, reporterPortal: { enabled: true, allowNewFeedback: false } };
    const off = { ...urls, reporterPortal: DEFAULT_REPORTER_PORTAL };
    expect(projectPortalUrl({ settings: {} }, on)).toBe(`${portalOrigin}/reporter-portal/`);
    expect(projectPortalUrl({ settings: { reporterPortal: null } }, on)).toBe(
      `${portalOrigin}/reporter-portal/`
    );
    expect(projectPortalUrl({ settings: {} }, off)).toBeNull();
  });

  it('lets the project override win', () => {
    const on = { ...urls, reporterPortal: { enabled: true, allowNewFeedback: false } };
    expect(
      projectPortalUrl({ settings: { reporterPortal: DEFAULT_REPORTER_PORTAL } }, on)
    ).toBeNull();
  });
});

describe('widget submissions', () => {
  async function submit(apiKey: string, reporterEmail: string): Promise<string> {
    const app = createPortalTestApp();
    app.route('/api/widget', widgetRoutes);
    const response = await app.request(`${portalOrigin}/api/widget/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ title: 'Widget report', reporterEmail, metadata }),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { reportId: string }).reportId;
  }

  it('marks the report claimable when the default is on and the project has no override', async () => {
    const inheriting = await project();
    await setDefault({ enabled: true, allowNewFeedback: false });

    const id = await submit(inheriting.apiKey, 'JANE@example.com');

    expect((await reportsRepo.findById(id))!.claimableEmail).toBe('jane@example.com');
  });

  it('does not mark the report claimable when the project override is off', async () => {
    const forcedOff = await project({ enabled: false, allowNewFeedback: false });
    await setDefault({ enabled: true, allowNewFeedback: false });

    const id = await submit(forcedOff.apiKey, 'jane@example.com');

    expect((await reportsRepo.findById(id))!.claimableEmail).toBeUndefined();
  });

  it('does not mark the report claimable when the default is off', async () => {
    const inheriting = await project();

    const id = await submit(inheriting.apiKey, 'jane@example.com');

    expect((await reportsRepo.findById(id))!.claimableEmail).toBeUndefined();
  });
});

describe('settingsService.update with reporterPortal', () => {
  it('rejects allowNewFeedback without enabled', async () => {
    const result = await settingsService.update({
      reporterPortal: { enabled: false, allowNewFeedback: true },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('INVALID_REPORTER_PORTAL_SETTINGS');
  });

  it('rejects a partial allowNewFeedback update while the portal is off', async () => {
    const result = await settingsService.update({ reporterPortal: { allowNewFeedback: true } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('INVALID_REPORTER_PORTAL_SETTINGS');
  });

  it('enables the portal when the prerequisites are met and stores it', async () => {
    const result = await settingsService.update({ reporterPortal: { enabled: true } });
    expect(Result.unwrap(result).reporterPortal).toEqual({
      enabled: true,
      allowNewFeedback: false,
    });
    settingsCacheService.invalidate();
    expect((await settingsCacheService.getAll()).reporterPortal.enabled).toBe(true);
  });

  it('merges partial updates into the stored value', async () => {
    await setDefault({ enabled: true, allowNewFeedback: false });
    const result = await settingsService.update({ reporterPortal: { allowNewFeedback: true } });
    expect(Result.unwrap(result).reporterPortal).toEqual({ enabled: true, allowNewFeedback: true });
  });

  it('refuses to enable the portal without SMTP', async () => {
    await settingsRepo.updateAll({ smtpEnabled: false });
    settingsCacheService.invalidate();
    const result = await settingsService.update({ reporterPortal: { enabled: true } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('PORTAL_PREREQUISITES_MISSING');
      expect(result.details).toContain('smtp');
    }
  });

  it('refuses to enable the portal over plain http on a public host', async () => {
    await settingsRepo.updateAll({ appUrl: 'http://bugpin.example.test' });
    settingsCacheService.invalidate();
    const result = await settingsService.update({ reporterPortal: { enabled: true } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('PORTAL_PREREQUISITES_MISSING');
  });

  it('allows enabling over http on localhost', async () => {
    await settingsRepo.updateAll({ appUrl: 'http://localhost:3000' });
    settingsCacheService.invalidate();
    const result = await settingsService.update({ reporterPortal: { enabled: true } });
    expect(result.success).toBe(true);
  });

  it('always allows disabling, even when the prerequisites are missing', async () => {
    await setDefault({ enabled: true, allowNewFeedback: true });
    await settingsRepo.updateAll({ smtpEnabled: false, appUrl: 'http://bugpin.example.test' });
    settingsCacheService.invalidate();
    const result = await settingsService.update({
      reporterPortal: { enabled: false, allowNewFeedback: false },
    });
    expect(Result.unwrap(result).reporterPortal).toEqual({
      enabled: false,
      allowNewFeedback: false,
    });
  });

  it('allows turning off new feedback while the prerequisites are missing', async () => {
    await setDefault({ enabled: true, allowNewFeedback: true });
    await settingsRepo.updateAll({ smtpEnabled: false });
    settingsCacheService.invalidate();
    const result = await settingsService.update({ reporterPortal: { allowNewFeedback: false } });
    expect(result.success).toBe(true);
  });
});

describe('review regressions', () => {
  it('checks the prerequisites against the URL saved in the same request', async () => {
    await setDefault(DEFAULT_REPORTER_PORTAL);
    const result = await settingsService.update({
      appUrl: 'http://bugpin.example.com',
      reporterPortal: { enabled: true },
    });
    expect(result.success).toBe(false);
    expect((await settingsRepo.getAll()).reporterPortal.enabled).toBe(false);
  });

  it('checks the prerequisites when clearing an override turns the portal on', async () => {
    await setDefault({ enabled: true, allowNewFeedback: false });
    const created = await project({ enabled: false, allowNewFeedback: false });
    await settingsRepo.updateAll({ smtpEnabled: false });
    settingsCacheService.invalidate();
    const result = await reporterPortalSettingsService.validate(
      { reporterPortal: undefined },
      created.settings
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('PORTAL_PREREQUISITES_MISSING');
  });

  it('does not check the prerequisites when clearing an override keeps the portal off', async () => {
    await setDefault(DEFAULT_REPORTER_PORTAL);
    const created = await project({ enabled: false, allowNewFeedback: false });
    await settingsRepo.updateAll({ smtpEnabled: false });
    settingsCacheService.invalidate();
    expect(
      (
        await reporterPortalSettingsService.validate(
          { reporterPortal: undefined },
          created.settings
        )
      ).success
    ).toBe(true);
  });

  it('asks open portal streams of inheriting projects to recheck access when the default changes', async () => {
    await setDefault({ enabled: true, allowNewFeedback: false });
    const inheriting = await project();
    const overriding = await project({ enabled: true, allowNewFeedback: false });
    const invalidate = spyOn(realtimeService, 'invalidatePortalAccess');
    expect((await settingsService.update({ reporterPortal: { enabled: false } })).success).toBe(
      true
    );
    expect(invalidate).toHaveBeenCalledWith({ projectId: inheriting.id });
    expect(invalidate).not.toHaveBeenCalledWith({ projectId: overriding.id });
  });
});
