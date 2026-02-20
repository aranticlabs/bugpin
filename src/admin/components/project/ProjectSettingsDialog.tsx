import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { brandingApi } from '../../api/branding';
import type {
  Project,
  ProjectSettings,
  ProjectNotificationDefaults,
  WidgetLauncherButtonSettings,
  WidgetDialogSettings,
  ScreenshotSettings,
} from '@shared/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Spinner } from '../ui/spinner';
import { WidgetDialogSettingsForm } from '../WidgetDialogSettingsForm';
import type { ThemeColors } from '@shared/types';
import { WidgetLauncherButtonSettingsForm } from '../WidgetLauncherButtonSettingsForm';
import { ScreenshotSettingsForm } from '../ScreenshotSettingsForm';
import { NotificationSettingsForm } from '../NotificationSettingsForm';
import { ProjectWhitelistForm } from './ProjectWhitelistForm';

interface ProjectSettingsDialogProps {
  project: { id: string; name: string; settings?: ProjectSettings };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?:
    | 'widgetDialog'
    | 'widgetLauncherButton'
    | 'screenshot'
    | 'notifications'
    | 'whitelists';
}

import type { NotificationDefaultSettings } from '@shared/types';

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  defaultTab = 'widgetDialog',
}: ProjectSettingsDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Widget dialog settings state (submit button, action buttons)
  const [useCustomWidgetDialog, setUseCustomWidgetDialog] = useState(false);
  const [widgetDialogSettings, setWidgetDialogSettings] = useState<Partial<ThemeColors>>({});

  // Launcher button settings state
  const [useCustomButton, setUseCustomButton] = useState(false);
  const [buttonSettings, setButtonSettings] = useState<Partial<WidgetLauncherButtonSettings>>({});

  // Screenshot settings state
  const [useCustomScreenshot, setUseCustomScreenshot] = useState(false);
  const [screenshotSettings, setScreenshotSettings] = useState<Partial<ScreenshotSettings>>({});

  // Notification settings state
  const [useCustomNotifications, setUseCustomNotifications] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<
    Partial<NotificationDefaultSettings>
  >({});

  // Whitelist settings state
  const [useCustomWhitelist, setUseCustomWhitelist] = useState(false);
  const [whitelistSettings, setWhitelistSettings] = useState<string[]>([]);

  // Fetch project details
  const { data: projectDetail, isLoading: isLoadingProject } = useQuery({
    queryKey: ['project', project.id],
    queryFn: async () => {
      const response = await api.get(`/projects/${project.id}`);
      return response.data.project as Project;
    },
    enabled: open,
  });

  // Fetch global settings
  const { data: globalSettings, isLoading: isLoadingGlobal } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings;
    },
    enabled: open,
  });

  // Fetch branding config for global widget modal colors
  const { data: brandingConfig, isLoading: isLoadingBranding } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
    enabled: open,
    staleTime: Infinity, // Never refetch - branding config is managed globally
  });

  // Fetch notification defaults
  const { data: notificationDefaults, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ['project-notification-defaults', project.id],
    queryFn: async () => {
      const response = await api.get(`/notification-preferences/projects/${project.id}/defaults`);
      return response.data.defaults as ProjectNotificationDefaults | null;
    },
    enabled: open,
  });

  // Initialize state when data loads
  useEffect(() => {
    if (projectDetail) {
      // Widget Dialog settings - using new nested structure
      const dialogSettings = projectDetail.settings?.widgetDialog;
      const hasCustomWidgetDialog =
        dialogSettings &&
        (dialogSettings.lightButtonColor !== undefined ||
          dialogSettings.darkButtonColor !== undefined);
      setUseCustomWidgetDialog(!!hasCustomWidgetDialog);
      setWidgetDialogSettings(dialogSettings || {});

      // Widget Button (launcher) settings - using new nested structure
      const launcherSettings = projectDetail.settings?.widgetLauncherButton;
      const hasCustomButton =
        launcherSettings &&
        (launcherSettings.position !== undefined ||
          launcherSettings.buttonText !== undefined ||
          launcherSettings.buttonShape !== undefined ||
          launcherSettings.lightButtonColor !== undefined);
      setUseCustomButton(!!hasCustomButton);
      setButtonSettings(launcherSettings || {});

      // Screenshot settings - using new nested structure
      const screenshotConf = projectDetail.settings?.screenshot;
      const hasCustomScreenshot =
        screenshotConf?.useScreenCaptureAPI !== undefined ||
        screenshotConf?.maxScreenshotSize !== undefined;
      setUseCustomScreenshot(hasCustomScreenshot);
      setScreenshotSettings({
        useScreenCaptureAPI: screenshotConf?.useScreenCaptureAPI,
        maxScreenshotSize: screenshotConf?.maxScreenshotSize,
      });

      // Whitelist settings
      const security = projectDetail.settings?.security;
      const hasCustomWhitelist = security?.allowedOrigins && security.allowedOrigins.length > 0;
      setUseCustomWhitelist(!!hasCustomWhitelist);
      setWhitelistSettings(security?.allowedOrigins || []);
    }
  }, [projectDetail]);

  // Initialize notification settings
  useEffect(() => {
    if (notificationDefaults) {
      setUseCustomNotifications(true);
      setNotificationSettings({
        emailEnabled: notificationDefaults.defaultEmailEnabled,
        notifyOnNewReport: notificationDefaults.defaultNotifyOnNewReport,
        notifyOnStatusChange: notificationDefaults.defaultNotifyOnStatusChange,
        notifyOnPriorityChange: notificationDefaults.defaultNotifyOnPriorityChange,
        notifyOnAssignment: notificationDefaults.defaultNotifyOnAssignment,
        notifyOnDeletion: notificationDefaults.defaultNotifyOnDeletion,
      });
    } else {
      setUseCustomNotifications(false);
      setNotificationSettings({});
    }
  }, [notificationDefaults]);

  // Mutation for project settings (widget, button, screenshot, whitelist)
  const projectMutation = useMutation({
    mutationFn: async (data: { settings: Partial<ProjectSettings> }) => {
      const response = await api.patch(`/projects/${project.id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
  });

  // Mutation for notification defaults
  const notificationMutation = useMutation({
    mutationFn: async (data: Partial<ProjectNotificationDefaults>) => {
      const response = await api.patch(
        `/notification-preferences/projects/${project.id}/defaults`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', project.id] });
    },
  });

  // Mutation for deleting notification defaults
  const deleteNotificationMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete(
        `/notification-preferences/projects/${project.id}/defaults`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', project.id] });
    },
  });

  const handleSave = async () => {
    try {
      // Build settings with new nested structure
      const newSettings: Partial<ProjectSettings> = {
        ...projectDetail?.settings,
      };

      // Widget Dialog settings
      if (useCustomWidgetDialog && Object.keys(widgetDialogSettings).length > 0) {
        newSettings.widgetDialog = widgetDialogSettings as WidgetDialogSettings;
      } else {
        newSettings.widgetDialog = undefined;
      }

      // Widget Button (launcher) settings
      if (useCustomButton && Object.keys(buttonSettings).length > 0) {
        newSettings.widgetLauncherButton = buttonSettings as WidgetLauncherButtonSettings;
      } else {
        newSettings.widgetLauncherButton = undefined;
      }

      // Screenshot settings
      if (useCustomScreenshot && Object.keys(screenshotSettings).length > 0) {
        newSettings.screenshot = screenshotSettings as ScreenshotSettings;
      } else {
        newSettings.screenshot = undefined;
      }

      // Security settings (whitelist)
      if (useCustomWhitelist && whitelistSettings.length > 0) {
        newSettings.security = {
          allowedOrigins: whitelistSettings,
        };
      } else {
        newSettings.security = undefined;
      }

      // Save project settings
      await projectMutation.mutateAsync({
        settings: newSettings,
      });

      // Save notification settings
      if (useCustomNotifications) {
        // Convert from NotificationDefaultSettings format to ProjectNotificationDefaults format
        await notificationMutation.mutateAsync({
          defaultEmailEnabled: notificationSettings.emailEnabled,
          defaultNotifyOnNewReport: notificationSettings.notifyOnNewReport,
          defaultNotifyOnStatusChange: notificationSettings.notifyOnStatusChange,
          defaultNotifyOnPriorityChange: notificationSettings.notifyOnPriorityChange,
          defaultNotifyOnAssignment: notificationSettings.notifyOnAssignment,
          defaultNotifyOnDeletion: notificationSettings.notifyOnDeletion,
        });
      } else {
        await deleteNotificationMutation.mutateAsync();
      }

      toast.success('Settings saved successfully');
      onOpenChange(false);
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save settings');
    }
  };

  const isLoading =
    isLoadingProject || isLoadingGlobal || isLoadingNotifications || isLoadingBranding;
  const isSaving =
    projectMutation.isPending ||
    notificationMutation.isPending ||
    deleteNotificationMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] min-h-[67vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>Configure settings for "{project.name}"</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Spinner className="text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-4">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="widgetDialog">Widget Dialog</TabsTrigger>
                <TabsTrigger value="widgetLauncherButton">Widget Button</TabsTrigger>
                <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
                <TabsTrigger value="whitelists">Whitelists</TabsTrigger>
              </TabsList>

              {/* Widget Dialog Tab (dialog colors) */}
              <TabsContent value="widgetDialog" className="mt-4">
                <WidgetDialogSettingsForm
                  value={widgetDialogSettings}
                  onChange={setWidgetDialogSettings}
                  globalWidgetColors={brandingConfig?.widgetPrimaryColors}
                  showCustomToggle
                  useCustomSettings={useCustomWidgetDialog}
                  onCustomToggle={setUseCustomWidgetDialog}
                />
              </TabsContent>

              {/* Widget Launcher Button Tab */}
              <TabsContent value="widgetLauncherButton" className="mt-4">
                <WidgetLauncherButtonSettingsForm
                  value={buttonSettings}
                  onChange={setButtonSettings}
                  globalSettings={globalSettings}
                  showCustomToggle
                  useCustomSettings={useCustomButton}
                  onCustomToggle={setUseCustomButton}
                  useTabs
                />
              </TabsContent>

              {/* Screenshot Tab */}
              <TabsContent value="screenshot" className="mt-4">
                <ScreenshotSettingsForm
                  value={screenshotSettings}
                  onChange={setScreenshotSettings}
                  globalSettings={globalSettings}
                  showCustomToggle
                  useCustomSettings={useCustomScreenshot}
                  onCustomToggle={setUseCustomScreenshot}
                />
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="mt-4">
                <NotificationSettingsForm
                  value={notificationSettings}
                  onChange={setNotificationSettings}
                  globalSettings={globalSettings}
                  showCustomToggle
                  useCustomSettings={useCustomNotifications}
                  onCustomToggle={setUseCustomNotifications}
                />
              </TabsContent>

              {/* Domain Whitelists Tab */}
              <TabsContent value="whitelists" className="mt-4">
                <ProjectWhitelistForm
                  value={whitelistSettings}
                  onChange={setWhitelistSettings}
                  showCustomToggle
                  useCustomSettings={useCustomWhitelist}
                  onCustomToggle={setUseCustomWhitelist}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
