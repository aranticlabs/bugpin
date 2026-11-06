import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { NotificationTabs } from '../../components/NotificationTabs';
import {
  SectionCard,
  SectionLoading,
  SettingsFormActions,
} from '../../components/settings/SectionCard';
import type {
  AppSettings,
  NotificationDefaultSettings,
  ReporterNotificationSettings,
} from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

interface NotificationForm {
  notifications: Partial<NotificationDefaultSettings>;
  reporterNotifications: Partial<ReporterNotificationSettings>;
}

const toForm = (settings: AppSettings): NotificationForm => ({
  notifications: settings.notifications ?? {},
  reporterNotifications: settings.reporterNotifications ?? {},
});

export function NotificationDefaults() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<NotificationForm | null>(null);
  const [tab, setTab] = useState<'team' | 'reporter'>('team');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  useEffect(() => {
    if (settings) setFormData(toForm(settings));
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: NotificationForm) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Notification defaults saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  if (isLoading || !settings || !formData) {
    return (
      <SectionCard section="notifications" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  const emailOn = (form: NotificationForm, which: 'team' | 'reporter') =>
    which === 'team'
      ? (form.notifications.emailEnabled ?? true)
      : (form.reporterNotifications.emailEnabled ?? true);
  // The email switches save by themselves: the tab is locked while its emails are off.
  const applyChange = (next: NotificationForm, which: 'team' | 'reporter') => {
    const before = emailOn(formData, which);
    setFormData(next);
    if (before !== emailOn(next, which)) {
      mutation.mutate(
        which === 'team'
          ? { ...toForm(settings), notifications: next.notifications }
          : { ...toForm(settings), reporterNotifications: next.reporterNotifications }
      );
    }
  };

  const isDirty = JSON.stringify(formData) !== JSON.stringify(toForm(settings));

  return (
    <SectionCard section="notifications" showHeader={false}>
      <UnsavedChangesGuard isDirty={isDirty} onSave={() => mutation.mutateAsync(formData)} />
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(formData);
        }}
      >
        <NotificationTabs
          team={formData.notifications}
          onTeamChange={(notifications) => applyChange({ ...formData, notifications }, 'team')}
          onTabChange={setTab}
          reporter={formData.reporterNotifications}
          onReporterChange={(reporterNotifications) =>
            applyChange({ ...formData, reporterNotifications }, 'reporter')
          }
        />
        <SettingsFormActions
          isPending={mutation.isPending}
          isDirty={isDirty}
          locked={!emailOn(formData, tab)}
        />
      </form>
    </SectionCard>
  );
}
