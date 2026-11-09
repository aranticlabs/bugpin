import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import { getDb } from '../../../src/server/database/database';
import { reportsRepo } from '../../../src/server/database/repositories/reports.repo';
import { projectsRepo } from '../../../src/server/database/repositories/projects.repo';
import { reportersRepo } from '../../../src/server/database/repositories/reporters.repo';
import { reporterAuthTokensRepo } from '../../../src/server/database/repositories/reporter-auth-tokens.repo';
import { reporterSuppressionsRepo } from '../../../src/server/database/repositories/reporter-suppressions.repo';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { reporterCorrespondenceService } from '../../../src/server/services/reporter-correspondence.service';
import { reporterSuppressionService } from '../../../src/server/services/reporter-suppression.service';
import { reporterAuthService } from '../../../src/server/services/reporter-auth.service';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { emailService } from '../../../src/server/services/email.service';
import { templateService } from '../../../src/server/services/template.service';
import {
  getSampleDataForTemplate,
  defaultEmailTemplates,
} from '../../../src/server/constants/email-templates';
import { reporterCopy } from '../../../src/server/i18n/reporter-copy';
import { hashToken } from '../../../src/server/utils/secure-token';
import { logger } from '../../../src/server/utils/logger';
import { Result } from '../../../src/server/utils/result';
import { SUPPORTED_LOCALES } from '../../../src/shared/types';
import { createPortalTestApp, openPortalDatabase, portalOrigin } from './helpers';
import type { SendEmailOptions } from '../../../src/server/services/email.service';

let close: () => void;
let sent: SendEmailOptions[];

beforeEach(async () => {
  close = await openPortalDatabase();
  getDb().exec(`
    INSERT INTO projects (id, name, api_key_hash, api_key_prefix, settings) VALUES ('project', 'Project', 'hash', 'prefix', '{"reporterPortal":{"enabled":true}}');
    INSERT INTO users (id, email, password_hash, name, role) VALUES ('staff', 'staff@example.com', 'hash', 'Staff', 'editor');
    INSERT INTO reports (id, project_id, title, metadata, claimable_email, reporter_email, reporter_locale) VALUES ('report', 'project', 'Report', '{}', 'bob@example.com', 'alice@example.com', 'de');
  `);
  sent = [];
  spyOn(emailService, 'sendEmail').mockImplementation(async (options) => {
    sent.push(options);
    return { success: true };
  });
});
afterEach(() => {
  mock.restore();
  close();
});

async function prepare(source?: 'confirmation' | 'invitation') {
  const report = (await reportsRepo.findById('report'))!;
  const project = (await projectsRepo.findById('project'))!;
  return Result.unwrap(
    reporterCorrespondenceService.prepare(
      report,
      project,
      await settingsCacheService.getAll(),
      source
    )
  )!;
}

