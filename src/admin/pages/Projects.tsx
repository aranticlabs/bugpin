import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Settings,
  Plug,
  Power,
  ChevronDown,
  GripVertical,
  AlertTriangle,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Spinner } from '../components/ui/spinner';
import { generateApiKeyPdf } from '../lib/generate-api-key-pdf';
import { useBranding } from '../contexts/BrandingContext';
import { ProjectSettingsDialog } from '../components/project/ProjectSettingsDialog';
import { ProjectIntegrationsDialog } from '../components/project/ProjectIntegrationsDialog';
import type { ProjectSettings } from '@shared/types';

interface Project {
  id: string;
  name: string;
  apiKey: string; // This is now just the prefix (e.g., "proj_a1b2c3d4")
  reportsCount: number;
  isActive: boolean;
  position: number;
  settings?: ProjectSettings;
}

interface NewApiKeyData {
  apiKey: string; // Full API key, only available once on create/regenerate
  projectName: string;
}

const EXPANDED_PROJECTS_KEY = 'bugpin-expanded-projects';

function getExpandedProjects(): Set<string> {
  try {
    const stored = localStorage.getItem(EXPANDED_PROJECTS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpandedProjects(ids: Set<string>): void {
  localStorage.setItem(EXPANDED_PROJECTS_KEY, JSON.stringify([...ids]));
}

export function Projects() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [regenerateProject, setRegenerateProject] = useState<Project | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [integrationsProject, setIntegrationsProject] = useState<Project | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => getExpandedProjects());
  const [newApiKeyData, setNewApiKeyData] = useState<NewApiKeyData | null>(null);

  const toggleExpanded = (projectId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      saveExpandedProjects(next);
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data.projects as Project[];
    },
    staleTime: 0, // Always refetch when navigating to this page
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await api.post('/projects', data);
      return response.data as { project: Project; apiKey: string; showApiKeyOnce: boolean };
    },
    onSuccess: (data) => {
      // Auto-expand the newly created project
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(data.project.id);
        saveExpandedProjects(next);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      // Show the API key modal - this is the only time the full key is available
      if (data.showApiKeyOnce && data.apiKey) {
        setNewApiKeyData({ apiKey: data.apiKey, projectName: data.project.name });
      }
      toast.success('Project created successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to create project');
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async (project: Project) => {
      const response = await api.post(`/projects/${project.id}/regenerate-key`);
      return { ...response.data, projectName: project.name } as {
        apiKey: string;
        showApiKeyOnce: boolean;
        projectName: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setRegenerateProject(null);
      // Show the API key modal - this is the only time the full key is available
      if (data.showApiKeyOnce && data.apiKey) {
        setNewApiKeyData({ apiKey: data.apiKey, projectName: data.projectName });
      }
      toast.success('API key regenerated successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to regenerate API key');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeleteProject(null);
      toast.success('Project deleted successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to delete project');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ projectId, isActive }: { projectId: string; isActive: boolean }) => {
      const response = await api.patch(`/projects/${projectId}`, { isActive });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(variables.isActive ? 'Project activated' : 'Project paused');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update project');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (projectIds: string[]) => {
      const response = await api.put('/projects/reorder', { projectIds });
      return response.data;
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to reorder projects');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && data) {
      const oldIndex = data.findIndex((p) => p.id === active.id);
      const newIndex = data.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(data, oldIndex, newIndex);

      // Optimistically update the cache
      queryClient.setQueryData(['projects'], newOrder);

      // Send the reorder request
      reorderMutation.mutate(newOrder.map((p) => p.id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">Manage your projects and API keys</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>Create Project</Button>
      </div>

      {/* Projects list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner className="text-primary" />
          </div>
        ) : data?.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No projects yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={data?.map((p) => p.id) ?? []}
              strategy={verticalListSortingStrategy}
            >
              {data?.map((project) => (
                <SortableProjectCard
                  key={project.id}
                  project={project}
                  isExpanded={expandedIds.has(project.id)}
                  onToggleExpanded={() => toggleExpanded(project.id)}
                  onConfigureSettings={() => setSettingsProject(project)}
                  onConfigureIntegrations={() => setIntegrationsProject(project)}
                  onRegenerateKey={() => setRegenerateProject(project)}
                  onDelete={() => setDeleteProject(project)}
                  onToggleActive={() =>
                    toggleActiveMutation.mutate({
                      projectId: project.id,
                      isActive: !project.isActive,
                    })
                  }
                  isToggling={toggleActiveMutation.isPending}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Create Modal */}
      <CreateProjectModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreate={(name) => createMutation.mutate({ name })}
        isLoading={createMutation.isPending}
      />

      {/* Regenerate Key Confirmation */}
      <AlertDialog open={!!regenerateProject} onOpenChange={() => setRegenerateProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to regenerate the API key for "{regenerateProject?.name}"? This
              will invalidate the current key and any widgets using it will stop working until
              updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => regenerateProject && regenerateKeyMutation.mutate(regenerateProject)}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteProject}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProject(null);
            setDeleteConfirmation('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteProject?.name}"? This action cannot be undone
              and all associated reports will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="delete-confirmation" className="text-sm text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> to
              confirm
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder="DELETE"
              className="mt-2"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteConfirmation !== 'DELETE'}
              onClick={() => deleteProject && deleteMutation.mutate(deleteProject.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Project Settings Dialog */}
      {settingsProject && (
        <ProjectSettingsDialog
          project={settingsProject}
          open={!!settingsProject}
          onOpenChange={() => setSettingsProject(null)}
        />
      )}

      {/* Project Integrations Dialog */}
      {integrationsProject && (
        <ProjectIntegrationsDialog
          project={integrationsProject}
          open={!!integrationsProject}
          onOpenChange={() => setIntegrationsProject(null)}
        />
      )}

      {/* Save API Key Modal - shown once on create/regenerate */}
      {newApiKeyData && (
        <SaveApiKeyModal
          apiKey={newApiKeyData.apiKey}
          projectName={newApiKeyData.projectName}
          open={!!newApiKeyData}
          onOpenChange={() => setNewApiKeyData(null)}
        />
      )}
    </div>
  );
}

function SortableProjectCard({
  project,
  isExpanded,
  onToggleExpanded,
  onConfigureSettings,
  onConfigureIntegrations,
  onRegenerateKey,
  onDelete,
  onToggleActive,
  isToggling,
}: {
  project: Project;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onConfigureSettings: () => void;
  onConfigureIntegrations: () => void;
  onRegenerateKey: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  isToggling: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.8 : 1,
  };

  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // The apiKey field now contains only the prefix (e.g., "proj_a1b2c3d4")
  // The full key is only available once when creating/regenerating
  const widgetSnippet = `<!-- Start of BugPin Widget -->
<script src="${window.location.origin}/widget.js" data-api-key="YOUR_API_KEY"></script>
<!-- End of BugPin Widget -->`;

  const copyWidgetSnippet = () => {
    navigator.clipboard.writeText(widgetSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={!project.isActive ? 'opacity-60' : undefined}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
              onClick={onToggleExpanded}
            >
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${
                  isExpanded ? 'rotate-0' : '-rotate-90'
                }`}
              />
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{project.name}</CardTitle>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      project.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}
                  >
                    {project.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                {project.reportsCount > 0 ? (
                  <Link
                    to={`/reports?projectId=${project.id}`}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {project.reportsCount} reports
                  </Link>
                ) : (
                  <CardDescription>0 reports</CardDescription>
                )}
              </div>
            </button>
          </div>
          <div className="flex gap-2">
            <Button
              variant={project.isActive ? 'outline' : 'default'}
              size="sm"
              onClick={onToggleActive}
              disabled={isToggling}
              title={project.isActive ? 'Pause project' : 'Activate project'}
            >
              {isToggling ? (
                <Spinner size="sm" className="mr-1" />
              ) : (
                <Power className="h-4 w-4 mr-1" />
              )}
              {project.isActive ? 'Pause' : 'Activate'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onConfigureSettings}
              title="Project Settings"
            >
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onConfigureIntegrations}
              title="Integrations"
            >
              <Plug className="h-4 w-4 mr-1" />
              Integrations
            </Button>
            <Button variant="outline" size="sm" onClick={onRegenerateKey}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Regenerate Key
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="space-y-4">
            {/* API Key Prefix */}
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm font-mono text-muted-foreground">
                  {project.apiKey}...
                </code>
              </div>
              <p className="text-xs text-muted-foreground">
                For security, the full API key is only shown once when created. Use "Regenerate Key"
                if you need a new one.
              </p>
            </div>

            {/* Widget Snippet */}
            <div className="space-y-2">
              <Label>Widget Snippet</Label>
              <div className="flex items-center gap-2">
                <pre className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm font-mono overflow-x-auto">
                  {widgetSnippet}
                </pre>
                <Button variant="outline" size="sm" onClick={copyWidgetSnippet}>
                  {copiedSnippet ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Replace YOUR_API_KEY with the API key you saved when creating this project.
              </p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
});

type CreateProjectFormData = z.infer<typeof createProjectSchema>;

function CreateProjectModal({
  open,
  onOpenChange,
  onCreate,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isLoading: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProjectFormData>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '' },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      reset({ name: '' });
    }
  }, [open, reset]);

  const onSubmit = (data: CreateProjectFormData) => {
    onCreate(data.name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project to get an API key for the widget.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                placeholder="My Website"
                autoFocus
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
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

function SaveApiKeyModal({
  apiKey,
  projectName,
  open,
  onOpenChange,
}: {
  apiKey: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const { config: branding } = useBranding();

  const widgetSnippet = `<!-- Start of BugPin Widget -->
<script src="${window.location.origin}/widget.js" data-api-key="${apiKey}"></script>
<!-- End of BugPin Widget -->`;

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await generateApiKeyPdf({
        projectName,
        apiKey,
        serverUrl: window.location.origin,
        branding: branding
          ? {
              primaryColor: branding.primaryColor,
              logoLightUrl: branding.logoLightUrl,
              logoDarkUrl: branding.logoDarkUrl,
              iconLightUrl: branding.iconLightUrl,
              iconDarkUrl: branding.iconDarkUrl,
            }
          : undefined,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const copyWidgetSnippet = () => {
    navigator.clipboard.writeText(widgetSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Save Your API Key</DialogTitle>
          </div>
          <DialogDescription>
            This is the only time you'll see this API key. Please save it securely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              API Key for "{projectName}"
            </p>
            <code className="block px-3 py-2 bg-background rounded text-sm font-mono break-all">
              {apiKey}
            </code>
            <Button variant="outline" size="sm" className="w-full" onClick={copyApiKey}>
              {copiedKey ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy API Key
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Widget Snippet</Label>
            <pre className="px-3 py-2 bg-muted rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
              {widgetSnippet}
            </pre>
            <Button variant="outline" size="sm" className="w-full" onClick={copyWidgetSnippet}>
              {copiedSnippet ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Widget Snippet
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Add this snippet to your website's HTML to enable bug reporting.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Settings className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Advanced Integration</p>
                <p className="text-sm text-muted-foreground">
                  Need more control? Use the Widget API for custom triggers, callbacks, and
                  programmatic control.
                </p>
                <a
                  href="https://docs.bugpin.io/widget/installation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-1"
                >
                  View documentation
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="w-full sm:w-auto"
          >
            {isGeneratingPdf ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isGeneratingPdf ? 'Generating...' : 'Download API Key'}
          </Button>
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            I have saved my API key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
