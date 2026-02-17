import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Integration,
  IntegrationType,
  GitHubIntegrationConfig,
  GitHubSyncMode,
} from '@shared/types';
import {
  useCreateIntegration,
  useUpdateIntegration,
  useTestIntegration,
  useFetchGitHubRepos,
  useFetchGitHubLabels,
  useFetchGitHubAssignees,
  useSetSyncMode,
  GitHubRepository,
  GitHubLabel,
  GitHubAssignee,
} from '../hooks/useIntegrations';
import { SyncExistingReportsDialog } from './SyncExistingReportsDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RefreshCw, Lock, HelpCircle, CheckCircle } from 'lucide-react';
import { Spinner } from './ui/spinner';
import { toast } from 'sonner';
import { Checkbox } from './ui/checkbox';
import { Switch } from './ui/switch';
import { GitHubTokenHelpDialog } from './GitHubTokenHelpDialog';

interface IntegrationDialogProps {
  open: boolean;
  onClose: () => void;
  integration?: Integration; // For editing
  projectId: string;
}

// Form schema - accessToken is conditionally required based on isEditing
const createFormSchema = (isEditing: boolean) =>
  z.object({
    name: z.string().min(1, 'Integration name is required'),
    accessToken: isEditing
      ? z.string().optional()
      : z.string().min(1, 'Personal access token is required'),
    owner: z.string().min(1, 'GitHub username or organization is required'),
    repo: z.string().min(1, 'Repository name is required'),
  });

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

