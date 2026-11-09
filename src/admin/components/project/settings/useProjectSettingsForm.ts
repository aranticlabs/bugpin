import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../../api/client';
import { brandingApi } from '../../../api/branding';
import { useSettings } from '../../../hooks/useSettings';
import { apiErrorMessage } from '../../../lib/apiError';
import type { Project, ProjectNotificationDefaults, ProjectSettingsUpdate } from '@shared/types';
import { dialogContentErrors } from '../../WidgetDialogContentForm';
import {
  buildProjectSettingsUpdate,
  formToNotificationDefaults,
  hasDefinedValue,
  mergeLoadedForm,
  projectSettingsToForm,
  sameForm,
  type ProjectSettingsForm,
} from './projectSettingsForm';

export interface AssignableUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface FormState {
  form: ProjectSettingsForm;
  // The last loaded or saved values; the form is dirty while it differs from them.
  baseline: ProjectSettingsForm;
}

interface LoadedData {
  project?: Project;
  notificationDefaults?: ProjectNotificationDefaults | null;
}

export function useProjectSettingsForm(projectId: string) {
  const queryClient = useQueryClient();

  const { data: projectDetail, isLoading: isLoadingProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${projectId}`);
      return response.data.project as Project;
    },
  });

  const { data: globalSettings, isLoading: isLoadingGlobal } = useSettings();

  const { data: brandingConfig, isLoading: isLoadingBranding } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
    // The branding config is managed globally, so it is never refetched here.
    staleTime: Infinity,
  });

  const { data: notificationDefaults, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ['project-notification-defaults', projectId],
    queryFn: async () => {
      const response = await api.get(`/notification-preferences/projects/${projectId}/defaults`);
      return response.data.defaults as ProjectNotificationDefaults | null;
    },
  });

  const { data: assignableUsers, isLoading: isLoadingAssignableUsers } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const response = await api.get('/users/assignable');
      return response.data.users as AssignableUser[];
    },
  });

  const [state, setState] = useState<FormState>(() => {
    const empty = projectSettingsToForm(undefined, undefined);
    return { form: empty, baseline: empty };
  });
  const [loaded, setLoaded] = useState<LoadedData>({});
  const [showDialogContentErrors, setShowDialogContentErrors] = useState(false);
  const [saveRequested, setSaveRequested] = useState(false);

  // New server data only replaces the fields the user has not edited, so a refetch never wipes
  // unsaved changes.
  if (loaded.project !== projectDetail || loaded.notificationDefaults !== notificationDefaults) {
    setLoaded({ project: projectDetail, notificationDefaults });
    const next = projectSettingsToForm(projectDetail?.settings, notificationDefaults);
    setState((current) => ({
      form: mergeLoadedForm(current.form, current.baseline, next),
      baseline: next,
    }));
  }

  const { form } = state;
  const isDirty = !sameForm(form, state.baseline);

  const update = (changes: Partial<ProjectSettingsForm>) =>
    setState((current) => ({ ...current, form: { ...current.form, ...changes } }));

  const projectMutation = useMutation({
    mutationFn: async (settings: ProjectSettingsUpdate) => {
      const response = await api.patch(`/projects/${projectId}`, { settings });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const notificationMutation = useMutation({
    mutationFn: async (data: Partial<ProjectNotificationDefaults>) => {
      const response = await api.patch(
        `/notification-preferences/projects/${projectId}/defaults`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', projectId] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete(`/notification-preferences/projects/${projectId}/defaults`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', projectId] });
    },
  });

  const save = async (): Promise<boolean> => {
    if (
      form.useCustomDialogContent &&
      hasDefinedValue(form.dialogContentSettings) &&
      Object.keys(dialogContentErrors(form.dialogContentSettings)).length > 0
    ) {
      setShowDialogContentErrors(true);
      toast.error('Custom dialog texts need an English text');
      return false;
    }

    try {
      await projectMutation.mutateAsync(
        buildProjectSettingsUpdate(projectDetail?.settings, form, globalSettings?.diagnostics)
      );
      if (form.useCustomNotifications) {
        await notificationMutation.mutateAsync(formToNotificationDefaults(form));
      } else {
        await deleteNotificationMutation.mutateAsync();
      }
      setState((current) => ({ ...current, baseline: form }));
      toast.success('Settings saved successfully');
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to save settings'));
      return false;
    }
  };

  const discard = () => {
    setState((current) => ({ ...current, form: current.baseline }));
    setShowDialogContentErrors(false);
  };

  // Runs after the render that applied a switched-off Custom switch, so the save sees it.
  useEffect(() => {
    if (!saveRequested) return;
    setSaveRequested(false);
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequested]);

  return {
    isLoading:
      isLoadingProject ||
      isLoadingGlobal ||
      isLoadingNotifications ||
      isLoadingBranding ||
      isLoadingAssignableUsers,
    form,
    update,
    isDirty,
    save,
    discard,
    requestSave: () => setSaveRequested(true),
    showDialogContentErrors,
    hideDialogContentErrors: () => setShowDialogContentErrors(false),
    globalSettings,
    brandingConfig,
    assignableUsers,
    project: projectDetail,
  };
}
