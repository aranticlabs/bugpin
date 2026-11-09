import type { ReactNode } from 'react';
import { AlertTriangle, ArrowUpCircle, ExternalLink, Rocket, Sparkles } from 'lucide-react';
import { useUpdateCheck, type ReleaseType } from '../hooks/useUpdateCheck';
import { cn } from '../lib/utils';
import { NoticeControls } from './NoticeControls';

const WIDGET_PACKAGE_URL =
  'https://www.npmjs.com/package/@arantic/bugpin-widget?activeTab=versions';
const UPGRADE_GUIDE_URL = 'https://docs.bugpin.io/upgrading';
const DISMISS_UPDATE_LABEL = 'Dismiss update notification';

// Update notices use the fixed BugPin palette so custom branding never restyles them.
const linkClass =
  'inline-flex items-center gap-1 text-bugpin-primary-700 hover:underline dark:text-bugpin-primary-400';
const iconClass = 'shrink-0 text-bugpin-primary-700 dark:text-bugpin-primary-400';

function ExternalTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function versionLabel(version: string, releaseType: ReleaseType): string {
  if (releaseType === 'patch') return version;
  return version.split('.').slice(0, 2).join('.');
}

function UpdateNotice({
  releaseType,
  latest,
  releaseUrl,
  onSnooze,
  onDismiss,
}: {
  releaseType: ReleaseType;
  latest: string;
  releaseUrl: string | null;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const label = versionLabel(latest, releaseType);

  if (releaseType === 'major') {
    return (
      <div
        role="status"
        className="flex items-start gap-3 border-b bg-bugpin-primary-700/10 px-4 py-2 text-sm text-foreground dark:bg-bugpin-primary-700/25"
      >
        <Rocket className={cn('mt-0.5 h-4 w-4', iconClass)} aria-hidden="true" />
        <div className="min-w-0 flex-1 break-words">
          <p>
            <span className="font-medium">BugPin {label} is available.</span> This major release
            includes breaking changes.
          </p>
          <p className="text-muted-foreground">
            Back up your data before upgrading.{' '}
            <ExternalTextLink href={UPGRADE_GUIDE_URL}>Upgrade guide</ExternalTextLink>
            {releaseUrl && (
              <>
                {' | '}
                <ExternalTextLink href={releaseUrl}>Release notes</ExternalTextLink>
              </>
            )}
          </p>
        </div>
        <NoticeControls
          onSnooze={onSnooze}
          onDismiss={onDismiss}
          dismissLabel={DISMISS_UPDATE_LABEL}
        />
      </div>
    );
  }

  if (releaseType === 'minor') {
    return (
      <div
        role="status"
        className="flex items-center gap-3 border-b bg-bugpin-primary-700/10 px-4 py-2 text-sm text-foreground dark:bg-bugpin-primary-700/25"
      >
        <Sparkles className={cn('h-4 w-4', iconClass)} aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words">
          <span className="font-medium">BugPin {label} is available.</span>{' '}
          {releaseUrl && <ExternalTextLink href={releaseUrl}>See what&apos;s new</ExternalTextLink>}
        </p>
        <NoticeControls
          onSnooze={onSnooze}
          onDismiss={onDismiss}
          dismissLabel={DISMISS_UPDATE_LABEL}
        />
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b bg-muted px-4 py-1.5 text-xs text-muted-foreground"
    >
      <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words">
        BugPin {label} is available.{' '}
        {releaseUrl && <ExternalTextLink href={releaseUrl}>Release notes</ExternalTextLink>}
      </p>
      <NoticeControls
        onSnooze={onSnooze}
        onDismiss={onDismiss}
        dismissLabel={DISMISS_UPDATE_LABEL}
        small
      />
    </div>
  );
}

export function UpdateBanner() {
  const {
    isAdmin,
    checkEnabled,
    updateAvailable,
    releaseType,
    latest,
    releaseUrl,
    isDismissed,
    dismiss,
    isSnoozed,
    snooze,
    widgetPackage,
    isWidgetWarningDismissed,
    dismissWidgetWarning,
    isWidgetWarningSnoozed,
    snoozeWidgetWarning,
  } = useUpdateCheck();

  if (!isAdmin) {
    return null;
  }

  const showUpdate =
    checkEnabled &&
    updateAvailable &&
    latest !== null &&
    releaseType !== null &&
    !isDismissed &&
    !isSnoozed;
  const showWidgetWarning =
    widgetPackage.incompatible &&
    widgetPackage.warningId !== null &&
    widgetPackage.affectedProjects.length > 0 &&
    !isWidgetWarningDismissed &&
    !isWidgetWarningSnoozed;

  if (!showUpdate && !showWidgetWarning) return null;

  const shownProjects = widgetPackage.affectedProjects.slice(0, 3);
  const remainingProjects = widgetPackage.affectedProjects.length - shownProjects.length;
  const affectedDeployments = widgetPackage.affectedProjects.reduce(
    (total, project) => total + project.deploymentCount,
    0
  );

  return (
    <>
      {showUpdate && latest !== null && releaseType !== null && (
        <UpdateNotice
          releaseType={releaseType}
          latest={latest}
          releaseUrl={releaseUrl}
          onSnooze={snooze}
          onDismiss={dismiss}
        />
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
          <NoticeControls
            onSnooze={snoozeWidgetWarning}
            onDismiss={dismissWidgetWarning}
            dismissLabel="Dismiss widget package compatibility warning"
          />
        </div>
      )}
    </>
  );
}
