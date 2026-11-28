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
        onTeamChange={(next) => team.patch(changedFields(next, teamValue))}
        reporter={reporterValue}
        onReporterChange={(next) => reporter.patch(changedFields(next, reporterValue))}
        renderPanel={(form) => (
          <SectionCard section="notifications" showHeader={false}>
            {form}
          </SectionCard>
        )}
      />
    </>
  );
}
