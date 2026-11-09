import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { reporterAuthService } from './reporter-auth.service.js';
import { reporterSuppressionService } from './reporter-suppression.service.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { isValidEmail } from '../utils/validators.js';
import { Result } from '../utils/result.js';
import { normalizeLocale } from '../utils/locale.js';
import type { AppSettings, Project, Report } from '@shared/types';
import type { ReporterEmailOptions } from './email.service.js';

export const reporterCorrespondenceService = {
  recipient(
    report: Pick<Report, 'reporterId' | 'claimableEmail' | 'reporterEmail'>
  ): string | null {
    const owner = report.reporterId ? reportersRepo.findById(report.reporterId) : null;
    const email = owner?.email ?? report.claimableEmail ?? report.reporterEmail;
    const normalized = email ? normalizeEmail(email) : null;
    return normalized && isValidEmail(normalized) ? normalized : null;
  },

  staffCopyOptions(report: Report, project: Project, settings: AppSettings): ReporterEmailOptions {
    const owner = report.reporterId ? reportersRepo.findById(report.reporterId) : null;
    const options: ReporterEmailOptions = {
      locale: normalizeLocale(owner?.locale ?? report.reporterLocale) ?? 'en',
      portalUrl: '',
      reportPortalUrl: '',
      loginUrl: '',
      unsubscribeUrl: '',
    };
    const baseUrl = settings.portalBaseUrl || settings.appUrl;
    if (baseUrl && project.settings?.reporterPortal?.enabled) {
      options.portalUrl = new URL('/reporter-portal', baseUrl).href;
      if (owner || report.claimableEmail)
        options.reportPortalUrl = new URL(`/reporter-portal/reports/${report.id}`, baseUrl).href;
    }
    return options;
  },

  prepare(
    report: Report,
    project: Project,
    settings: AppSettings,
    source?: 'confirmation' | 'invitation'
  ): Result<{ recipient: string; options: ReporterEmailOptions } | null> {
    const recipient = this.recipient(report);
    if (!recipient || reporterSuppressionService.isSuppressed(recipient)) return Result.ok(null);
    const owner = report.reporterId ? reportersRepo.findById(report.reporterId) : null;
    if (reportersRepo.findByEmail(recipient)?.suspendedAt) return Result.ok(null);
    const options = this.staffCopyOptions(report, project, settings);
    const baseUrl = settings.portalBaseUrl || settings.appUrl;
    if (baseUrl) {
      const unsubscribe = new URL('/api/portal/unsubscribe', baseUrl);
      unsubscribe.searchParams.set('t', reporterSuppressionService.unsubscribeToken(recipient));
      unsubscribe.searchParams.set('locale', options.locale);
      options.unsubscribeUrl = unsubscribe.href;
      if (project.settings?.reporterPortal?.enabled) {
        options.portalUrl = new URL('/reporter-portal', baseUrl).href;
        if (owner || report.claimableEmail) {
          options.reportPortalUrl = new URL(`/reporter-portal/reports/${report.id}`, baseUrl).href;
          if (source && (source === 'confirmation' || !owner)) {
            const minted = reporterAuthService.mintLoginToken(recipient, source, report.id);
            if (!minted.success) return minted;
            const login = new URL('/reporter-portal/login', baseUrl);
            login.hash = minted.value.secret;
            options.loginToken = minted.value;
            options.loginUrl = login.href;
          }
        }
      }
    }
    return Result.ok({ recipient, options });
  },
};
