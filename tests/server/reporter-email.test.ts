import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { emailService } from '../../src/server/services/email.service';
import type { SendEmailOptions } from '../../src/server/services/email.service';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { logger } from '../../src/server/utils/logger';
import type { Report } from '../../src/shared/types';

const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  source: 'widget',
  reporterLocale: 'en',
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

function createSendEmailSpy() {
  return mock<(options: SendEmailOptions) => Promise<{ success: boolean }>>(() =>
    Promise.resolve({ success: true })
  );
}

beforeEach(() => {
  settingsCacheService.invalidate();

  settingsRepo.getAll = async () =>
    ({
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
      smtpEnabled: true,
      smtpConfig: {
        host: 'smtp.example.com',
        port: 587,
        user: 'user',
        password: 'pass',
        from: 'no-reply@example.com',
      },
    }) as never;

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
});

describe('emailService.sendReporterConfirmationEmail', () => {
  it('compiles template and sends email', async () => {
    const sendEmailSpy = createSendEmailSpy();
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendReporterConfirmationEmail('reporter@example.com', {
      report: baseReport,
      projectName: 'Project One',
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    const call = sendEmailSpy.mock.calls[0];
    const options = call[0];
    expect(options.to).toEqual([{ email: 'reporter@example.com' }]);
    expect(options.subject).toBeDefined();
    expect(options.html).toBeDefined();

    emailService.sendEmail = originalSendEmail;
  });
});

describe('emailService.sendReporterStatusChangeEmail', () => {
  it('sends email with status change info', async () => {
    const sendEmailSpy = createSendEmailSpy();
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendReporterStatusChangeEmail('reporter@example.com', {
      report: baseReport,
      projectName: 'Project One',
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
      oldStatus: 'open',
      newStatus: 'resolved',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    const call = sendEmailSpy.mock.calls[0];
    const options = call[0];
    expect(options.to).toEqual([{ email: 'reporter@example.com' }]);

    emailService.sendEmail = originalSendEmail;
  });

  it('includes message block when reporterMessage is present', async () => {
    const sendEmailSpy = createSendEmailSpy();
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendReporterStatusChangeEmail('reporter@example.com', {
      report: baseReport,
      projectName: 'Project One',
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
      oldStatus: 'open',
      newStatus: 'resolved',
      reporterMessage: 'We fixed the issue you reported.',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    const call = sendEmailSpy.mock.calls[0];
    const options = call[0];
    expect(options.html).toContain('We fixed the issue you reported.');

    emailService.sendEmail = originalSendEmail;
  });

  it('hides message block when no reporterMessage', async () => {
    const sendEmailSpy = createSendEmailSpy();
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendReporterStatusChangeEmail('reporter@example.com', {
      report: baseReport,
      projectName: 'Project One',
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
      oldStatus: 'open',
      newStatus: 'resolved',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    const call = sendEmailSpy.mock.calls[0];
    const options = call[0];
    expect(options.html).toContain('display: none');

    emailService.sendEmail = originalSendEmail;
  });
});

describe('emailService.sendReporterMessageEmail', () => {
  it('includes sender name and message text', async () => {
    const sendEmailSpy = createSendEmailSpy();
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendReporterMessageEmail('reporter@example.com', {
      report: baseReport,
      projectName: 'Project One',
      appName: 'BugPin',
      appUrl: 'https://app.example.com',
      senderName: 'Admin User',
      message: 'We are investigating this bug.',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    const call = sendEmailSpy.mock.calls[0];
    const options = call[0];
    expect(options.to).toEqual([{ email: 'reporter@example.com' }]);
    expect(options.html).toContain('Admin User');
    expect(options.html).toContain('We are investigating this bug.');

    emailService.sendEmail = originalSendEmail;
  });
});