export function IntegrationDialog({
  open,
  onClose,
  integration,
  projectId,
}: IntegrationDialogProps) {
  const isEditing = !!integration;
  const createMutation = useCreateIntegration();
  const updateMutation = useUpdateIntegration();
  const testMutation = useTestIntegration();
  const fetchReposMutation = useFetchGitHubRepos();
  const fetchLabelsMutation = useFetchGitHubLabels();
  const fetchAssigneesMutation = useFetchGitHubAssignees();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(createFormSchema(isEditing)),
    defaultValues: {
      name: '',
      accessToken: '',
      owner: '',
      repo: '',
    },
  });

  const watchedToken = watch('accessToken');
  const watchedOwner = watch('owner');
  const watchedRepo = watch('repo');

  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<GitHubLabel[]>([]);
  const [availableAssignees, setAvailableAssignees] = useState<GitHubAssignee[]>([]);
  const [enableLabels, setEnableLabels] = useState(false);
  const [enableAssignees, setEnableAssignees] = useState(false);
  const [labelsError, setLabelsError] = useState(false);
  const [assigneesError, setAssigneesError] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [syncMode, setSyncMode] = useState<GitHubSyncMode>('manual');
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [pendingUnsyncedCount, setPendingUnsyncedCount] = useState(0);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const setSyncModeMutation = useSetSyncMode();

  // Load integration data when editing
  useEffect(() => {
    if (open) {
      if (integration) {
        const config = integration.config as GitHubIntegrationConfig;
        reset({
          name: integration.name,
          accessToken: '', // Don't prefill masked token
          owner: config.owner || '',
          repo: config.repo || '',
        });
        setSelectedLabels(config.labels || []);
        setSelectedAssignees(config.assignees || []);
        setEnableLabels((config.labels?.length ?? 0) > 0);
        setEnableAssignees((config.assignees?.length ?? 0) > 0);
        setSyncMode(config.syncMode || 'manual');
      } else {
        // Reset for new integration
        reset({
          name: '',
          accessToken: '',
          owner: '',
          repo: '',
        });
        setSelectedLabels([]);
        setSelectedAssignees([]);
        setEnableLabels(false);
        setEnableAssignees(false);
        setSyncMode('manual');
      }
      setRepositories([]);
      setSelectedRepo('');
      setAvailableLabels([]);
      setAvailableAssignees([]);
      setLabelsError(false);
      setAssigneesError(false);
      setShowTokenInput(false);
      setShowSyncDialog(false);
      setPendingUnsyncedCount(0);
    }
  }, [integration, open, reset]);

  const handleFetchRepos = async () => {
    if (!watchedToken?.trim()) {
      toast.error('Please enter an access token first');
      return;
    }

    try {
      const repos = await fetchReposMutation.mutateAsync(watchedToken);
      setRepositories(repos);
      if (repos.length === 0) {
        toast.error(
          'No repositories found. Make sure your token has access to at least one repository.',
        );
      }
    } catch {
      // Error is handled by the mutation's onError
    }
  };

  const handleRepoSelect = (fullName: string) => {
    setSelectedRepo(fullName);
    const repo = repositories.find((r) => r.fullName === fullName);
    if (repo) {
      setValue('owner', repo.owner);
      setValue('repo', repo.name);
      // Reset labels/assignees when repo changes
      setAvailableLabels([]);
      setAvailableAssignees([]);
      setLabelsError(false);
      setAssigneesError(false);
    }
  };

  const handleToggleLabels = async (enabled: boolean) => {
    setEnableLabels(enabled);
    if (enabled && availableLabels.length === 0 && watchedOwner && watchedRepo) {
      setLabelsError(false);
      try {
        const result = await fetchLabelsMutation.mutateAsync({
          accessToken: watchedToken || '',
          owner: watchedOwner,
          repo: watchedRepo,
        });
        setAvailableLabels(result);
      } catch {
        setLabelsError(true);
        toast.error('Unable to load labels. Token needs Metadata: Read permission.');
      }
    }
    if (!enabled) {
      setSelectedLabels([]);
    }
  };

  const handleToggleAssignees = async (enabled: boolean) => {
    setEnableAssignees(enabled);
    if (enabled && availableAssignees.length === 0 && watchedOwner && watchedRepo) {
      setAssigneesError(false);
      try {
        const result = await fetchAssigneesMutation.mutateAsync({
          accessToken: watchedToken || '',
          owner: watchedOwner,
          repo: watchedRepo,
        });
        setAvailableAssignees(result);
      } catch {
        setAssigneesError(true);
        toast.error('Unable to load assignees. Token needs Metadata: Read permission.');
      }
    }
    if (!enabled) {
      setSelectedAssignees([]);
    }
  };

  const handleSyncModeToggle = async (enabled: boolean) => {
    if (!integration) return;

    if (enabled) {
      // Switching to automatic - check for unsynced reports
      try {
        const response = await fetch(`/api/integrations/${integration.id}/sync-status`, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success && data.unsyncedCount > 0) {
          setPendingUnsyncedCount(data.unsyncedCount);
          setShowSyncDialog(true);
          return;
        }
      } catch {
        // If we can't fetch status, proceed without dialog
      }
      // No unsynced reports, enable directly
      try {
        await setSyncModeMutation.mutateAsync({ id: integration.id, syncMode: 'automatic' });
        setSyncMode('automatic');
      } catch (error: unknown) {
        // Check if it's a CONFIG_ERROR (missing APP_URL)
        if (
          error &&
          typeof error === 'object' &&
          'response' in error &&
          error.response &&
          typeof error.response === 'object' &&
          'data' in error.response &&
          error.response.data &&
          typeof error.response.data === 'object' &&
          'error' in error.response.data &&
          error.response.data.error === 'CONFIG_ERROR'
        ) {
          setShowConfigDialog(true);
        }
        // Other errors will be handled by the mutation's onError
      }
    } else {
      // Switching to manual
      await setSyncModeMutation.mutateAsync({ id: integration.id, syncMode: 'manual' });
      setSyncMode('manual');
    }
  };

  const handleSyncDialogConfirm = async () => {
    if (!integration) return;
    await setSyncModeMutation.mutateAsync({ id: integration.id, syncMode: 'automatic' });
    setSyncMode('automatic');
    setShowSyncDialog(false);
  };

  const handleTest = async () => {
    if (!watchedOwner || !watchedRepo || !watchedToken) {
      toast.error('Please fill in owner, repo, and access token to test the connection');
      return;
    }

    if (isEditing && integration) {
      const result = await testMutation.mutateAsync(integration.id);
      if (result.success) {
        toast.success('Connection successful!');
      } else {
        toast.error(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    } else {
      toast.error('Save the integration first to test the connection');
    }
  };

  const onSubmit = async (data: FormData) => {
    const config: GitHubIntegrationConfig = {
      owner: data.owner.trim(),
      repo: data.repo.trim(),
      accessToken:
        data.accessToken?.trim() || (integration?.config as GitHubIntegrationConfig).accessToken,
      labels: selectedLabels.length > 0 ? selectedLabels : undefined,
      assignees: selectedAssignees.length > 0 ? selectedAssignees : undefined,
    };

    try {
      if (isEditing && integration) {
        const updateData: { name?: string; config?: GitHubIntegrationConfig } = {
          name: data.name.trim(),
        };

        if (data.accessToken) {
          updateData.config = config;
        } else {
          updateData.config = {
            ...config,
            accessToken: (integration.config as GitHubIntegrationConfig).accessToken,
          };
        }

        await updateMutation.mutateAsync({
          id: integration.id,
          data: updateData,
        });
      } else {
        await createMutation.mutateAsync({
          projectId,
          type: 'github' as IntegrationType,
          name: data.name.trim(),
          config,
        });
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save integration';
      toast.error(message);
    }
  };

  const mutation = isEditing ? updateMutation : createMutation;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-3xl">
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Integration' : 'Add Integration'}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Update integration settings' : 'Create a new external integration'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Integration Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Main Repository"
                  {...register('name')}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="token">
                  Personal Access Token {!isEditing && <span className="text-destructive">*</span>}
                </Label>

                {isEditing && !showTokenInput ? (
                  // Show "token saved" state when editing
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-muted rounded-md border">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Token saved</span>
                      <span className="text-xs text-muted-foreground">••••••••••••••••</span>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setShowTokenInput(true)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  // Show input field for new integrations or when changing token
                  <>
                    <div className="flex gap-2">
                      <Input
                        id="token"
                        type="password"
                        placeholder="ghp_... or github_pat_..."
                        {...register('accessToken')}
                        aria-invalid={!!errors.accessToken}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleFetchRepos}
                        disabled={fetchReposMutation.isPending || !watchedToken?.trim()}
                        title="Load repositories"
                      >
                        {fetchReposMutation.isPending ? (
                          <Spinner size="sm" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      {isEditing && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setShowTokenInput(false);
                            setValue('accessToken', '');
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    {errors.accessToken && (
                      <p className="text-sm text-destructive">{errors.accessToken.message}</p>
                    )}
                  </>
                )}

                <p className="text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setShowTokenHelp(true)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    How to create a GitHub token
                  </button>
                  {(!isEditing || showTokenInput) && (
                    <>
                      {' · '}
                      After entering your token, click <RefreshCw className="h-3 w-3 inline" /> to
                      load repositories.
                    </>
                  )}
                </p>
              </div>

              {/* Repository Selection */}
              <div className="space-y-2">
                <Label>Repository</Label>

                {repositories.length > 0 ? (
                  <Select value={selectedRepo} onValueChange={handleRepoSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a repository..." />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repo) => (
                        <SelectItem key={repo.fullName} value={repo.fullName}>
                          <div className="flex items-center gap-2">
                            {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                            <span>{repo.fullName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : watchedOwner && watchedRepo ? (
                  // Show current repo when editing (no repos loaded yet)
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {watchedOwner}/{watchedRepo}
                    </span>
                    {isEditing && !showTokenInput && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Click "Change" above to switch repository
                      </span>
                    )}
                    {isEditing && showTokenInput && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Click <RefreshCw className="h-3 w-3 inline" /> to load repositories
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-muted/50 rounded-md border border-dashed text-muted-foreground text-sm">
                    Enter your token above and click <RefreshCw className="h-3 w-3 inline mx-1" />{' '}
                    to load repositories
                  </div>
                )}

                {(errors.owner || errors.repo) && (
                  <p className="text-sm text-destructive">Please select a repository</p>
                )}

                {/* Hidden inputs for form validation */}
                <input type="hidden" {...register('owner')} />
                <input type="hidden" {...register('repo')} />
              </div>

              {/* Labels Toggle */}
              <div className="space-y-3 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable-labels" className="text-base">
                      Add labels to issues
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically apply labels when forwarding reports
                    </p>
                  </div>
                  <Switch
                    id="enable-labels"
                    checked={enableLabels}
                    onCheckedChange={handleToggleLabels}
                    disabled={!watchedOwner || !watchedRepo}
                  />
                </div>

                {enableLabels && (
                  <div className="pt-2 border-t">
                    {labelsError ? (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
                        <div className="flex items-start gap-2">
                          <HelpCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div className="text-amber-800 dark:text-amber-200">
                            <p className="font-medium">Unable to load labels</p>
                            <p className="mt-1 text-sm">
                              Your token needs <strong>Metadata: Read</strong> permission.{' '}
                              <button
                                type="button"
                                onClick={() => setShowTokenHelp(true)}
                                className="underline hover:no-underline"
                              >
                                View token setup
                              </button>
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : fetchLabelsMutation.isPending ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Spinner size="xs" />
                        Loading labels...
                      </p>
                    ) : availableLabels.length > 0 ? (
                      <div className="space-y-2">
                        <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-2">
                          {availableLabels.map((label) => (
                            <div key={label.name} className="flex items-center space-x-2">
                              <Checkbox
                                id={`label-${label.name}`}
                                checked={selectedLabels.includes(label.name)}
                                onCheckedChange={(checked: boolean) => {
                                  if (checked) {
                                    setSelectedLabels([...selectedLabels, label.name]);
                                  } else {
                                    setSelectedLabels(
                                      selectedLabels.filter((l) => l !== label.name),
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor={`label-${label.name}`}
                                className="text-sm flex items-center gap-2 cursor-pointer"
                              >
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: `#${label.color}` }}
                                />
                                {label.name}
                              </label>
                            </div>
                          ))}
                        </div>
                        {selectedLabels.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Selected: {selectedLabels.join(', ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No labels found in this repository
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Assignees Toggle */}
              <div className="space-y-3 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enable-assignees" className="text-base">
                      Assign issues to users
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically assign team members when forwarding reports
                    </p>
                  </div>
                  <Switch
                    id="enable-assignees"
                    checked={enableAssignees}
                    onCheckedChange={handleToggleAssignees}
                    disabled={!watchedOwner || !watchedRepo}
                  />
                </div>

                {enableAssignees && (
                  <div className="pt-2 border-t">
                    {assigneesError ? (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
                        <div className="flex items-start gap-2">
                          <HelpCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div className="text-amber-800 dark:text-amber-200">
                            <p className="font-medium">Unable to load assignees</p>
                            <p className="mt-1 text-sm">
                              Your token needs <strong>Metadata: Read</strong> permission.{' '}
                              <button
                                type="button"
                                onClick={() => setShowTokenHelp(true)}
                                className="underline hover:no-underline"
                              >
                                View token setup
                              </button>
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : fetchAssigneesMutation.isPending ? (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Spinner size="xs" />
                        Loading assignees...
                      </p>
                    ) : availableAssignees.length > 0 ? (
                      <div className="space-y-2">
                        <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-2">
                          {availableAssignees.map((assignee) => (
                            <div key={assignee.login} className="flex items-center space-x-2">
                              <Checkbox
                                id={`assignee-${assignee.login}`}
                                checked={selectedAssignees.includes(assignee.login)}
                                onCheckedChange={(checked: boolean) => {
                                  if (checked) {
                                    setSelectedAssignees([...selectedAssignees, assignee.login]);
                                  } else {
                                    setSelectedAssignees(
                                      selectedAssignees.filter((a) => a !== assignee.login),
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor={`assignee-${assignee.login}`}
                                className="text-sm flex items-center gap-2 cursor-pointer"
                              >
                                <img
                                  src={assignee.avatarUrl}
                                  alt={assignee.login}
                                  className="w-5 h-5 rounded-full"
                                />
                                {assignee.login}
                              </label>
                            </div>
                          ))}
                        </div>
                        {selectedAssignees.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Selected: {selectedAssignees.join(', ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No assignees found in this repository
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Automatic Sync Toggle - Only show for existing integrations */}
              {isEditing && (
                <div className="space-y-3 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="enable-sync" className="text-base">
                        Automatic sync
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically create GitHub issues for new reports
                      </p>
                    </div>
                    <Switch
                      id="enable-sync"
                      checked={syncMode === 'automatic'}
                      onCheckedChange={handleSyncModeToggle}
                      disabled={setSyncModeMutation.isPending}
                    />
                  </div>
                  {syncMode === 'automatic' && (
                    <p className="text-xs text-muted-foreground pt-2 border-t">
                      New reports will be automatically synced to GitHub. Changes to GitHub issues
                      (closed/reopened) will update report status in BugPin.
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </>
                ) : isEditing ? (
                  'Update'
                ) : (
                  'Create'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <GitHubTokenHelpDialog open={showTokenHelp} onClose={() => setShowTokenHelp(false)} />

      {integration && (
        <SyncExistingReportsDialog
          open={showSyncDialog}
          onClose={() => setShowSyncDialog(false)}
          onConfirm={handleSyncDialogConfirm}
          integrationId={integration.id}
          unsyncedCount={pendingUnsyncedCount}
        />
      )}

      {/* Application URL Configuration Dialog */}
      <AlertDialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Application URL Required</AlertDialogTitle>
            <AlertDialogDescription>
              To enable automatic sync, you need to configure your Application URL in system
              settings. This URL is used to register a webhook with GitHub so BugPin can receive
              notifications when issues are closed or reopened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfigDialog(false);
                window.location.href = '/admin/settings';
              }}
            >
              Go to Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
