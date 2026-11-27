import type { AppSettings, ProjectSettings, ReporterPortalProjectSettings } from './types';

export const DEFAULT_REPORTER_PORTAL: ReporterPortalProjectSettings = {
  enabled: false,
  allowNewReports: false,
};

/** A project's own Reporter Portal settings, or the instance defaults when it has none */
export function effectiveReporterPortal(
  project: Pick<ProjectSettings, 'reporterPortal'> | undefined,
  settings: Pick<AppSettings, 'reporterPortal'> | undefined
): ReporterPortalProjectSettings {
  return project?.reporterPortal ?? settings?.reporterPortal ?? DEFAULT_REPORTER_PORTAL;
}
