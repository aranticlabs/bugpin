import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Integration, IntegrationType, JiraIntegrationConfig, JiraDeployment } from '@shared/types';
import {
  useCreateIntegration,
  useUpdateIntegration,
  useTestIntegration,
  useFetchJiraProjects,
  useFetchJiraIssueTypes,
  JiraProject,
  JiraIssueType,
} from '../hooks/useIntegrations';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RefreshCw, HelpCircle, CheckCircle } from 'lucide-react';
import { Spinner } from './ui/spinner';
import { toast } from 'sonner';

interface JiraIntegrationDialogProps {
  open: boolean;
  onClose: () => void;
  integration?: Integration; // For editing
  projectId: string;
}

// Form schema - apiToken is conditionally required based on isEditing; email is
// only required for Cloud (Server/DC authenticates with a bearer PAT only).
const createFormSchema = (isEditing: boolean) =>
  z
    .object({
      name: z.string().min(1, 'Integration name is required'),
      deployment: z.enum(['cloud', 'server']),
      domain: z.string().min(1, 'Jira domain is required'),
      email: z.string().optional(),
      apiToken: isEditing ? z.string().optional() : z.string().min(1, 'Token is required'),
      projectKey: z.string().min(1, 'Project is required'),
      issueType: z.string().min(1, 'Issue type is required'),
    })
    .superRefine((data, ctx) => {
      if (data.deployment === 'cloud') {
        if (!data.email || !data.email.trim()) {
          ctx.addIssue({
            path: ['email'],
            code: z.ZodIssueCode.custom,
            message: 'Email is required',
          });
        } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
          ctx.addIssue({
            path: ['email'],
            code: z.ZodIssueCode.custom,
            message: 'Must be a valid email',
          });
        }
      }
    });

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

