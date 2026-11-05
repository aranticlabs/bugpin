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
  onTabChange?: (tab: 'team' | 'reporter') => void;
}

export function NotificationTabs({
  team,
  onTeamChange,
  reporter,
  onReporterChange,
  globalSettings,
  disabled = false,
  onTabChange,
}: NotificationTabsProps) {
  return (
    <Tabs
      defaultValue="team"
      onValueChange={(tab) => onTabChange?.(tab === 'reporter' ? 'reporter' : 'team')}
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="team" disabled={disabled}>
          Team
        </TabsTrigger>
        <TabsTrigger value="reporter" disabled={disabled}>
          Reporter
        </TabsTrigger>
      </TabsList>
      <TabsContent value="team" className="mt-4">
        <NotificationSettingsForm
          value={team}
          onChange={onTeamChange}
          globalSettings={globalSettings}
          disabled={disabled}
        />
      </TabsContent>
      <TabsContent value="reporter" className="mt-4">
        <ReporterNotificationSettingsForm
          value={reporter}
          onChange={onReporterChange}
          globalSettings={globalSettings}
          disabled={disabled}
        />
      </TabsContent>
    </Tabs>
  );
}
