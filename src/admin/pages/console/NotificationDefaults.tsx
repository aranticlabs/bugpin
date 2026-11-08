import { NotificationTabs } from '../../components/NotificationTabs';
import { SectionCard, SectionLoading } from '../../components/settings/SectionCard';
import type { NotificationDefaultSettings, ReporterNotificationSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import {
  useDraft,
  useSettings,
  useUpdateSettings,
  type SettingsUpdate,
} from '../../hooks/useSettings';
import { changedFields } from '../../lib/changedFields';

export function NotificationDefaults() {
  const { data: settings, isLoading } = useSettings();
  const team = useDraft<Partial<NotificationDefaultSettings>>(
    settings && (settings.notifications ?? {})
  );
  const reporter = useDraft<Partial<ReporterNotificationSettings>>(
    settings && (settings.reporterNotifications ?? {})
  );
  const mutation = useUpdateSettings({
    successMessage: 'Notification defaults saved successfully',
  });

  if (isLoading || !team.value || !reporter.value) {
    return (
      <SectionCard section="notifications" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  const teamValue = team.value;
  const reporterValue = reporter.value;

  const save = async () => {
    const update: SettingsUpdate = {
      ...(team.isDirty && { notifications: team.changes }),
      ...(reporter.isDirty && { reporterNotifications: reporter.changes }),
    };
    try {
      await mutation.mutateAsync(update);
      team.reset();
      reporter.reset();
      return true;
    } catch {
      return false;
    }
  };

  // The email switches save by themselves: the tab is locked while its emails are off. Only the
  // switch is sent, so unsaved edits on either tab stay in their drafts.
  const handleTeamChange = (next: Partial<NotificationDefaultSettings>) => {
    const changes = changedFields(next, teamValue);
    team.patch(changes);
    if (changes.emailEnabled !== undefined && next.emailEnabled !== undefined) {
      mutation.mutate({ notifications: { emailEnabled: next.emailEnabled } });
    }
  };
  const handleReporterChange = (next: Partial<ReporterNotificationSettings>) => {
    const changes = changedFields(next, reporterValue);
    reporter.patch(changes);
    if (changes.emailEnabled !== undefined && next.emailEnabled !== undefined) {
      mutation.mutate({ reporterNotifications: { emailEnabled: next.emailEnabled } });
    }
  };

  return (
    <>
      <UnsavedChangesGuard
        isDirty={team.isDirty || reporter.isDirty}
        onSave={save}
        onDiscard={() => {
          team.reset();
          reporter.reset();
        }}
      />
      <NotificationTabs
        team={teamValue}
        onTeamChange={handleTeamChange}
        reporter={reporterValue}
        onReporterChange={handleReporterChange}
        renderPanel={(form) => (
          <SectionCard section="notifications" showHeader={false}>
            {form}
          </SectionCard>
        )}
      />
    </>
  );
}
