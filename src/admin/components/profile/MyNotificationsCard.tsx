import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Spinner } from '../ui/spinner';
import { NotificationSettingsForm } from '../NotificationSettingsForm';
import type {
  AppSettings,
  NotificationDefaultSettings,
  NotificationPreferences,
  ProjectSummary,
} from '@shared/types';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { useConfirmUnsavedChanges } from '../../hooks/useConfirmUnsavedChanges';

function toForm(source: NotificationDefaultSettings): Partial<NotificationDefaultSettings> {
  return {
    emailEnabled: source.emailEnabled,
    notifyOnNewReport: source.notifyOnNewReport,
    notifyOnStatusChange: source.notifyOnStatusChange,
    notifyOnPriorityChange: source.notifyOnPriorityChange,
    notifyOnAssignment: source.notifyOnAssignment,
    notifyOnDeletion: source.notifyOnDeletion,
  };
}

export function MyNotificationsCard() {
  const queryClient = useQueryClient();
  const [perProject, setPerProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [formData, setFormData] = useState<Partial<NotificationDefaultSettings>>({
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
    notifyOnDeletion: true,
  });

  // Fetch global settings (for first-time defaults)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  // Fetch all user preferences
  const { data: allPreferences, isLoading: isLoadingPrefs } = useQuery({
    queryKey: ['notification-preferences', 'me'],
    queryFn: async () => {
      const response = await api.get('/notification-preferences/me');
      return response.data.preferences as NotificationPreferences[];
    },
  });

  // Fetch projects for per-project mode
  const { data: projectsData } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () => {
      const response = await api.get('/projects/summaries');
      return response.data.projects as ProjectSummary[];
    },
  });

  // Fetch per-project preferences when a project is selected
  const { data: projectPreferences, isLoading: isLoadingProjectPrefs } = useQuery({
    queryKey: ['notification-preferences', 'me', 'projects', selectedProjectId],
    queryFn: async () => {
      const response = await api.get(`/notification-preferences/me/projects/${selectedProjectId}`);
      return response.data.preferences as NotificationPreferences;
    },
    enabled: perProject && !!selectedProjectId,
  });

  // The stored values the form starts from: the project's preferences, the user's first stored
  // preference, or the global defaults.
  const savedSource = perProject
    ? projectPreferences
    : allPreferences && allPreferences.length > 0
      ? allPreferences[0]
      : settings?.notifications;
  const savedForm = savedSource ? toForm(savedSource) : null;
  const savedFormKey = savedForm ? JSON.stringify(savedForm) : null;

  useEffect(() => {
    if (savedFormKey) setFormData(JSON.parse(savedFormKey) as Partial<NotificationDefaultSettings>);
  }, [savedFormKey]);

  const isDirty = savedFormKey !== null && JSON.stringify(formData) !== savedFormKey;

  // Bulk update mutation (all projects)
  const bulkMutation = useMutation({
    mutationFn: async (data: Partial<NotificationDefaultSettings>) => {
      const response = await api.patch('/notification-preferences/me/all-projects', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notification preferences saved for all projects');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save preferences');
    },
  });

  // Per-project update mutation
  const projectMutation = useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: Partial<NotificationDefaultSettings>;
    }) => {
      const response = await api.patch(`/notification-preferences/me/projects/${projectId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notification preferences saved');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save preferences');
    },
  });

  const saveFormData = (data: typeof formData) => {
    if (perProject && selectedProjectId) {
      projectMutation.mutate({ projectId: selectedProjectId, data });
    } else if (!perProject) {
      bulkMutation.mutate(data);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveFormData(formData);
  };

  const saveBeforeLeaving = () => {
    if (!perProject) return bulkMutation.mutateAsync(formData);
    if (!selectedProjectId) return Promise.resolve(false);
    return projectMutation.mutateAsync({ projectId: selectedProjectId, data: formData });
  };

  // Switching the mode or the project loads other stored values into the form.
  const formSwitch = useConfirmUnsavedChanges({ isDirty, onSave: saveBeforeLeaving });

  const isLoading = isLoadingPrefs || (perProject && isLoadingProjectPrefs);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Configure your personal notification preferences.
          {!perProject && ' These settings apply to all projects.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Spinner className="text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <UnsavedChangesGuard
              isDirty={isDirty}
              onSave={saveBeforeLeaving}
              onDiscard={() => {
                if (savedFormKey) {
                  setFormData(JSON.parse(savedFormKey) as Partial<NotificationDefaultSettings>);
                }
              }}
            />
            {formSwitch.dialog}
            {/* Per-project toggle */}
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="space-y-0.5">
                <Label htmlFor="per-project-toggle" className="text-sm font-medium">
                  Customize per project
                </Label>
                <p className="text-xs text-muted-foreground">
                  Set different notification preferences for each project
                </p>
              </div>
              <Switch
                id="per-project-toggle"
                checked={perProject}
                onCheckedChange={(checked) =>
                  formSwitch.confirm(() => {
                    setPerProject(checked);
                    if (!checked) {
                      setSelectedProjectId('');
                    }
                  })
                }
              />
            </div>

            {/* Project selector */}
            {perProject && (
              <div className="space-y-2">
                <Label htmlFor="project-select" className="text-sm font-medium">
                  Project
                </Label>
                <Select
                  value={selectedProjectId}
                  onValueChange={(projectId) =>
                    formSwitch.confirm(() => setSelectedProjectId(projectId))
                  }
                >
                  <SelectTrigger id="project-select">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectsData?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Show form when not in per-project mode, or when a project is selected */}
            {(!perProject || selectedProjectId) && (
              <NotificationSettingsForm
                value={formData}
                onChange={(next) => {
                  setFormData(next);
                  // The email switch saves by itself: the form is locked while emails are off.
                  if (next.emailEnabled !== formData.emailEnabled) saveFormData(next);
                }}
              />
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