it('delivers a report-targeted 24-hour token only to the claimable correspondent and keeps CC credential-free', async () => {
  await notificationsService.notifyReporterMessage(
    (await reportsRepo.findById('report'))!,
    '',
    'staff',
    true,
    [{ filename: 'screen.png' }]
  );
  expect(sent).toHaveLength(2);
  const [reporter, cc] = sent;
  expect(reporter.to).toEqual([{ email: 'bob@example.com' }]);
  expect(reporter.html).toContain(reporterCopy.de.fileOnly);
  expect(reporter.html).toContain('screen.png');
  expect(reporter.html).toContain(reporterCopy.de.reply);
  const token = reporter.loginToken!;
  const stored = reporterAuthTokensRepo.findByHash(hashToken(token.secret))!;
  expect(stored).toMatchObject({
    email: 'bob@example.com',
    source: 'invitation',
    reportId: 'report',
  });
  expect(Date.parse(stored.expiresAt) - Date.now()).toBeGreaterThan(23 * 3600000);
  expect(reporter.html).toContain(`/reporter-portal/login#${token.secret}`);
  expect(reporter.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  expect(cc.to).toEqual([{ email: 'staff@example.com' }]);
  expect(cc.html).toContain('screen.png');
  expect(cc.html).toContain(reporterCopy.de.fileOnly);
  expect(cc.html).not.toContain(token.secret);
  expect(cc.html).not.toContain('/reporter-portal/login#');
  expect(cc.loginToken).toBeUndefined();
  expect(cc.headers).toBeUndefined();
});

it('prefers the owner mailbox and locale over claimable and contact values', async () => {
  const owner = reportersRepo.resolve('owner@example.com', 'Owner', new Date().toISOString());
  getDb().run("UPDATE reporters SET locale = 'fr' WHERE id = ?", [owner.id]);
  getDb().run('UPDATE reports SET reporter_id = ? WHERE id = ?', [owner.id, 'report']);
  const context = await prepare('invitation');
  expect(context.recipient).toBe('owner@example.com');
  expect(context.options.locale).toBe('fr');
  expect(context.options.loginToken).toBeUndefined();
  expect(context.options.reportPortalUrl).toBe(`${portalOrigin}/reporter-portal/reports/report`);
});

it('suppresses all update categories, including confirmation and message, while requested login still sends', async () => {
  reporterSuppressionsRepo.insert('bob@example.com', 'unsubscribe');
  const report = (await reportsRepo.findById('report'))!;
  await notificationsService.notifyReporterSubmission(report);
  await notificationsService.notifyReporterStatusChange(report, 'open', 'resolved');
  await notificationsService.notifyReporterPriorityChange(report, 'low', 'high');
  await notificationsService.notifyReporterAssignment(report, undefined, 'staff');
  await notificationsService.notifyReporterMessage(report, 'Reply', 'staff');
  expect(sent).toHaveLength(0);
  expect((await reporterAuthService.sendLoginLink('bob@example.com', 'ja')).success).toBe(true);
  expect(sent).toHaveLength(1);
  expect(sent[0].subject).toBe(reporterCopy.ja.login);
});

it('omits portal links when the project is disabled and gives safe instructions for private files', async () => {
  getDb().run("UPDATE projects SET settings = '{}' WHERE id = 'project'");
  await notificationsService.notifyReporterMessage(
    (await reportsRepo.findById('report'))!,
    '',
    'staff',
    true,
    [{ filename: 'screen.png' }]
  );
  for (const email of sent) {
    expect(email.html).toContain(reporterCopy.de.fileUnavailable);
    expect(email.html).not.toContain('/reporter-portal');
    expect(email.loginToken).toBeUndefined();
  }
});

for (const locale of SUPPORTED_LOCALES) {
  for (const message of ['', 'Please check the recording.']) {
    it(`renders ${locale} ${message ? 'text and files' : 'file-only'} messages and CC without private file data`, async () => {
      const report = (await reportsRepo.findById('report'))!;
      const { options } = await prepare('invitation');
      options.locale = locale;
      const data = {
        report,
        projectName: 'Project',
        appName: 'BugPin',
        appUrl: portalOrigin,
        senderName: 'Staff',
        message,
        correspondence: options,
        files: [
          {
            filename: '<screen>.png',
            path: '/private/screen.png',
            url: '/api/portal/reports/report/files/private',
          },
        ],
      };
      await emailService.sendReporterMessageEmail('bob@example.com', data);
      await emailService.sendReporterMessageCcEmail('staff@example.com', data);
      for (const email of sent) {
        expect(email.html).toContain('&lt;screen&gt;.png');
        expect(email.html).toContain(reporterCopy[locale].files);
        expect(email.html).toContain(message || reporterCopy[locale].fileOnly);
        expect(email.html).not.toContain('/private/screen.png');
        expect(email.html).not.toContain('/files/private');
        expect(email.html).not.toMatch(/\{\{\w/);
      }
      expect(sent[1].html).not.toContain(options.loginToken!.secret);
      sent = [];
      await emailService.sendReporterMessageEmail('bob@example.com', {
        ...data,
        report: { ...report, status: 'closed' },
      });
      expect(sent[0].html).toContain(reporterCopy[locale].view);
      expect(sent[0].html).not.toContain(reporterCopy[locale].reply);
    });
  }
  it(`renders the ${locale} login template with preview data`, () => {
    const template = defaultEmailTemplates.reporterLogin[locale];
    const html = templateService.compileTemplate(
      template.html,
      getSampleDataForTemplate('reporterLogin')
    );
    expect(html).toContain(reporterCopy[locale].loginExpiry);
    expect(html).toContain('/reporter-portal/login#sample-login-token');
    expect(html).not.toMatch(/\{\{\w/);
  });
}

it('refuses mismatched or multi-recipient credential delivery before SMTP without logging the secret', async () => {
  mock.restore();
  const transport = spyOn(emailService, 'createTransporter');
  const errors = spyOn(logger, 'error').mockImplementation(() => {});
  const secret = 'credential-do-not-log';
  for (const to of [
    [{ email: 'alice@example.com' }],
    [{ email: 'bob@example.com' }, { email: 'staff@example.com' }],
  ]) {
    expect(
      (
        await emailService.sendEmail({
          to,
          subject: secret,
          html: secret,
          loginToken: { email: 'bob@example.com', secret },
        })
      ).success
    ).toBe(false);
  }
  expect(transport).not.toHaveBeenCalled();
  expect(errors).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(errors.mock.calls)).not.toContain(secret);
});

it('passes unsubscribe headers to SMTP and redacts credential-bearing subjects and transport errors', async () => {
  mock.restore();
  const secret = 'credential-never-log';
  const transport = emailService.createTransporter({ host: 'localhost', port: 25, secure: false });
  const sendMail = spyOn(transport, 'sendMail').mockImplementation(async () => {
    throw new Error(`Delivery rejected: ${secret}`);
  });
  spyOn(emailService, 'createTransporter').mockReturnValue(transport);
  const logs = ['debug', 'info', 'warn', 'error'].map((level) =>
    spyOn(logger, level as 'debug' | 'info' | 'warn' | 'error').mockImplementation(() => {})
  );
  const headers = {
    'List-Unsubscribe': '<https://example.com/unsubscribe?t=signed>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
  const result = await emailService.sendEmail({
    to: [{ email: 'bob@example.com' }],
    subject: secret,
    html: secret,
    loginToken: { email: 'bob@example.com', secret },
    headers,
  });
  expect(result.success).toBe(false);
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ headers, subject: secret }));
  expect(JSON.stringify(logs.map((log) => log.mock.calls))).not.toContain(secret);
});

it('renders custom CC variables without login or unsubscribe credentials', async () => {
  const { options } = await prepare('invitation');
  spyOn(emailService, 'getTemplate').mockResolvedValue({
    subject: '{{reporter.loginUrl}}',
    html: '<html><body><div><p>{{reporter.loginUrl}} {{reporter.unsubscribeUrl}} {{report.portalUrl}} {{message}}</p></div></body></html>',
  });
  await emailService.sendReporterMessageCcEmail('staff@example.com', {
    report: (await reportsRepo.findById('report'))!,
    projectName: 'Project',
    appName: 'BugPin',
    appUrl: portalOrigin,
    senderName: 'Staff',
    message: '',
    files: [{ filename: 'screen.png' }],
    correspondence: options,
  });
  expect(sent[0].html).toContain('screen.png');
  expect(sent[0].html).not.toContain(options.loginToken!.secret);
  expect(sent[0].html).not.toContain('/unsubscribe');
  expect(sent[0].html).not.toContain('{{');
});

it('requires a valid purpose-bound signed token for unsubscribe and never mutates on GET', async () => {
  const app = createPortalTestApp();
  const token = reporterSuppressionService.unsubscribeToken(' BOB@example.com ');
  const url = `${portalOrigin}/api/portal/unsubscribe?t=${encodeURIComponent(token)}&locale=de`;
  const get = await app.request(url);
  expect(get.status).toBe(200);
  expect(await get.text()).toContain(reporterCopy.de.unsubscribeIntro);
  expect(reporterSuppressionsRepo.has('bob@example.com')).toBe(false);
  for (let attempt = 0; attempt < 2; attempt++) {
    const post = await app.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(post.status).toBe(200);
    expect(post.headers.get('cache-control')).toBe('no-store');
    expect(post.headers.get('location')).toBeNull();
  }
  expect(reporterSuppressionsRepo.has('bob@example.com')).toBe(true);
  for (const invalid of ['', `${token}x`, token.replace('Ym9i', 'YWxp')]) {
    expect(reporterSuppressionService.verify(invalid).success).toBe(false);
  }
  expect(
    (
      await app.request(`${portalOrigin}/api/portal/unsubscribe?t=forged`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          Origin: 'https://mail.example.com',
        },
        body: 'List-Unsubscribe=One-Click',
      })
    ).status
  ).toBe(400);
  expect(
    (
      await app.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=Other',
      })
    ).status
  ).toBe(400);
});
