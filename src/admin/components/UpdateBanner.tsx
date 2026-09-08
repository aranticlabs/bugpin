import { AlertTriangle, ExternalLink, Sparkles, X } from 'lucide-react';
import { useUpdateCheck } from '../hooks/useUpdateCheck';

const WIDGET_PACKAGE_URL =
  'https://www.npmjs.com/package/@arantic/bugpin-widget?activeTab=versions';

export function UpdateBanner() {
  const {
    isAdmin,
    checkEnabled,
    updateAvailable,
    latest,
    releaseUrl,
    isDismissed,
    dismiss,
    widgetPackage,
    isWidgetWarningDismissed,
    dismissWidgetWarning,
  } = useUpdateCheck();

  if (!isAdmin) {
    return null;
  }

  const showUpdate = checkEnabled && updateAvailable && latest !== null && !isDismissed;
  const showWidgetWarning =
    widgetPackage.incompatible &&
    widgetPackage.warningId !== null &&
    widgetPackage.affectedProjects.length > 0 &&
    !isWidgetWarningDismissed;

  if (!showUpdate && !showWidgetWarning) return null;

  const shownProjects = widgetPackage.affectedProjects.slice(0, 3);
  const remainingProjects = widgetPackage.affectedProjects.length - shownProjects.length;
  const affectedDeployments = widgetPackage.affectedProjects.reduce(
    (total, project) => total + project.deploymentCount,
    0
  );

  return (
    <>
      {showUpdate && (
        <div
          role="status"
          className="flex items-center gap-3 border-b bg-primary/10 px-4 py-2 text-sm text-foreground"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            A new version of BugPin is available — <span className="font-medium">v{latest}</span>.{' '}
            {releaseUrl && (
              <a
                href={releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View release notes
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss update notification"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-primary/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showWidgetWarning && (
        <div
          role="status"
          className="flex items-start gap-3 border-b bg-amber-500/10 px-4 py-2 text-sm text-foreground"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 break-words">
            <p className="font-medium">
              {widgetPackage.affectedProjects.length}{' '}
              {widgetPackage.affectedProjects.length === 1 ? 'project uses' : 'projects use'} a
              widget version unsupported by this BugPin server ({affectedDeployments} affected{' '}
              {affectedDeployments === 1 ? 'deployment' : 'deployments'}).
            </p>
            <p className="text-muted-foreground">
              {shownProjects.map((project, index) => (
                <span key={project.projectId}>
                  {index > 0 && ', '}
                  {project.projectName} (v{project.observedVersions[0]})
                </span>
              ))}
              {remainingProjects > 0 && `, +${remainingProjects} more`}. Upgrade to v
              {widgetPackage.minimumSupportedVersion} or newer.{' '}
              <a
                href={WIDGET_PACKAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View package versions
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={dismissWidgetWarning}
            aria-label="Dismiss widget package compatibility warning"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-amber-500/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
