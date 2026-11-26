import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { openPortalDatabase } from './helpers';
import { getDb } from '../../../src/server/database/database';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { reportersRepo } from '../../../src/server/database/repositories/reporters.repo';
import { reporterOwnershipRepo } from '../../../src/server/database/repositories/reporter-ownership.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { reportMessagesService } from '../../../src/server/services/report-messages.service';
import type { Project, Report, ReporterPortalProjectSettings } from '../../../src/shared/types';

const ON: ReporterPortalProjectSettings = { enabled: true, allowNewFeedback: false };
const OFF: ReporterPortalProjectSettings = { enabled: false, allowNewFeedback: false };
const metadata = { timestamp: '2026-01-01T00:00:00.000Z' };

let close: () => void;

beforeEach(async () => {
  close = await openPortalDatabase();
  getDb().run('INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [
    'editor',
    'editor@example.com',
    'Editor',
    'unused',
    'editor',
  ]);
  spyOn(notificationsService, 'notifyReporterMessage').mockResolvedValue(undefined);
  spyOn(notificationsService, 'notifyReporterActivity').mockResolvedValue(undefined);
});

afterEach(() => {
  mock.restore();
  close();
});

async function setDefault(portal: ReporterPortalProjectSettings): Promise<void> {
  await settingsRepo.updateAll({ reporterPortal: portal });
  settingsCacheService.invalidate();
}

function createProject(portal?: ReporterPortalProjectSettings): Promise<Project> {
  return projectsRepo.create({
    name: `Project ${crypto.randomUUID()}`,
    settings: portal ? { reporterPortal: portal } : {},
  });
}

function unownedReport(projectId: string): Promise<Report> {
  return reportsRepo.create({
    projectId,
    title: 'Report title',
    reporterEmail: 'contact@example.com',
    metadata,
  });
}

async function ownedReport(projectId: string): Promise<{ report: Report; reporterId: string }> {
  const report = await unownedReport(projectId);
  const reporter = reportersRepo.resolve('owner@example.com', 'Owner', new Date().toISOString());
  reporterOwnershipRepo.setOwner(report.id, reporter.id, null);
  return { report, reporterId: reporter.id };
}

describe('staff portal-access confirmation follows the effective portal setting', () => {
  it('asks for confirmation on an unowned report when the project inherits an enabled default', async () => {
    await setDefault(ON);
    const report = await unownedReport((await createProject()).id);

    expect(await reportMessagesService.portalContext(report.id)).toMatchObject({
      success: true,
      value: { requiresPortalAccessConfirmation: true },
    });
    const unconfirmed = await reportMessagesService.send(report.id, 'editor', 'Hello');
    expect(unconfirmed.success).toBe(false);
    if (!unconfirmed.success) expect(unconfirmed.code).toBe('CONFIRMATION_REQUIRED');

    const confirmed = await reportMessagesService.send(
      report.id,
      'editor',
      'Hello',
      false,
      [],
      true
    );
    expect(confirmed.success).toBe(true);
    expect((await reportsRepo.findById(report.id))?.claimableEmail).toBe('contact@example.com');
  });

  it('sends without confirmation or claimability when the inherited default is off', async () => {
    await setDefault(OFF);
    const report = await unownedReport((await createProject()).id);

    expect(await reportMessagesService.portalContext(report.id)).toMatchObject({
      success: true,
      value: { requiresPortalAccessConfirmation: false, visible: false },
    });
    expect((await reportMessagesService.send(report.id, 'editor', 'Hello')).success).toBe(true);
    expect((await reportsRepo.findById(report.id))?.claimableEmail).toBeUndefined();
  });

  it('lets a project override win over the default in both directions', async () => {
    await setDefault(ON);
    const disabled = await unownedReport((await createProject(OFF)).id);
    expect(await reportMessagesService.portalContext(disabled.id)).toMatchObject({
      value: { requiresPortalAccessConfirmation: false },
    });
    expect((await reportMessagesService.send(disabled.id, 'editor', 'Hello')).success).toBe(true);

    await setDefault(OFF);
    const enabled = await unownedReport((await createProject(ON)).id);
    const unconfirmed = await reportMessagesService.send(enabled.id, 'editor', 'Hello');
    expect(unconfirmed.success).toBe(false);
    if (!unconfirmed.success) expect(unconfirmed.code).toBe('CONFIRMATION_REQUIRED');
  });

  it('reports an owned report as visible in the portal only while the portal is effectively on', async () => {
    await setDefault(ON);
    const inheriting = await ownedReport((await createProject()).id);
    expect(await reportMessagesService.portalContext(inheriting.report.id)).toMatchObject({
      value: { visible: true },
    });

    await setDefault(OFF);
    expect(await reportMessagesService.portalContext(inheriting.report.id)).toMatchObject({
      value: { visible: false },
    });
  });
});

describe('reporter messages follow the effective portal setting', () => {
  it('accepts a reporter message on a project that inherits an enabled default', async () => {
    await setDefault(ON);
    const { report, reporterId } = await ownedReport((await createProject()).id);
    const sent = await reportMessagesService.sendReporter(report.id, reporterId, 'Any update?');
    expect(sent.success).toBe(true);
  });

  it('refuses a reporter message once the inherited default is turned off', async () => {
    await setDefault(ON);
    const { report, reporterId } = await ownedReport((await createProject()).id);
    await setDefault(OFF);
    const sent = await reportMessagesService.sendReporter(report.id, reporterId, 'Any update?');
    expect(sent.success).toBe(false);
    if (!sent.success) expect(sent.code).toBe('NOT_FOUND');
  });

  it('follows a project override over the default in both directions', async () => {
    await setDefault(OFF);
    const enabled = await ownedReport((await createProject(ON)).id);
    expect(
      (await reportMessagesService.sendReporter(enabled.report.id, enabled.reporterId, 'Hi'))
        .success
    ).toBe(true);

    await setDefault(ON);
    const disabled = await ownedReport((await createProject(OFF)).id);
    const refused = await reportMessagesService.sendReporter(
      disabled.report.id,
      disabled.reporterId,
      'Hi'
    );
    expect(refused.success).toBe(false);
    if (!refused.success) expect(refused.code).toBe('NOT_FOUND');
  });
});
