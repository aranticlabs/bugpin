import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { apiErrorMessage } from '../../lib/apiError';
import { useDraft } from '../../hooks/useSettings';
import { SettingsCard } from '../ui/settings-card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Spinner } from '../ui/spinner';
import { NotificationSettingsForm } from '../NotificationSettingsForm';
import type {
  NotificationDefaultSettings,
  NotificationPreferences,
  ProjectSummary,
} from '@shared/types';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { useConfirmUnsavedChanges } from '../../hooks/useConfirmUnsavedChanges';

type NotificationForm = Pick<
  NotificationDefaultSettings,
  | 'emailEnabled'
  | 'notifyOnNewReport'
  | 'notifyOnStatusChange'
  | 'notifyOnPriorityChange'
  | 'notifyOnAssignment'
  | 'notifyOnDeletion'
>;

const FORM_FIELDS: (keyof NotificationForm)[] = [
  'emailEnabled',
  'notifyOnNewReport',
  'notifyOnStatusChange',
  'notifyOnPriorityChange',
  'notifyOnAssignment',
  'notifyOnDeletion',
];

const PREFERENCES_KEY = ['notification-preferences', 'me'] as const;

interface MyPreferences {
  preferences: NotificationPreferences[];
  defaults: NotificationDefaultSettings;
}

function projectPreferencesKey(projectId: string) {
  return [...PREFERENCES_KEY, 'projects', projectId] as const;
}

/** A field is on only when every source has it on. */
function combine(sources: NotificationForm[]): NotificationForm | undefined {
  if (sources.length === 0) return undefined;
  const form = {} as NotificationForm;
  for (const field of FORM_FIELDS) {
    form[field] = sources.every((source) => source[field]);
  }
  return form;
}

export function MyNotificationsCard() {
  const queryClient = useQueryClient();
  const [perProject, setPerProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const { data: myPreferences, isLoading: isLoadingPrefs } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: async (): Promise<MyPreferences> => {
      const response = await api.get('/notification-preferences/me');
      return { preferences: response.data.preferences, defaults: response.data.defaults };
    },
  });
  const allPreferences = myPreferences?.preferences;

  const { data: projectsData } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () => {
      const response = await api.get('/projects/summaries');
      return response.data.projects as ProjectSummary[];
    },
  });

  const { data: projectPreferences, isLoading: isLoadingProjectPrefs } = useQuery({
    queryKey: projectPreferencesKey(selectedProjectId),
    queryFn: async () => {
      const response = await api.get(`/notification-preferences/me/projects/${selectedProjectId}`);
      return response.data.preferences as NotificationPreferences;
    },
    enabled: perProject && !!selectedProjectId,
  });

  const allProjectsForm = (() => {
    if (!allPreferences) return undefined;
    const storedIds = new Set(allPreferences.map((preferences) => preferences.projectId));
    const usesDefaults =
      allPreferences.length === 0 ||
      (projectsData ?? []).some((project) => !storedIds.has(project.id));
    const sources: NotificationForm[] = [...allPreferences];
    // The global defaults apply to every project without stored preferences.
    if (usesDefaults) sources.push(myPreferences.defaults);
    return combine(sources);
  })();

  const saved = perProject ? projectPreferences && combine([projectPreferences]) : allProjectsForm;
  const draft = useDraft<NotificationForm>(saved);

  const bulkMutation = useMutation({
    mutationFn: async (data: Partial<NotificationForm>) => {
      const response = await api.patch('/notification-preferences/me/all-projects', data);
      return response.data.preferences as NotificationPreferences[] | undefined;
    },
    onSuccess: (preferences) => {
      if (preferences) {
        queryClient.setQueryData<MyPreferences>(
          PREFERENCES_KEY,
          (current) => current && { ...current, preferences }
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notification preferences saved for all projects');
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to save preferences'));
    },
  });

  const projectMutation = useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: Partial<NotificationForm>;
    }) => {
      const response = await api.patch(`/notification-preferences/me/projects/${projectId}`, data);
      return response.data.preferences as NotificationPreferences | undefined;
    },
    onSuccess: (preferences, { projectId }) => {
      if (preferences) queryClient.setQueryData(projectPreferencesKey(projectId), preferences);
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Notification preferences saved');
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Failed to save preferences'));
    },
  });

  const save = async (data: Partial<NotificationForm>): Promise<boolean> => {
    if (Object.keys(data).length === 0) return true;
    if (!perProject) {
      await bulkMutation.mutateAsync(data);
      return true;
    }
    if (!selectedProjectId) return false;
    await projectMutation.mutateAsync({ projectId: selectedProjectId, data });
    return true;
  };

  const saveChanges = async () => {
    const done = await save(draft.changes);
    if (done) draft.reset();
    return done;
  };

  // Switching the mode or the project loads other stored values into the form.
  const formSwitch = useConfirmUnsavedChanges({ isDirty: draft.isDirty, onSave: saveChanges });
  const switchForm = (apply: () => void) =>
    formSwitch.confirm(() => {
      apply();
      draft.reset();
    });

  const isLoading = isLoadingPrefs || (perProject && isLoadingProjectPrefs);

  return (
    <SettingsCard
      title="Notification Preferences"
      description={`Configure your personal notification preferences.${perProject ? '' : ' These settings apply to all projects.'}`}
    >
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <Spinner className="text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <UnsavedChangesGuard
            isDirty={draft.isDirty}
            onSave={saveChanges}
            onDiscard={draft.reset}
          />
          {formSwitch.dialog}
          <div className="flex items-center justify-between gap-4 pb-3 border-b">
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
                switchForm(() => {
                  setPerProject(checked);
                  if (!checked) setSelectedProjectId('');
                })
              }
            />
          </div>

          {perProject && (
            <div className="space-y-2">
              <Label htmlFor="project-select" className="text-sm font-medium">
                Project
              </Label>
              <Select
                value={selectedProjectId}
                onValueChange={(projectId) => switchForm(() => setSelectedProjectId(projectId))}
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

          {draft.value && (!perProject || selectedProjectId) && (
            <NotificationSettingsForm
              value={draft.value}
              onChange={(next) => {
                const emailEnabled = next.emailEnabled ?? draft.value?.emailEnabled;
                const emailToggled = emailEnabled !== draft.value?.emailEnabled;
                draft.patch(next);
                // The email switch saves by itself: the form is locked while emails are off.
                if (emailToggled && emailEnabled !== undefined) {
                  save({ emailEnabled }).catch(() => undefined);
                }
              }}
            />
          )}
        </div>
      )}
    </SettingsCard>
  );
}
