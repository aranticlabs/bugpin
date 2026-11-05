import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { SettingsCard } from '../../components/ui/settings-card';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../../components/ui/select';
import { WebhookEditor } from './WebhookEditor';
import { WebhookCard } from './WebhookCard';
import type { Project, Webhook } from '@shared/types';

const WEBHOOKS_DESCRIPTION = 'Send report events from this project to your services automatically.';

function WebhookSettings({ projectId }: { projectId?: string }) {
  const client = useQueryClient();
  const addRef = useRef<HTMLButtonElement>(null);
  const [selectedProject, setProjectFilter] = useState('all');
  const projectFilter = projectId ?? selectedProject;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const {
    data: webhooks,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => (await api.get('/webhooks')).data.webhooks as Webhook[],
  });
  const {
    data: allProjects,
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/projects')).data.projects as Project[],
  });
  const projects = projectId
    ? allProjects?.filter((project) => project.id === projectId)
    : allProjects;
  const visibleWebhooks =
    webhooks?.filter((webhook) => projectFilter === 'all' || webhook.projectId === projectFilter) ??
    [];
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingWebhook(null);
    setTimeout(() => addRef.current?.focus(), 0);
  };
  const onSaved = (saved: Webhook) => {
    client.setQueryData<Webhook[]>(['webhooks'], (current) =>
      current?.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...(current ?? [])]
    );
    void client.invalidateQueries({ queryKey: ['webhooks'] });
    if (projectFilter !== 'all' && projectFilter !== saved.projectId)
      setProjectFilter(saved.projectId);
    toast.success(editingWebhook ? 'Webhook updated' : 'Webhook created');
    closeEditor();
  };

  return (
    <SettingsCard
      title="Webhooks"
      description={WEBHOOKS_DESCRIPTION}
      action={
        <Button
          ref={addRef}
          disabled={editorOpen || !projects?.length}
          onClick={() => {
            setEditingWebhook(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add webhook
        </Button>
      }
    >
      <div className="space-y-6">
        {projectsError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Unable to load projects. Retry to add a webhook.
            </p>
            <Button variant="outline" onClick={() => void refetchProjects()}>
              Retry projects
            </Button>
          </div>
        ) : !projectsLoading && !projects?.length ? (
          <p className="text-sm text-muted-foreground">Create a project before adding a webhook.</p>
        ) : null}
        {!projectId && !!projects?.length && projects.length > 1 && (
          <div className="max-w-sm space-y-2">
            <Label htmlFor="webhooks-project-filter">Filter by project</Label>
            <Select
              value={projectFilter}
              onValueChange={(value) => {
                if (value) setProjectFilter(value);
              }}
              disabled={editorOpen}
            >
              <SelectTrigger id="webhooks-project-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {editorOpen && (
          <WebhookEditor
            key={editingWebhook?.id ?? 'new'}
            projects={projects ?? []}
            webhook={editingWebhook}
            initialProjectId={projectFilter === 'all' ? (projects?.[0]?.id ?? '') : projectFilter}
            onSaved={onSaved}
            onCancel={closeEditor}
          />
        )}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Unable to load webhooks. Retry to see your endpoints.
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Retry webhooks
            </Button>
          </div>
        ) : !visibleWebhooks.length ? (
          <div className="space-y-1 py-4 text-center">
            <p className="text-sm font-medium">
              {webhooks?.length ? 'No webhooks for this project' : 'No webhooks yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              Add an endpoint to receive report events from BugPin.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleWebhooks.map((webhook) => (
              <WebhookCard
                key={webhook.id}
                webhook={webhook}
                projectName={
                  projects?.find((project) => project.id === webhook.projectId)?.name ??
                  webhook.projectId
                }
                editorOpen={editorOpen}
                editingThis={editorOpen && editingWebhook?.id === webhook.id}
                onEdit={() => {
                  setEditingWebhook(webhook);
                  setEditorOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

export function Webhooks({ projectId }: { projectId?: string } = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });
  if (isLoading || error) {
    return (
      <SettingsCard title="Webhooks" description={WEBHOOKS_DESCRIPTION}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Unable to load webhook features.
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}
      </SettingsCard>
    );
  }
  if (!data?.features.webhooks)
    return (
      <UpgradePrompt
        feature="webhooks"
        title="Webhooks"
        description="Send report events to your services automatically. Configure endpoints, choose event subscriptions, and monitor delivery status."
      />
    );
  return <WebhookSettings projectId={projectId} />;
}
