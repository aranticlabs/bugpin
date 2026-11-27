import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ReporterPortalProjectSettings } from '@shared/types';
import { DEFAULT_REPORTER_PORTAL } from '@shared/reporter-portal';
import { api } from '../../api/client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { SettingsCard } from '../../components/ui/settings-card';
import { Spinner } from '../../components/ui/spinner';
import { ReporterPortalSwitches } from '../../components/ReporterPortalSwitches';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { apiErrorMessage } from '../../lib/apiError';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';

const overviewKey = ['settings', 'reporter-portal'] as const;

const prerequisiteLabels: Record<string, { label: string; path: string }> = {
  appUrl: { label: 'an Application URL', path: '/settings/general' },
  smtp: { label: 'outgoing email (SMTP)', path: '/settings/email' },
  https: { label: 'secure portal URLs', path: '/settings/general' },
};

interface Overview {
  prerequisites: string[];
  claimableReports: number;
}

export function ReporterPortalDefaults() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const overview = useQuery({
    queryKey: overviewKey,
    queryFn: async () => (await api.get('/settings/reporter-portal')).data as Overview,
  });
  const saved = settings?.reporterPortal ?? DEFAULT_REPORTER_PORTAL;
  const [portal, setPortal] = useState<ReporterPortalProjectSettings>(saved);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setPortal(saved), [saved.enabled, saved.allowNewReports]);
  const isDirty =
    portal.enabled !== saved.enabled || portal.allowNewReports !== saved.allowNewReports;
  const mutation = useUpdateSettings({ successMessage: 'Reporter Portal defaults saved' });
  const claim = useMutation({
    mutationFn: async () =>
      (await api.post('/settings/reporter-portal/claim-existing')).data as { count: number },
    onSuccess: ({ count }) => {
      toast.success(
        count === 1 ? '1 report is now claimable' : `${count} reports are now claimable`
      );
      void queryClient.invalidateQueries({ queryKey: overviewKey });
      setConfirming(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update existing reports')),
  });

  if (isLoading || overview.isPending)
    return (
      <div className="flex justify-center py-12">
        <Spinner className="text-primary" />
      </div>
    );

  const missing = overview.data?.prerequisites ?? [];
  const ready = overview.isSuccess && missing.length === 0;
  const claimable = overview.data?.claimableReports ?? 0;
  const save = async () => {
    try {
      await mutation.mutateAsync({ reporterPortal: portal });
      void queryClient.invalidateQueries({ queryKey: overviewKey });
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard
        title="Portal access"
        description="Defaults for every project without its own Reporter Portal settings."
      >
        <UnsavedChangesGuard isDirty={isDirty} onSave={save} onDiscard={() => setPortal(saved)} />
        <div className="space-y-6">
          {overview.isError && (
            <div className="space-y-3">
              <Alert variant="destructive">
                <AlertDescription>
                  Unable to load the Reporter Portal requirements.
                </AlertDescription>
              </Alert>
              <Button variant="outline" onClick={() => void overview.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {missing.length > 0 && (
            <Alert>
              <AlertDescription>
                Before the portal can be turned on, configure{' '}
                {missing.map((key, index) => (
                  <span key={key}>
                    {index > 0 && (index === missing.length - 1 ? ' and ' : ', ')}
                    <Link
                      to={prerequisiteLabels[key]?.path ?? '/settings/general'}
                      className="underline"
                    >
                      {prerequisiteLabels[key]?.label ?? key}
                    </Link>
                  </span>
                ))}
                .
              </AlertDescription>
            </Alert>
          )}
          <ReporterPortalSwitches
            value={portal}
            onChange={setPortal}
            ready={ready}
            scope="defaults"
          />
        </div>
      </SettingsCard>
      <SettingsCard
        title="Existing reports"
        description="Reports submitted before the portal was on are not claimable until you make them claimable."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {claimable === 1
              ? '1 report in a project with the portal on has a contact email but no reporter yet.'
              : `${claimable} reports in projects with the portal on have a contact email but no reporter yet.`}
          </p>
          <Button
            variant="outline"
            disabled={claimable === 0 || claim.isPending}
            onClick={() => setConfirming(true)}
          >
            Make existing reports claimable
          </Button>
        </div>
      </SettingsCard>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!claim.isPending) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make existing reports claimable?</AlertDialogTitle>
            <AlertDialogDescription>
              {claimable === 1 ? '1 report' : `${claimable} reports`} become claimable by their
              contact email. Whoever signs in to the portal with that email can then read the report
              and its visible conversation. Reports whose owner you already assigned or removed are
              skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={claim.isPending}>Cancel</AlertDialogCancel>
            <Button disabled={claim.isPending} onClick={() => claim.mutate()}>
              {claim.isPending ? <Spinner size="sm" className="mr-2" /> : null}
              Make claimable
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
