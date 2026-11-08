import type { AppSettings } from '@shared/types';
import { NotificationTabs } from '../../NotificationTabs';
import { SectionCard } from '../../settings/SectionCard';
import { CustomSwitch, InheritedBadge, InheritedFields } from './ProjectSettingsControls';
import type { ProjectSettingsForm, UpdateProjectSettingsForm } from './projectSettingsForm';

export function ProjectNotificationsSection({
  form,
  update,
  globalSettings,
}: {
  form: ProjectSettingsForm;
  update: UpdateProjectSettingsForm;
  globalSettings: AppSettings | undefined;
}) {
  const { useCustomNotifications } = form;

  return (
    <NotificationTabs
      team={form.notificationSettings}
      onTeamChange={(next) => update({ notificationSettings: next })}
      reporter={form.reporterSettings}
      onReporterChange={(next) => update({ reporterSettings: next })}
      globalSettings={globalSettings}
      disabled={!useCustomNotifications}
      renderPanel={(panel) => (
        <SectionCard
          section="notifications"
          badge={!useCustomNotifications && <InheritedBadge />}
          action={
            <CustomSwitch
              id="use-custom-notifications"
              label="Use custom notification settings"
              checked={useCustomNotifications}
              onCheckedChange={(checked) =>
                update(
                  checked
                    ? { useCustomNotifications: true }
                    : {
                        useCustomNotifications: false,
                        notificationSettings: {},
                        reporterSettings: {},
                      }
                )
              }
            />
          }
        >
          <InheritedFields
            custom={useCustomNotifications}
            defaultsPath="/settings/project-defaults/notifications"
          >
            {panel}
          </InheritedFields>
        </SectionCard>
      )}
    />
  );
}
