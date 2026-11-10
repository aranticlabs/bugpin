import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { notificationsService } from '../../src/server/services/notifications.service';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { emailService } from '../../src/server/services/email.service';
import { reportersRepo } from '../../src/server/database/repositories/reporters.repo';
import { reporterSuppressionsRepo } from '../../src/server/database/repositories/reporter-suppressions.repo';
import { logger } from '../../src/server/utils/logger';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import type { Project, Report, User } from '../../src/shared/types';

const originalProjectsRepo = { ...projectsRepo };
const originalUsersRepo = { ...usersRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalEmailService = { ...emailService };
const originalReporterLookup = reportersRepo.findByEmail;
const originalSuppressionHas = reporterSuppressionsRepo.has;
const originalLogger = { ...logger };

const baseProject: Project = {
  id: 'prj_1',
  name: 'Project',
  apiKey: 'proj_key',
  settings: {},
  reportsCount: 0,
  isActive: true,
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseReport: Report = {
  reporterLocale: 'en',
  source: 'widget',
  id: 'rpt_1',
  projectId: 'prj_1',
  title: 'Bug report',
  status: 'open',
  priority: 'high',
  reporterEmail: 'reporter@example.com',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    timestamp: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let projectById: Project | null = baseProject;

const sendReporterConfirmationEmail = mock(async () => ({ success: true }));
const sendReporterStatusChangeEmail = mock<typeof emailService.sendReporterStatusChangeEmail>(
  async () => ({ success: true })
);
const sendReporterMessageEmail = mock(async () => ({ success: true }));
const sendReporterMessageCcEmail = mock(async () => ({ success: true }));
const sendReporterPriorityChangeEmail = mock(async () => ({ success: true }));
const sendReporterAssignmentEmail = mock(async () => ({ success: true }));

beforeEach(() => {
  reportersRepo.findByEmail = () => null;
  reporterSuppressionsRepo.has = () => false;
  projectById = baseProject;
  settingsCacheService.invalidate();

  projectsRepo.findById = async () => projectById;
  usersRepo.findById = async () => baseUser;

  settingsRepo.getAll = async () =>
    ({
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
    }) as never;

  emailService.sendReporterConfirmationEmail = sendReporterConfirmationEmail;
  emailService.sendReporterStatusChangeEmail = sendReporterStatusChangeEmail;
  emailService.sendReporterMessageEmail = sendReporterMessageEmail;
  emailService.sendReporterMessageCcEmail = sendReporterMessageCcEmail;
  emailService.sendReporterPriorityChangeEmail = sendReporterPriorityChangeEmail;
  emailService.sendReporterAssignmentEmail = sendReporterAssignmentEmail;

  sendReporterConfirmationEmail.mockClear();
  sendReporterStatusChangeEmail.mockClear();
  sendReporterMessageEmail.mockClear();
  sendReporterMessageCcEmail.mockClear();
  sendReporterPriorityChangeEmail.mockClear();
  sendReporterAssignmentEmail.mockClear();

  logger.info = () => undefined;
  logger.error = () => undefined;
  logger.warn = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  reportersRepo.findByEmail = originalReporterLookup;
  reporterSuppressionsRepo.has = originalSuppressionHas;
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(usersRepo, originalUsersRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(emailService, originalEmailService);
  Object.assign(logger, originalLogger);
});

describe('notificationsService.notifyReporterSubmission', () => {
  it('sends confirmation email when report has reporterEmail', async () => {
    await notificationsService.notifyReporterSubmission(baseReport);
    expect(sendReporterConfirmationEmail).toHaveBeenCalledWith(
      'reporter@example.com',
      expect.objectContaining({
        report: baseReport,
        projectName: 'Project',
      })
    );
  });

  it('skips when report has no reporterEmail', async () => {
    const reportWithoutEmail = { ...baseReport, reporterEmail: undefined };
    await notificationsService.notifyReporterSubmission(reportWithoutEmail);
    expect(sendReporterConfirmationEmail).not.toHaveBeenCalled();
  });

  it('skips when reporterEmail is malformed', async () => {
    const badReport = { ...baseReport, reporterEmail: 'not-an-email' };
    await notificationsService.notifyReporterSubmission(badReport);
    expect(sendReporterConfirmationEmail).not.toHaveBeenCalled();
  });

  it('skips when project setting notifyReporter is false', async () => {
    projectById = {
      ...baseProject,
      settings: { notifyReporter: false },
    };
    await notificationsService.notifyReporterSubmission(baseReport);
    expect(sendReporterConfirmationEmail).not.toHaveBeenCalled();
  });

  it('sends when project setting notifyReporter is true', async () => {
    projectById = {
      ...baseProject,
      settings: { notifyReporter: true },
    };
    await notificationsService.notifyReporterSubmission(baseReport);
    expect(sendReporterConfirmationEmail).toHaveBeenCalled();
  });
});

describe('notificationsService.notifyReporterStatusChange', () => {
  it('sends status change email with old and new status', async () => {
    await notificationsService.notifyReporterStatusChange(baseReport, 'open', 'resolved');
    expect(sendReporterStatusChangeEmail).toHaveBeenCalledWith(
      'reporter@example.com',
      expect.objectContaining({
        report: baseReport,
        projectName: 'Project',
        oldStatus: 'open',
        newStatus: 'resolved',
      })
    );
  });

  it('does not include unrelated messages in status emails', async () => {
    await notificationsService.notifyReporterStatusChange(baseReport, 'open', 'resolved');
    const callArgs = sendReporterStatusChangeEmail.mock.calls[0][1];
    expect(callArgs.reporterMessage).toBeUndefined();
  });

  it('skips when report has no reporterEmail', async () => {
    const reportWithoutEmail = { ...baseReport, reporterEmail: undefined };
    await notificationsService.notifyReporterStatusChange(reportWithoutEmail, 'open', 'resolved');
    expect(sendReporterStatusChangeEmail).not.toHaveBeenCalled();
  });

  it('skips when reporterEmail is malformed', async () => {
    const badReport = { ...baseReport, reporterEmail: 'invalid' };
    await notificationsService.notifyReporterStatusChange(badReport, 'open', 'resolved');
    expect(sendReporterStatusChangeEmail).not.toHaveBeenCalled();
  });

  it('skips when project setting notifyReporter is false', async () => {
    projectById = {
      ...baseProject,
      settings: { notifyReporter: false },
    };
    await notificationsService.notifyReporterStatusChange(baseReport, 'open', 'resolved');
    expect(sendReporterStatusChangeEmail).not.toHaveBeenCalled();
  });
});

describe('notificationsService.notifyReporterMessage', () => {
  it('sends message email to reporter', async () => {
    await notificationsService.notifyReporterMessage(baseReport, 'Hello reporter', 'usr_1');
    expect(sendReporterMessageEmail).toHaveBeenCalledWith(
      'reporter@example.com',
      expect.objectContaining({
        report: baseReport,
        projectName: 'Project',
        senderName: 'Admin User',
        message: 'Hello reporter',
      })
    );
  });

  it('skips when project setting notifyReporter is false', async () => {
    projectById = {
      ...baseProject,
      settings: { notifyReporter: false },
    };
    // Legacy compat: notifyReporter=false disables all reporter notifications including messaging
    await notificationsService.notifyReporterMessage(baseReport, 'Hello', 'usr_1');
    expect(sendReporterMessageEmail).not.toHaveBeenCalled();
  });

  it('skips when report has no reporterEmail', async () => {
    const reportWithoutEmail = { ...baseReport, reporterEmail: undefined };
    await notificationsService.notifyReporterMessage(reportWithoutEmail, 'Hello', 'usr_1');
    expect(sendReporterMessageEmail).not.toHaveBeenCalled();
  });

  it('skips when sender user is not found', async () => {
    usersRepo.findById = async () => null;
    await notificationsService.notifyReporterMessage(baseReport, 'Hello', 'usr_missing');
    expect(sendReporterMessageEmail).not.toHaveBeenCalled();
  });

  it('skips when reporterEmail is malformed', async () => {
    const badReport = { ...baseReport, reporterEmail: 'not-an-email' };
    await notificationsService.notifyReporterMessage(badReport, 'Hello', 'usr_1');
    expect(sendReporterMessageEmail).not.toHaveBeenCalled();
  });

  it('sends CC email using CC method when ccSender is true', async () => {
    await notificationsService.notifyReporterMessage(baseReport, 'Hello', 'usr_1', true);
    expect(sendReporterMessageEmail).toHaveBeenCalledWith(
      'reporter@example.com',
      expect.objectContaining({ message: 'Hello' })
    );
    expect(sendReporterMessageCcEmail).toHaveBeenCalledWith(
      'admin@example.com',
      expect.objectContaining({ message: 'Hello' })
    );
  });

  it('does not send CC email when ccSender is false', async () => {
    await notificationsService.notifyReporterMessage(baseReport, 'Hello', 'usr_1', false);
    expect(sendReporterMessageEmail).toHaveBeenCalled();
    expect(sendReporterMessageCcEmail).not.toHaveBeenCalled();
  });

  it('skips when project messagingEnabled is false', async () => {
    projectById = {
      ...baseProject,
      settings: { reporterNotifications: { messagingEnabled: false } },
    };
    await notificationsService.notifyReporterMessage(baseReport, 'Hello', 'usr_1');
    expect(sendReporterMessageEmail).not.toHaveBeenCalled();
  });
});

describe('notificationsService.notifyReporterPriorityChange', () => {
  it('sends priority change email to reporter', async () => {
    await notificationsService.notifyReporterPriorityChange(baseReport, 'low', 'highest');
    expect(sendReporterPriorityChangeEmail).toHaveBeenCalledWith(
      'reporter@example.com',
      expect.objectContaining({
        report: baseReport,
        projectName: 'Project',
        oldPriority: 'low',
        newPriority: 'highest',
      })
    );
  });

  it('skips when report has no reporterEmail', async () => {
    const reportWithoutEmail = { ...baseReport, reporterEmail: undefined };
    await notificationsService.notifyReporterPriorityChange(reportWithoutEmail, 'low', 'high');
    expect(sendReporterPriorityChangeEmail).not.toHaveBeenCalled();
  });

  it('skips when reporterEmail is malformed', async () => {
    const badReport = { ...baseReport, reporterEmail: 'bad-email' };
    await notificationsService.notifyReporterPriorityChange(badReport, 'low', 'high');
    expect(sendReporterPriorityChangeEmail).not.toHaveBeenCalled();
  });

  it('skips when project setting notifyReporter is false', async () => {
    projectById = {
      ...baseProject,
      settings: { notifyReporter: false },
    };
    await notificationsService.notifyReporterPriorityChange(baseReport, 'low', 'high');
    expect(sendReporterPriorityChangeEmail).not.toHaveBeenCalled();
  });
});

describe('notificationsService.notifyReporterAssignment', () => {
  it('sends assignment email to reporter', async () => {
    await notificationsService.notifyReporterAssignment(baseReport, undefined, 'usr_1');
    expect(sendReporterAssignmentEmail).toHaveBeenCalledWith(
      'reporter@example.com',
      expect.objectContaining({
        report: baseReport,
        projectName: 'Project',
        assigneeName: 'Admin User',
      })
    );
  });

  it('respects reporter assignment settings', async () => {
    projectById = {
      ...baseProject,
      settings: { reporterNotifications: { notifyOnAssignment: false } },
    };
    await notificationsService.notifyReporterAssignment(baseReport, undefined, 'usr_1');
    expect(sendReporterAssignmentEmail).not.toHaveBeenCalled();
  });
});