export function JiraIntegrationDialog({
  open,
  onClose,
  integration,
  projectId,
}: JiraIntegrationDialogProps) {
  const isEditing = !!integration;
  const createMutation = useCreateIntegration();
  const updateMutation = useUpdateIntegration();
  const testMutation = useTestIntegration();
  const fetchProjectsMutation = useFetchJiraProjects();
  const fetchIssueTypesMutation = useFetchJiraIssueTypes();

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
      deployment: 'cloud',
      domain: '',
      email: '',
      apiToken: '',
      projectKey: '',
      issueType: '',
    },
  });

  const watchedDeployment = watch('deployment');
  const watchedDomain = watch('domain');
  const watchedEmail = watch('email');
  const watchedToken = watch('apiToken');
  const watchedProjectKey = watch('projectKey');
  const watchedIssueType = watch('issueType');
  const isServer = watchedDeployment === 'server';

  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [labels, setLabels] = useState<string>('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  // Load integration data when editing
  useEffect(() => {
    if (open) {
      if (integration) {
        const config = integration.config as JiraIntegrationConfig;
        reset({
          name: integration.name,
          deployment: config.deployment || 'cloud',
          domain: config.domain || '',
          email: config.email || '',
          apiToken: '', // Don't prefill masked token
          projectKey: config.projectKey || '',
          issueType: config.issueType || '',
        });
        setLabels((config.labels || []).join(', '));
      } else {
        reset({
          name: '',
          deployment: 'cloud',
          domain: '',
          email: '',
          apiToken: '',
          projectKey: '',
          issueType: '',
        });
        setLabels('');
      }
      setProjects([]);
      setIssueTypes([]);
      setShowTokenInput(false);
    }
  }, [integration, open, reset]);

  const handleDeploymentChange = (value: string) => {
    setValue('deployment', value as JiraDeployment, { shouldValidate: true });
    // Project/issue type lists are instance-specific — clear them on switch.
    setProjects([]);
    setIssueTypes([]);
    setValue('projectKey', '');
    setValue('issueType', '');
  };

  const handleFetchProjects = async () => {
    if (!watchedDomain?.trim()) {
      toast.error('Please enter your Jira domain first');
      return;
    }
    if (!isServer && !watchedEmail?.trim()) {
      toast.error('Please enter your account email first');
      return;
    }
    if (!isEditing && !watchedToken?.trim()) {
      toast.error('Please enter a token first');
      return;
    }

    try {
      const result = await fetchProjectsMutation.mutateAsync({
        deployment: watchedDeployment,
        domain: watchedDomain,
        email: watchedEmail || undefined,
        apiToken: watchedToken || undefined,
        integrationId: integration?.id,
      });
      setProjects(result);
      if (result.length === 0) {
        toast.error(
          'No projects found. Make sure your account has access to at least one project.'
        );
      }
    } catch {
      // Error is handled by the mutation's onError
    }
  };

  const handleProjectSelect = async (projectKey: string) => {
    setValue('projectKey', projectKey, { shouldValidate: true });
    setValue('issueType', '');
    setIssueTypes([]);

    try {
      const result = await fetchIssueTypesMutation.mutateAsync({
        deployment: watchedDeployment,
        domain: watchedDomain,
        email: watchedEmail || undefined,
        apiToken: watchedToken || undefined,
        projectKey,
        integrationId: integration?.id,
      });
      setIssueTypes(result);
    } catch {
      toast.error('Unable to load issue types for this project');
    }
  };

  const handleTest = async () => {
    if (isEditing && integration) {
      await testMutation.mutateAsync(integration.id);
    } else {
      toast.error('Save the integration first to test the connection');
    }
  };

  const onSubmit = async (data: FormData) => {
    const existingConfig = integration?.config as JiraIntegrationConfig | undefined;
    const parsedLabels = labels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const config: JiraIntegrationConfig = {
      deployment: data.deployment,
      domain: data.domain.trim(),
      email: data.deployment === 'cloud' ? data.email?.trim() : undefined,
      apiToken: data.apiToken?.trim() || existingConfig?.apiToken || '',
      projectKey: data.projectKey.trim(),
      issueType: data.issueType.trim(),
      labels: parsedLabels.length > 0 ? parsedLabels : undefined,
      customFields: existingConfig?.customFields,
    };

    try {
      if (isEditing && integration) {
        await updateMutation.mutateAsync({
          id: integration.id,
          data: { name: data.name.trim(), config },
        });
      } else {
        await createMutation.mutateAsync({
          projectId,
          type: 'jira' as IntegrationType,
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
  const canFetchProjects =
    !!watchedDomain?.trim() &&
    (isServer || !!watchedEmail?.trim()) &&
    (isEditing || !!watchedToken?.trim());

  const tokenLabel = isServer ? 'Personal Access Token' : 'API Token';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh]">
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Jira Integration' : 'Add Jira Integration'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update Jira integration settings'
                : 'Create issues in Jira from bug reports'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3 flex-1">
            <div className="space-y-2">
              <Label htmlFor="name">
                Integration Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Engineering Board"
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Deployment Type */}
            <div className="space-y-2">
              <Label>
                Jira Type <span className="text-destructive">*</span>
              </Label>
              <Select value={watchedDeployment} onValueChange={handleDeploymentChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud">Cloud (atlassian.net)</SelectItem>
                  <SelectItem value="server">Server / Data Center (self-hosted)</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" {...register('deployment')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain">
                Jira {isServer ? 'Base URL' : 'Domain'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="domain"
                placeholder={
                  isServer ? 'https://jira.your-company.com' : 'your-company.atlassian.net'
                }
                {...register('domain')}
                aria-invalid={!!errors.domain}
              />
              {isServer && (
                <p className="text-xs text-muted-foreground">
                  Include the scheme (and context path if any), e.g.{' '}
                  <code className="px-1 py-0.5 bg-muted rounded">https://jira.acme.com</code>.
                </p>
              )}
              {errors.domain && <p className="text-xs text-destructive">{errors.domain.message}</p>}
            </div>

            {/* Email — Cloud only (Basic auth) */}
            {!isServer && (
              <div className="space-y-2">
                <Label htmlFor="email">
                  Account Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  {...register('email')}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="token">
                {tokenLabel} {!isEditing && <span className="text-destructive">*</span>}
              </Label>

              {isEditing && !showTokenInput ? (
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
                <div className="flex gap-2">
                  <Input
                    id="token"
                    type="password"
                    placeholder={isServer ? 'Personal access token' : 'Atlassian API token'}
                    {...register('apiToken')}
                    aria-invalid={!!errors.apiToken}
                    className="flex-1"
                  />
                  {isEditing && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowTokenInput(false);
                        setValue('apiToken', '');
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
              {errors.apiToken && (
                <p className="text-xs text-destructive">{errors.apiToken.message}</p>
              )}

              <p className="text-sm text-muted-foreground">
                <a
                  href={
                    isServer
                      ? 'https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html'
                      : 'https://id.atlassian.com/manage-profile/security/api-tokens'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  {isServer
                    ? 'How to create a personal access token'
                    : 'How to create a Jira API token'}
                </a>
              </p>
            </div>

            {/* Project Selection */}
            <div className="space-y-2">
              <Label>
                Project <span className="text-destructive">*</span>
              </Label>

              <div className="flex gap-2">
                {projects.length > 0 ? (
                  <Select value={watchedProjectKey} onValueChange={handleProjectSelect}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.key} value={project.key}>
                          {project.name} ({project.key})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : watchedProjectKey ? (
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-muted rounded-md border">
                    <span className="font-medium">{watchedProjectKey}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Click <RefreshCw className="h-3 w-3 inline" /> to change project
                    </span>
                  </div>
                ) : (
                  <div className="flex-1 px-3 py-2 bg-muted/50 rounded-md border border-dashed text-muted-foreground text-sm">
                    Enter your credentials and click <RefreshCw className="h-3 w-3 inline mx-1" />{' '}
                    to load projects
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFetchProjects}
                  disabled={fetchProjectsMutation.isPending || !canFetchProjects}
                  title="Load projects"
                >
                  {fetchProjectsMutation.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {errors.projectKey && (
                <p className="text-xs text-destructive">{errors.projectKey.message}</p>
              )}
              <input type="hidden" {...register('projectKey')} />
            </div>

            {/* Issue Type Selection */}
            <div className="space-y-2">
              <Label>
                Issue Type <span className="text-destructive">*</span>
              </Label>
              {fetchIssueTypesMutation.isPending ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Spinner size="xs" />
                  Loading issue types...
                </p>
              ) : issueTypes.length > 0 ? (
                <Select
                  value={watchedIssueType}
                  onValueChange={(value) => setValue('issueType', value, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an issue type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {issueTypes.map((type) => (
                      <SelectItem key={type.id} value={type.name}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : watchedIssueType ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border">
                  <span className="font-medium">{watchedIssueType}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Reselect the project to change issue type
                  </span>
                </div>
              ) : (
                <div className="px-3 py-2 bg-muted/50 rounded-md border border-dashed text-muted-foreground text-sm">
                  Select a project to load issue types
                </div>
              )}
              {errors.issueType && (
                <p className="text-xs text-destructive">{errors.issueType.message}</p>
              )}
              <input type="hidden" {...register('issueType')} />
            </div>

            {/* Labels */}
            <div className="space-y-2">
              <Label htmlFor="labels">Labels</Label>
              <Input
                id="labels"
                placeholder="bug, customer-report (comma-separated)"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Added to every created issue. Spaces are replaced with dashes.
              </p>
            </div>
          </DialogBody>

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
  );
}
