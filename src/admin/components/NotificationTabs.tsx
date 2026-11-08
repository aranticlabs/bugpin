import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { NotificationSettingsForm } from './NotificationSettingsForm';
import { ReporterNotificationSettingsForm } from './ReporterNotificationSettingsForm';
import type { NotificationDefaultSettings, ReporterNotificationSettings } from '@shared/types';

interface NotificationTabsProps {
  team: Partial<NotificationDefaultSettings>;
  onTeamChange: (value: Partial<NotificationDefaultSettings>) => void;
  reporter: Partial<ReporterNotificationSettings>;
  onReporterChange: (value: Partial<ReporterNotificationSettings>) => void;
  globalSettings?: {
    notifications: NotificationDefaultSettings;
    reporterNotifications?: ReporterNotificationSettings;
  };
  disabled?: boolean;
  renderPanel?: (form: ReactNode) => ReactNode;
}

export function NotificationTabs({
  team,
  onTeamChange,
  reporter,
  onReporterChange,
  globalSettings,
  disabled = false,
  renderPanel = (form) => form,
}: NotificationTabsProps) {
  return (
    <Tabs defaultValue="team" className="space-y-6">
      <TabsList>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="reporter">Reporter</TabsTrigger>
      </TabsList>
      <TabsContent value="team" className="mt-0">
        {renderPanel(
          <NotificationSettingsForm
            value={team}
            onChange={onTeamChange}
            globalSettings={globalSettings}
            disabled={disabled}
          />
        )}
      </TabsContent>
      <TabsContent value="reporter" className="mt-0">
        {renderPanel(
          <ReporterNotificationSettingsForm
            value={reporter}
            onChange={onReporterChange}
            globalSettings={globalSettings}
            disabled={disabled}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
