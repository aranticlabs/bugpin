import { useState } from 'react';
import { ENTERPRISE_AGREEMENT_VERSION, ENTERPRISE_AGREEMENT_URL } from '@shared/enterprise-license';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { licenseApi } from '../../api/license';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Spinner } from '../../components/ui/spinner';
import { Checkbox } from '../../components/ui/checkbox';
import { api } from '../../api/client';
import { Crown, Check, ExternalLink, Trash2, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import { ScrollArea } from '../../components/ui/scroll-area';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

export function License() {
  const queryClient = useQueryClient();
  const [licenseKey, setLicenseKey] = useState('');
  const [removeConfirmation, setRemoveConfirmation] = useState('');
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [activationStatusPending, setActivationStatusPending] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [activationSelection, setActivationSelection] = useState<{
    projectLimit: number;
    projects: { id: string; name: string }[];
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);

  const invalidateLicense = () => {
    return Promise.all(
      [
        'license-status',
        'license-features',
        'branding-config',
        'projects',
        'project',
        'reports',
        'report',
        'license-projects',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
    );
  };

  const {
    data: status,
    isLoading,
    isFetching,
    isError: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
  });

  const activateMutation = useMutation({
    mutationFn: ({ key, projectIds }: { key: string; projectIds?: string[] }) =>
      licenseApi.activate(key, projectIds, {
        accepted: true,
        version: ENTERPRISE_AGREEMENT_VERSION,
      }),
    onSuccess: async () => {
      setActivationStatusPending(true);
      toast.success('License activated successfully');
      setAgreementOpen(false);
      setAgreementAccepted(false);
      setLicenseKey('');
      setActivationSelection(null);
      setSelectedIds(null);
      try {
        await invalidateLicense();
      } finally {
        setActivationStatusPending(false);
      }
    },
    onError: (
      err: Error & {
        response?: {
          data?: {
            message?: string;
            error?: string;
            projectLimit?: number;
            projects?: { id: string; name: string }[];
          };
        };
      }
    ) => {
      const details = err.response?.data;
      if (
        details?.error === 'PROJECT_SELECTION_REQUIRED' &&
        typeof details.projectLimit === 'number' &&
        details.projects
      ) {
        setActivationSelection({ projectLimit: details.projectLimit, projects: details.projects });
        setSelectedIds([]);
        return;
      }
      toast.error(details?.message || 'Failed to activate license');
    },
  });

  const removeMutation = useMutation({
    mutationFn: licenseApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license-status'] });
      queryClient.invalidateQueries({ queryKey: ['license-features'] });
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      invalidateLicense();
      setSelectedIds(null);
      toast.success('License removed');
    },
    onError: () => {
      toast.error('Failed to remove license');
    },
  });

  const {
    data: projects = [],
    isLoading: loadingProjects,
    isError: projectsError,
  } = useQuery({
    queryKey: ['license-projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data.projects as { id: string; name: string }[];
    },
    enabled: status?.licensed === true && typeof status.projectLimit === 'number',
  });

  const syncMutation = useMutation({
    mutationFn: licenseApi.sync,
    onSuccess: (synced) => {
      invalidateLicense();
      setSelectedIds(null);
      if (synced.message === 'License inactive') {
        toast.info('License is inactive. Enterprise features are disabled.');
      } else {
        toast.success('License synced');
      }
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(
        err.response?.data?.message ||
          'Could not sync license. Your installed license is unchanged.'
      );
    },
  });

  const selectionMutation = useMutation({
    mutationFn: licenseApi.selectProjects,
    onSuccess: () => {
      invalidateLicense();
      setSelectedIds(null);
      toast.success('Licensed projects updated');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Could not update licensed projects');
    },
  });

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      toast.error('Please enter a license key');
      return;
    }
    setAgreementAccepted(false);
    setAgreementOpen(true);
  };

  const confirmActivation = () => {
    if (!agreementAccepted || activateMutation.isPending) return;
    activateMutation.mutate({
      key: licenseKey.trim(),
      projectIds: activationSelection ? (selectedIds ?? []) : undefined,
    });
  };

  if (statusError && !status) {
    return (
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            License Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p role="alert">Could not load license status. Retry to see your installed license.</p>
          <Button variant="outline" onClick={() => void refetchStatus()} disabled={isFetching}>
            {isFetching && <Spinner size="sm" />}
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || activationStatusPending) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  const statusMessage = status?.message?.trim() || 'License inactive';
  const statusDescription = `${statusMessage}${/[.!?]$/.test(statusMessage) ? '' : '.'} Enterprise features are disabled.`;
  const isLicensed = status?.licensed ?? false;
  const expiresDate = status?.expiresAt ? new Date(status.expiresAt) : null;
  const neverExpires = expiresDate ? expiresDate.getFullYear() >= 9999 : false;
  const daysRemaining =
    expiresDate && !neverExpires
      ? Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      {statusError && (
        <div className="space-y-2">
          <p role="alert">Could not refresh license status. Showing the last loaded status.</p>
          <Button variant="outline" onClick={() => void refetchStatus()} disabled={isFetching}>
            {isFetching && <Spinner size="sm" />}
            Retry
          </Button>
        </div>
      )}
      {/* Current License Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            License Status
          </CardTitle>
          <CardDescription>
            {isLicensed
              ? 'Your Enterprise license is active'
              : status?.installed
                ? statusDescription
                : 'Enter your license key to unlock Enterprise features'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLicensed || status?.installed ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant={isLicensed ? 'default' : 'secondary'}
                  className={isLicensed ? 'bg-green-600' : undefined}
                >
                  {isLicensed && <Check className="h-3 w-3 mr-1" />}
                  {isLicensed
                    ? 'Licensed'
                    : status?.message === 'License inactive'
                      ? 'Inactive'
                      : status?.message === 'License has expired'
                        ? 'Expired'
                        : 'Verification required'}
                </Badge>
              </div>
              {isLicensed && status?.warning && (
                <p role="alert" className="text-sm text-orange-500">
                  {status.warning}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{status?.customerName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{status?.customerEmail || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Issued</p>
                  <p className="font-medium">
                    {status?.issuedAt
                      ? new Date(status.issuedAt).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Expires</p>
                  <p className="font-medium">
                    {!expiresDate || neverExpires
                      ? 'Never'
                      : expiresDate.toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                    {daysRemaining > 0 && daysRemaining <= 30 && (
                      <span className="text-orange-500 ml-2">({daysRemaining} days left)</span>
                    )}
                  </p>
                </div>
              </div>

              {!isLicensed && (
                <Button
                  variant="outline"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending || removeMutation.isPending}
                >
                  {syncMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync license
                </Button>
              )}

              {isLicensed && typeof status?.projectLimit === 'number' && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Licensed projects</p>
                      <p className="text-sm text-muted-foreground">
                        {status.usedProjects ?? 0} of {status.projectLimit} projects used
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending || selectionMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        <Spinner size="sm" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Sync license
                    </Button>
                  </div>
                  {status.selectionRequired && (
                    <p role="alert" className="text-sm text-destructive">
                      Your project selection exceeds your allowance. Choose the projects to keep
                      available.
                    </p>
                  )}
                  {loadingProjects ? (
                    <Spinner size="sm" />
                  ) : projectsError ? (
                    <p role="alert">
                      Could not load projects. Please reload before changing your selection.
                    </p>
                  ) : (
                    <>
                      <ProjectSelection
                        projects={projects}
                        limit={status.projectLimit}
                        selectedIds={selectedIds ?? status.licensedProjectIds ?? []}
                        onChange={setSelectedIds}
                        disabled={selectionMutation.isPending || syncMutation.isPending}
                      />
                      <UnsavedChangesGuard
                        isDirty={selectedIds !== null}
                        onSave={() => selectionMutation.mutateAsync(selectedIds ?? [])}
                      />
                      <Button
                        onClick={() =>
                          selectionMutation.mutate(selectedIds ?? status.licensedProjectIds ?? [])
                        }
                        disabled={
                          selectedIds === null ||
                          selectionMutation.isPending ||
                          syncMutation.isPending
                        }
                      >
                        {selectionMutation.isPending && <Spinner size="sm" />}
                        Save project selection
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Licensed Features */}
              {status?.features && status.features.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Licensed Features</p>
                  <div className="flex flex-wrap gap-2">
                    {status.features.map((feature) => (
                      <Badge key={feature} variant="secondary">
                        {feature.replace('-', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Remove License */}
              <div className="pt-4 border-t">
                <AlertDialog onOpenChange={(open) => !open && setRemoveConfirmation('')}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={removeMutation.isPending}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove License
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove License?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove your Enterprise license. All EE features will be disabled
                        until you enter a new license key.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Label
                        htmlFor="remove-license-confirmation"
                        className="text-sm text-muted-foreground"
                      >
                        Type{' '}
                        <span className="font-mono font-semibold text-foreground">license</span> to
                        confirm
                      </Label>
                      <Input
                        id="remove-license-confirmation"
                        placeholder="license"
                        value={removeConfirmation}
                        onChange={(event) => setRemoveConfirmation(event.target.value)}
                        className="mt-2 font-mono"
                        autoComplete="off"
                        spellCheck={false}
                        autoCapitalize="none"
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={removeConfirmation !== 'license' || removeMutation.isPending}
                        onClick={() => {
                          if (removeConfirmation === 'license' && !removeMutation.isPending) {
                            removeMutation.mutate();
                          }
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="license-key">License Key</Label>
                <Textarea
                  id="license-key"
                  placeholder="Paste your license key here..."
                  value={licenseKey}
                  disabled={activateMutation.isPending}
                  onChange={(e) => {
                    setLicenseKey(e.target.value);
                    setAgreementAccepted(false);
                    setActivationSelection(null);
                    setSelectedIds(null);
                  }}
                  rows={4}
                  className="field-sizing-content min-h-[100px] resize-none font-mono text-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <Button type="submit" disabled={activateMutation.isPending || statusError}>
                  {activateMutation.isPending && <Spinner size="sm" className="mr-2" />}
                  Activate License
                </Button>
                <a
                  href="https://bugpin.io/editions/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Get a license
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={agreementOpen}
        onOpenChange={(open) => {
          if (activateMutation.isPending) return;
          setAgreementOpen(open);
          if (!open) setAgreementAccepted(false);
        }}
      >
        <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col">
          <ScrollArea className="-mx-6" contentClassName="space-y-4 px-6">
            <AlertDialogHeader>
              <AlertDialogTitle>Activate Enterprise License</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Review the Enterprise License Agreement before activating this license. If you
                    act for another person or an organization, you must be authorized to accept on
                    their behalf.
                  </p>
                  <p>
                    <strong className="font-medium text-foreground">
                      Activating binds this license to this installation.
                    </strong>{' '}
                    This key cannot be used on another installation. To move your license, you must
                    replace (rotate) the key first.
                  </p>
                  <p>
                    Sign in to the{' '}
                    <a
                      href="https://bugpin.io/portal/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      customer portal
                    </a>
                    , find your license, and choose{' '}
                    <strong>Replace license for another server</strong>. Type{' '}
                    <strong>replace</strong> to confirm, then copy or download the new key and
                    activate it on the new installation. The old key is revoked. Replacement is
                    available once every 24 hours.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {activationSelection && (
              <div className="space-y-3">
                <p className="font-medium">
                  Choose up to {activationSelection.projectLimit} projects to keep available
                </p>
                <ProjectSelection
                  projects={activationSelection.projects}
                  limit={activationSelection.projectLimit}
                  selectedIds={selectedIds ?? []}
                  onChange={setSelectedIds}
                  disabled={activateMutation.isPending}
                />
              </div>
            )}
            <div className="flex items-center gap-3 py-2">
              <Checkbox
                id="enterprise-license-agreement"
                checked={agreementAccepted}
                onCheckedChange={(checked) => setAgreementAccepted(checked === true)}
                disabled={activateMutation.isPending}
              />
              <Label htmlFor="enterprise-license-agreement" className="text-sm leading-relaxed">
                I accept the{' '}
                <a
                  href={ENTERPRISE_AGREEMENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  BugPin Enterprise License Agreement
                </a>
                .
              </Label>
            </div>
          </ScrollArea>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!agreementAccepted || activateMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmActivation();
              }}
            >
              {activateMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Agree &amp; Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectSelection({
  projects,
  limit,
  selectedIds,
  onChange,
  disabled,
}: {
  projects: { id: string; name: string }[];
  limit: number;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="sr-only">Select licensed projects</legend>
      <p className="text-sm text-muted-foreground">
        Unselected projects remain read-only. Their reports and files are preserved. Pausing a
        selected project does not release its license slot.
      </p>
      {projects.map((project) => {
        const checked = selectedIds.includes(project.id);
        return (
          <div key={project.id} className="flex items-center gap-2">
            <Checkbox
              id={`licensed-${project.id}`}
              checked={checked}
              disabled={disabled || (!checked && selectedIds.length >= limit)}
              onCheckedChange={(value) =>
                onChange(
                  value === true
                    ? [...selectedIds, project.id]
                    : selectedIds.filter((id) => id !== project.id)
                )
              }
            />
            <Label htmlFor={`licensed-${project.id}`}>{project.name}</Label>
          </div>
        );
      })}
    </fieldset>
  );
}
