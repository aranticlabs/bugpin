import { settingsCacheService } from './settings-cache.service.js';
import { reporterAuthService } from './reporter-auth.service.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { isSecurePortalUrl } from '../utils/portal-url.js';
import { validateSmtpConfig } from '../utils/validators.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { Result } from '../utils/result.js';
import { reporterOwnershipService } from './reporter-ownership.service.js';
import type { AppSettings, ProjectSettings, ReporterPortalProjectSettings } from '@shared/types';
import { effectiveReporterPortal } from '@shared/reporter-portal';

export const reporterPortalSettingsService = {
  /** Checks the stored settings, or the values a settings update is about to save */
  async checkPrerequisites(
    candidate?: Pick<AppSettings, 'appUrl' | 'portalBaseUrl' | 'smtpEnabled' | 'smtpConfig'>
  ): Promise<Result<void>> {
    const settings = candidate ?? (await settingsCacheService.getAll());
    const missing: string[] = [];
    if (!settings.appUrl) missing.push('appUrl');
    if (!settings.smtpEnabled || !validateSmtpConfig(settings.smtpConfig).success)
      missing.push('smtp');
    if (
      (settings.appUrl && !isSecurePortalUrl(settings.appUrl)) ||
      (settings.portalBaseUrl && !isSecurePortalUrl(settings.portalBaseUrl))
    )
      missing.push('https');
    return missing.length
      ? Result.fail(
          'Configure the Application URL, SMTP, and secure portal URLs before enabling the reporter portal',
          'PORTAL_PREREQUISITES_MISSING',
          missing
        )
      : Result.ok(undefined);
  },

  async validate(settings: ProjectSettings, previous?: ProjectSettings): Promise<Result<void>> {
    if (settings.reporterPortal || !previous)
      return this.validatePortal(
        settings.reporterPortal ?? undefined,
        previous?.reporterPortal ?? undefined
      );
    // Returning to the defaults needs the prerequisites only when it turns something on.
    const defaults = await settingsCacheService.getAll();
    const next = effectiveReporterPortal(settings, defaults);
    const before = effectiveReporterPortal(previous, defaults);
    return (next.enabled && !before.enabled) || (next.allowNewReports && !before.allowNewReports)
      ? this.checkPrerequisites()
      : Result.ok(undefined);
  },

  /** The same rules apply to a project override and to the instance defaults */
  async validatePortal(
    portal: ReporterPortalProjectSettings | undefined,
    previous?: ReporterPortalProjectSettings,
    candidate?: Parameters<typeof this.checkPrerequisites>[0]
  ): Promise<Result<void>> {
    if (portal?.allowNewReports && !portal.enabled)
      return Result.fail(
        'Enable the Reporter Portal before allowing new reports',
        'INVALID_REPORTER_PORTAL_SETTINGS'
      );
    const disablingSubmissions =
      previous?.enabled && previous.allowNewReports && !portal?.allowNewReports;
    return portal?.enabled && !disablingSubmissions
      ? this.checkPrerequisites(candidate)
      : Result.ok(undefined);
  },

  async overview(): Promise<Result<{ prerequisites: string[]; claimableReports: number }>> {
    try {
      const prerequisites = await this.checkPrerequisites();
      if (!prerequisites.success && prerequisites.code !== 'PORTAL_PREREQUISITES_MISSING')
        return prerequisites;
      return Result.ok({
        prerequisites: prerequisites.success ? [] : (prerequisites.details ?? []),
        claimableReports: reporterOwnershipService.countClaimable(),
      });
    } catch {
      return Result.fail('Unable to load Reporter Portal settings', 'SETTINGS_READ_FAILED');
    }
  },

  makeExistingReportsClaimable(userId: string): Result<number> {
    return reporterOwnershipService.claimExisting(userId);
  },

  async testLogin(projectId: string, email: string): Promise<Result<void>> {
    const project = await projectsRepo.findById(projectId);
    if (!project) return Result.fail('Project not found', 'NOT_FOUND');
    const access = checkProjectLicense(projectId);
    if (!access.success) return access;
    const prerequisites = await this.checkPrerequisites();
    if (!prerequisites.success) return prerequisites;
    return reporterAuthService.sendLoginLink(email);
  },
};
