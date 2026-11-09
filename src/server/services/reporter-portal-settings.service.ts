import { settingsCacheService } from './settings-cache.service.js';
import { reporterAuthService } from './reporter-auth.service.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { isSecurePortalUrl } from '../utils/portal-url.js';
import { validateSmtpConfig } from '../utils/validators.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { Result } from '../utils/result.js';
import type { ProjectSettings } from '@shared/types';

export const reporterPortalSettingsService = {
  async checkPrerequisites(): Promise<Result<void>> {
    const settings = await settingsCacheService.getAll();
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
    if (settings.reporterPortal?.allowNewFeedback && !settings.reporterPortal.enabled)
      return Result.fail(
        'Enable the reporter portal before allowing new feedback',
        'INVALID_REPORTER_PORTAL_SETTINGS'
      );
    const disablingSubmissions =
      previous?.reporterPortal?.enabled &&
      previous.reporterPortal.allowNewFeedback &&
      !settings.reporterPortal?.allowNewFeedback;
    return settings.reporterPortal?.enabled && !disablingSubmissions
      ? this.checkPrerequisites()
      : Result.ok(undefined);
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
