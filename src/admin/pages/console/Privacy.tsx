import { AlertTriangle, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { SettingsCard } from '../../components/ui/settings-card';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { Switch } from '../../components/ui/switch';
import type { PrivacySettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { useDraft, useSettings, useUpdateSettings } from '../../hooks/useSettings';

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  euPrivacyMode: false,
};

export function Privacy() {
  const { data: settings, isLoading, isError, isFetching, refetch } = useSettings();
  const draft = useDraft<PrivacySettings>(
    settings && (settings.privacy ?? DEFAULT_PRIVACY_SETTINGS)
  );
  const mutation = useUpdateSettings({
    successMessage: 'Privacy settings saved successfully',
    errorMessage: 'Failed to save privacy settings',
  });

  const save = async () => {
    try {
      await mutation.mutateAsync({ privacy: draft.changes });
      draft.reset();
      return true;
    } catch {
      return false;
    }
  };

  if (isLoading) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !draft.value) {
    return (
      <SettingsCard
        title="EU Privacy Mode"
        description="Control user activity trails across this BugPin instance."
        className="max-w-4xl"
      >
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Privacy settings could not be loaded. No changes can be saved until the current
              setting is available.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Retrying...
              </>
            ) : (
              'Retry'
            )}
          </Button>
        </div>
      </SettingsCard>
    );
  }

  const formData = draft.value;

  return (
    <div className="max-w-4xl space-y-6">
      <SettingsCard
        title="EU Privacy Mode"
        description="Control user activity trails across this BugPin instance."
      >
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <Label htmlFor="eu-privacy-mode">Enable EU Privacy Mode</Label>
              <p className="text-sm text-muted-foreground">
                Disable user activity trails for every project.
              </p>
            </div>
            <Switch
              id="eu-privacy-mode"
              checked={formData.euPrivacyMode}
              onCheckedChange={(enabled) => draft.set('euPrivacyMode', enabled)}
            />
          </div>

          {formData.euPrivacyMode ? (
            <Alert className="[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>Activity trails are disabled for all projects.</AlertDescription>
            </Alert>
          ) : (
            <Alert className="[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Activity trails are available. You are responsible for any required authorization
                under EU regulations.
              </AlertDescription>
            </Alert>
          )}

          <UnsavedChangesGuard isDirty={draft.isDirty} onSave={save} onDiscard={draft.reset} />
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://docs.bugpin.io/privacy/eu-privacy-mode"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Learn how EU Privacy Mode works
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
