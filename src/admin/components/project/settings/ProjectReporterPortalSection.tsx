import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../../api/client';
import { SettingsCard } from '../../ui/settings-card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Alert, AlertDescription } from '../../ui/alert';
import type { AppSettings, Project } from '@shared/types';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';
import { DEFAULT_REPORTER_PORTAL } from '@shared/reporter-portal';
import { ReporterPortalSwitches } from '../../ReporterPortalSwitches';
import { CustomSwitch, InheritedBadge, InheritedFields } from './ProjectSettingsControls';

const prerequisites = [
  { key: 'appUrl', label: 'Application URL configured', path: '/settings/general' },
  { key: 'smtp', label: 'SMTP configured', path: '/settings/email' },
  { key: 'https', label: 'Secure portal URLs', path: '/settings/general' },
];

export function ProjectReporterPortalSection({
  projectId,
  form,
  update,
  project,
  globalSettings,
}: {
  projectId: string;
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  project: Pick<Project, 'settings' | 'reporterPortalPrerequisites' | 'licenseLocked'> | undefined;
  globalSettings:
    | Pick<AppSettings, 'appUrl' | 'portalBaseUrl' | 'reporterNotifications' | 'reporterPortal'>
    | undefined;
}) {
  const missing = project?.reporterPortalPrerequisites;
  const ready = missing !== undefined && missing.length === 0;
  const portal = form.reporterPortal;
  const inherited = globalSettings?.reporterPortal ?? DEFAULT_REPORTER_PORTAL;
  const emailSettings = project?.settings.reporterNotifications ?? {};
  const emailEnabled =
    project?.settings.notifyReporter !== false &&
    (emailSettings.emailEnabled ?? globalSettings?.reporterNotifications?.emailEnabled ?? true);
  const confirmationEnabled =
    emailEnabled &&
    (emailSettings.notifyOnNewReport ??
      globalSettings?.reporterNotifications?.notifyOnNewReport ??
      true);
  const messagingEnabled =
    project?.settings.notifyReporter !== false &&
    (emailSettings.messagingEnabled ??
      globalSettings?.reporterNotifications?.messagingEnabled ??
      true);
  let portalUrl = '';
  try {
    portalUrl = new URL(
      '/reporter-portal',
      globalSettings?.portalBaseUrl || globalSettings?.appUrl || ''
    ).href;
  } catch {
    // An incomplete instance setup has no portal URL to copy.
  }
  const testLogin = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/reporter-portal/test-login`),
    onSuccess: () => toast.success('Test login email sent'),
  });
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success('Portal URL copied');
    } catch {
      toast.error('Failed to copy portal URL');
    }
  };

  return (
    <>
      <SettingsCard
        title="Reporter Portal"
        description="Let reporters sign in to follow their reports and talk to your team."
        badge={!form.useCustomReporterPortal && <InheritedBadge />}
        action={
          <CustomSwitch
            id="use-custom-reporter-portal"
            label="Use custom reporter portal settings"
            checked={form.useCustomReporterPortal}
            onCheckedChange={(checked) =>
              update(
                // A new override starts from the inherited values.
                checked
                  ? { useCustomReporterPortal: true, reporterPortal: inherited }
                  : { useCustomReporterPortal: false }
              )
            }
          />
        }
      >
        <div className="min-w-0 space-y-6">
          <InheritedFields
            custom={form.useCustomReporterPortal}
            defaultsPath="/settings/project-defaults/reporter-portal"
          >
            <ReporterPortalSwitches
              value={form.useCustomReporterPortal ? portal : inherited}
              onChange={(reporterPortal) => update({ reporterPortal })}
              ready={ready}
              disabled={!form.useCustomReporterPortal || project?.licenseLocked}
              scope="project"
            />
          </InheritedFields>
          <p className="text-sm text-muted-foreground">
            Portal access and email updates are independent. Reporters can read their reports even
            when update emails or messaging are disabled. Update emails respect each reporter's
            unsubscribe preference.
          </p>
          <p className="text-sm text-muted-foreground">
            Reporters see the original description and visible conversation messages. Conversations
            and their files follow the report's retention period.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reporter-portal-url">Portal URL</Label>
            <div className="flex min-w-0 gap-2">
              <Input
                id="reporter-portal-url"
                readOnly
                value={portalUrl}
                placeholder="Configure the Application URL first"
                className="min-w-0"
              />
              <Button
                variant="outline"
                size="icon"
                disabled={!portalUrl}
                onClick={() => void copyUrl()}
                aria-label="Copy portal URL"
              >
                <Copy />
              </Button>
            </div>
          </div>
          {!confirmationEnabled && (
            <Alert>
              <AlertDescription>
                Confirmation emails are disabled. Reporters can request a login link at the portal
                URL.
              </AlertDescription>
            </Alert>
          )}
          {!messagingEnabled && (
            <Alert>
              <AlertDescription>
                Reporter messaging is disabled. Enable it in this project's notification settings to
                send messages to reporters.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SettingsCard>
      <SettingsCard
        title="Portal prerequisites"
        description="Configure secure URLs and outgoing email before enabling the portal."
      >
        <div className="space-y-4">
          {missing === undefined ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Could not load portal prerequisites. Reload the project to try again.
            </p>
          ) : (
            <ul className="space-y-3">
              {prerequisites.map(({ key, label, path }) => (
                <li key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{label}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={missing.includes(key) ? 'status-inactive' : 'status-active'}
                    >
                      {missing.includes(key) ? 'Missing' : 'Ready'}
                    </Badge>
                    {missing.includes(key) && (
                      <Link to={path} className="text-primary hover:underline">
                        Configure
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="outline"
            disabled={!ready || project?.licenseLocked || testLogin.isPending}
            onClick={() => testLogin.mutate()}
          >
            {testLogin.isPending ? 'Sending...' : 'Send me a test login link'}
          </Button>
          {testLogin.isError && (
            <p role="alert" className="text-sm text-destructive">
              {getApiErrorMessage(testLogin.error, 'Failed to send test login email')}
            </p>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
