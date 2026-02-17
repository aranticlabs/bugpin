import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { notificationsService } from '../../../src/server/services/notifications.service';
import {
  notificationPreferencesRepo,
  projectNotificationDefaultsRepo,
} from '../../../src/server/database/repositories/notification-preferences.repo';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { emailService } from '../../../src/server/services/email.service';
import { logger } from '../../../src/server/utils/logger';
import type {
  NotificationPreferences,
  ProjectNotificationDefaults,
  Project,
  Report,
  User,
} from '../../../src/shared/types';

const originalNotificationPreferencesRepo = { ...notificationPreferencesRepo };
const originalProjectDefaultsRepo = { ...projectNotificationDefaultsRepo };
const originalUsersRepo = { ...usersRepo };
const originalProjectsRepo = { ...projectsRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalEmailService = { ...emailService };
const originalLogger = { ...logger };

const baseProject: Project = {
  id: 'prj_1',
  name: 'Project',
  apiKey: 'proj_key',
  settings: {},
  reportsCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseUser: User = {
  id: 'usr_1',
  email: 'user@example.com',
  name: 'User',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const basePreferences: NotificationPreferences = {
  id: 'pref_1',
  userId: 'usr_1',
  projectId: 'prj_1',
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  emailEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseDefaults: ProjectNotificationDefaults = {
  id: 'def_1',
  projectId: 'prj_1',
  defaultNotifyOnNewReport: true,
  defaultNotifyOnStatusChange: true,
  defaultNotifyOnPriorityChange: true,
  defaultNotifyOnAssignment: true,
  defaultEmailEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  title: 'Bug report',
  status: 'open',
  priority: 'high',
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
let preferencesByProject: NotificationPreferences[] = [basePreferences];
let userById: User | null = baseUser;
let preferencesByUser: NotificationPreferences[] = [basePreferences];
let preferencesByUserProject: NotificationPreferences | null = basePreferences;
let defaultsByProject: ProjectNotificationDefaults | null = baseDefaults;

const sendNewReportNotification = mock(async () => ({ success: true }));
const sendStatusChangeNotification = mock(async () => ({ success: true }));
const sendAssignmentNotification = mock(async () => ({ success: true }));
const sendEmail = mock(async () => ({ success: true }));

beforeEach(() => {
  projectById = baseProject;
  preferencesByProject = [basePreferences];
  userById = baseUser;
  preferencesByUser = [basePreferences];
  preferencesByUserProject = basePreferences;
  defaultsByProject = baseDefaults;

  notificationPreferencesRepo.getOrCreate = async () => basePreferences;
  notificationPreferencesRepo.upsert = async () => basePreferences;
  notificationPreferencesRepo.findByUser = async () => preferencesByUser;
  notificationPreferencesRepo.findByProjectWithEmailEnabled = async () => preferencesByProject;
  notificationPreferencesRepo.findByUserAndProject = async () => preferencesByUserProject;

  projectNotificationDefaultsRepo.findByProject = async () => defaultsByProject;
  projectNotificationDefaultsRepo.upsert = async () => baseDefaults;
  projectNotificationDefaultsRepo.delete = async () => undefined;

  usersRepo.findById = async () => userById;
  projectsRepo.findById = async () => projectById;

  settingsRepo.getAll = async () => ({ appUrl: 'https://app.example.com' }) as never;

  emailService.sendNewReportNotification = sendNewReportNotification;
  emailService.sendStatusChangeNotification = sendStatusChangeNotification;
  emailService.sendAssignmentNotification = sendAssignmentNotification;
  emailService.sendEmail = sendEmail;

  sendNewReportNotification.mockClear();
  sendStatusChangeNotification.mockClear();
  sendAssignmentNotification.mockClear();
  sendEmail.mockClear();

  logger.info = () => undefined;
  logger.error = () => undefined;
});

afterEach(() => {
  Object.assign(notificationPreferencesRepo, originalNotificationPreferencesRepo);
  Object.assign(projectNotificationDefaultsRepo, originalProjectDefaultsRepo);
  Object.assign(usersRepo, originalUsersRepo);
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(emailService, originalEmailService);
  Object.assign(logger, originalLogger);
});

describe('notificationsService preferences', () => {
  it('returns error when project is missing', async () => {
    projectById = null;
    const result = await notificationsService.getUserPreferences('usr_1', 'prj_missing');
    expect(result.success).toBe(false);
  });

  it('updates user preferences', async () => {
    const result = await notificationsService.updateUserPreferences('usr_1', 'prj_1', {
      notifyOnNewReport: false,
    });
    expect(result.success).toBe(true);
  });

  it('gets project defaults', async () => {
    const result = await notificationsService.getProjectDefaults('prj_1');
    expect(result.success).toBe(true);
  });

  it('updates project defaults', async () => {
    const result = await notificationsService.updateProjectDefaults('prj_1', {
      defaultNotifyOnAssignment: false,
    });
    expect(result.success).toBe(true);
  });

  it('deletes project defaults', async () => {
    const result = await notificationsService.deleteProjectDefaults('prj_1');
    expect(result.success).toBe(true);
  });
});

describe('notificationsService notifications', () => {
  it('skips new report notifications when no recipients', async () => {
    preferencesByProject = [];
    await notificationsService.notifyNewReport(baseReport);
    expect(sendNewReportNotification).not.toHaveBeenCalled();
  });

  it('sends new report notifications to recipients', async () => {
    await notificationsService.notifyNewReport(baseReport);
    expect(sendNewReportNotification).toHaveBeenCalled();
  });

  it('sends status change notifications', async () => {
    await notificationsService.notifyStatusChange(baseReport, 'open', 'resolved');
    expect(sendStatusChangeNotification).toHaveBeenCalled();
  });

  it('sends assignment notifications', async () => {
    await notificationsService.notifyAssignment(baseReport, 'usr_1');
    expect(sendAssignmentNotification).toHaveBeenCalled();
  });

  it('sends priority change notifications', async () => {
    await notificationsService.notifyPriorityChange(baseReport, 'low', 'high');
    expect(sendEmail).toHaveBeenCalled();
  });
});
