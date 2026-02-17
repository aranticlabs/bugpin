import { describe, it, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { logger } from '../../src/server/utils/logger';
import type { Report } from '../../src/shared/types';

const sendMail = mock(async () => undefined);
const verify = mock(async () => undefined);
const createTransport = mock(() => ({ sendMail, verify }));

mock.module('nodemailer', () => ({
  default: {
    createTransport,
  },
}));

let emailService: typeof import('../../src/server/services/email.service').emailService;

const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };

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

beforeAll(async () => {
  const mod = await import('../../src/server/services/email.service');
  emailService = mod.emailService;
});

beforeEach(() => {
  sendMail.mockClear();
  verify.mockClear();
  createTransport.mockClear();

  // Invalidate settings cache so mocked settingsRepo.getAll takes effect
  settingsCacheService.invalidate();

  settingsRepo.getAll = async () =>
    ({
      appName: 'BugPin',
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
});

afterEach(() => {
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
});

describe('emailService.sendEmail', () => {
  it('returns error when SMTP is disabled', async () => {
    settingsRepo.getAll = async () =>
      ({
        smtpEnabled: false,
        smtpConfig: {},
      }) as never;

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP is disabled');
  });

  it('returns error when SMTP config is incomplete', async () => {
    settingsRepo.getAll = async () =>
      ({
        smtpEnabled: true,
        smtpConfig: { host: '', from: '' },
      }) as never;

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP not configured');
  });

  it('sends an email when configured', async () => {
    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com', name: 'Test' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(true);
    expect(createTransport).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalled();
  });

  it('handles transport errors', async () => {
    sendMail.mockImplementationOnce(() => {
      throw new Error('fail');
    });

    const result = await emailService.sendEmail({
      to: [{ email: 'test@example.com' }],
      subject: 'Subject',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('fail');
  });
});

describe('emailService.sendTestEmail', () => {
  it('rejects missing host and from fields', async () => {
    const result = await emailService.sendTestEmail(
      { host: '', port: 587, from: '' },
      'recipient@example.com',
    );
    expect(result.success).toBe(false);
  });

  it('returns error when verify fails', async () => {
    verify.mockImplementationOnce(() => {
      throw new Error('verify fail');
    });

    const result = await emailService.sendTestEmail(
      { host: 'smtp.example.com', port: 587, from: 'no-reply@example.com' },
      'recipient@example.com',
    );
    expect(result.success).toBe(false);
  });

  it('sends a test email', async () => {
    const result = await emailService.sendTestEmail(
      { host: 'smtp.example.com', port: 587, from: 'no-reply@example.com' },
      'recipient@example.com',
      'BugPin',
    );
    expect(result.success).toBe(true);
    expect(verify).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalled();
  });
});

describe('emailService notification helpers', () => {
  it('sends new report notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendNewReportNotification([{ email: 'test@example.com' }], {
      report: baseReport,
      projectName: 'Project',
      reportUrl: 'https://example.com/report',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });

  it('sends status change notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendStatusChangeNotification([{ email: 'test@example.com' }], {
      report: baseReport,
      projectName: 'Project',
      reportUrl: 'https://example.com/report',
      oldStatus: 'open',
      newStatus: 'resolved',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });

  it('sends assignment notification', async () => {
    const sendEmailSpy = mock(async () => ({ success: true }));
    const originalSendEmail = emailService.sendEmail;
    emailService.sendEmail = sendEmailSpy;

    await emailService.sendAssignmentNotification([{ email: 'test@example.com' }], {
      report: baseReport,
      projectName: 'Project',
      reportUrl: 'https://example.com/report',
      assignedToName: 'User',
    });

    expect(sendEmailSpy).toHaveBeenCalled();
    emailService.sendEmail = originalSendEmail;
  });
});
