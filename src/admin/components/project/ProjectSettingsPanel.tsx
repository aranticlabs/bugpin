import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
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
  ReporterNotificationSettings,
  ProjectLanguageSettings,
  LocaleCode,
  DiagnosticSettings,
} from '@shared/types';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { NotificationTabs } from '../NotificationTabs';
import { SectionCard } from '../settings/SectionCard';
import { DEFAULT_LANGUAGE_SETTINGS, LanguageSettingsForm } from '../LanguageSettingsForm';
import { Spinner } from '../ui/spinner';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { WidgetDialogSettingsForm, resolveDialogColors } from '../WidgetDialogSettingsForm';
import type { ThemeColors } from '@shared/types';
import { WidgetLauncherButtonSettingsForm } from '../WidgetLauncherButtonSettingsForm';
import { SettingsCard } from '../ui/settings-card';
import {
  DialogPreviewCard,
  LauncherPreviewCard,
  SettingsWithPreview,
} from '../widget/WidgetSettingsLayout';
import { ScreenshotSettingsForm, resolveScreenshotSettings } from '../ScreenshotSettingsForm';
import { RecordingSettingsForm, resolveRecordingSettings } from '../RecordingSettingsForm';
import { DiagnosticsSettingsForm, resolveDiagnosticSettings } from '../DiagnosticsSettingsForm';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ProjectWhitelistForm } from './ProjectWhitelistForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export type ProjectSettingsSection =
  'general' | 'launcher' | 'dialog' | 'language' | 'capture' | 'notifications';

interface ProjectSettingsPanelProps {
  projectId: string;
  section: ProjectSettingsSection;
}

const AutoSaveContext = createContext<() => void>(() => undefined);

function CustomSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const requestSave = useContext(AutoSaveContext);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">
        Custom
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          onCheckedChange(next);
          if (!next) requestSave();
        }}
        aria-label={label}
      />
    </div>
  );
}

function InheritedBadge() {
  return (
    // The negative margin keeps the badge inside the title's line height, so the header does not
    // grow when the badge appears.
    <Badge size="sm" className="-my-0.5 px-2 font-medium">
      Inherited
    </Badge>
  );
}

function InheritedFields({
  custom,
  defaultsPath,
  children,
}: {
  custom: boolean;
  defaultsPath?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {!custom && (
        <Alert role="note" className="border-primary/20 bg-primary/10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Inherits the project defaults. Turn on Custom to change them for this project.
            {defaultsPath && (
              <>
                {' '}
                <Link to={defaultsPath} className="underline">
                  Edit project defaults
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

import type { NotificationDefaultSettings } from '@shared/types';

const UNASSIGNED_VALUE = '__unassigned__';

const hasDefinedValue = (settings: object) =>
  Object.values(settings).some((value) => value !== undefined);

export function ProjectSettingsPanel({ projectId, section }: ProjectSettingsPanelProps) {
  const queryClient = useQueryClient();
  const project = { id: projectId };

  // Widget dialog settings state (submit button, action buttons)
  const [useCustomWidgetDialog, setUseCustomWidgetDialog] = useState(false);
  const [widgetDialogSettings, setWidgetDialogSettings] = useState<Partial<ThemeColors>>({});

  // Launcher button settings state
  const [useCustomButton, setUseCustomButton] = useState(false);
  const [previewLocale, setPreviewLocale] = useState<LocaleCode>('en');
  const [buttonSettings, setButtonSettings] = useState<Partial<WidgetLauncherButtonSettings>>({});

  // Screenshot settings state
  const [useCustomScreenshot, setUseCustomScreenshot] = useState(false);
  const [screenshotSettings, setScreenshotSettings] = useState<Partial<ScreenshotSettings>>({});

  // Recording settings state
  const [useCustomRecording, setUseCustomRecording] = useState(false);
  const [recordingSettings, setRecordingSettings] = useState<Partial<ScreenshotSettings>>({});

  const [useCustomDiagnostics, setUseCustomDiagnostics] = useState(false);
  const [diagnosticSettings, setDiagnosticSettings] = useState<Partial<DiagnosticSettings>>({});

  // Notification settings state
  const [useCustomNotifications, setUseCustomNotifications] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<
    Partial<NotificationDefaultSettings>
  >({});

  // Reporter notification settings state
  const [reporterSettings, setReporterSettings] = useState<Partial<ReporterNotificationSettings>>(
    {}
  );

  // Assignment settings state
  const [defaultAssigneeUserId, setDefaultAssigneeUserId] = useState<string | null>(null);

  // Whitelist settings state
  const [whitelistSettings, setWhitelistSettings] = useState<string[]>([]);

  // Language settings state (no override = inherit the instance-wide language)
  const [useCustomLanguage, setUseCustomLanguage] = useState(false);
  const [languageSettings, setLanguageSettings] =
    useState<ProjectLanguageSettings>(DEFAULT_LANGUAGE_SETTINGS);

  // Fetch project details
  const { data: projectDetail, isLoading: isLoadingProject } = useQuery({
    queryKey: ['project', project.id],
    queryFn: async () => {
      const response = await api.get(`/projects/${project.id}`);
      return response.data.project as Project;
    },
  });

  // Fetch global settings
  const { data: globalSettings, isLoading: isLoadingGlobal } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings;
    },
  });

  // Fetch branding config for global widget modal colors
  const { data: brandingConfig, isLoading: isLoadingBranding } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
    staleTime: Infinity, // Never refetch - branding config is managed globally
  });

  // Fetch notification defaults
  const { data: notificationDefaults, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ['project-notification-defaults', project.id],
    queryFn: async () => {
      const response = await api.get(`/notification-preferences/projects/${project.id}/defaults`);
      return response.data.defaults as ProjectNotificationDefaults | null;
    },
  });

  const { data: assignableUsers, isLoading: isLoadingAssignableUsers } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const response = await api.get('/users/assignable');
      return response.data.users as Array<{
        id: string;
        name: string;
        email: string;
        avatarUrl?: string;
      }>;
    },
  });

  // Bumped whenever server data is applied to the form, so the unsaved-changes baseline resets.
  const [loadVersion, setLoadVersion] = useState(0);
  const [saveRequested, setSaveRequested] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const formState = {
    useCustomWidgetDialog,
    widgetDialogSettings,
    useCustomButton,
    buttonSettings,
    useCustomScreenshot,
    screenshotSettings,
    useCustomRecording,
    recordingSettings,
    useCustomDiagnostics,
    diagnosticSettings,
    useCustomNotifications,
    notificationSettings,
    reporterSettings,
    defaultAssigneeUserId,
    whitelistSettings,
    useCustomLanguage,
    languageSettings,
  };
  const formSnapshot = JSON.stringify(formState);
  const isDirty = formSnapshot !== savedSnapshot;

  // Restores every tab from the snapshot of the last loaded or saved values.
  const discardChanges = () => {
    if (!savedSnapshot) return;
    const saved = JSON.parse(savedSnapshot) as typeof formState;
    setUseCustomWidgetDialog(saved.useCustomWidgetDialog);
    setWidgetDialogSettings(saved.widgetDialogSettings);
    setUseCustomButton(saved.useCustomButton);
    setButtonSettings(saved.buttonSettings);
    setUseCustomScreenshot(saved.useCustomScreenshot);
    setScreenshotSettings(saved.screenshotSettings);
    setUseCustomRecording(saved.useCustomRecording);
    setRecordingSettings(saved.recordingSettings);
    setUseCustomDiagnostics(saved.useCustomDiagnostics);
    setDiagnosticSettings(saved.diagnosticSettings);
    setUseCustomNotifications(saved.useCustomNotifications);
    setNotificationSettings(saved.notificationSettings);
    setReporterSettings(saved.reporterSettings);
    setDefaultAssigneeUserId(saved.defaultAssigneeUserId);
    setWhitelistSettings(saved.whitelistSettings);
    setUseCustomLanguage(saved.useCustomLanguage);
    setLanguageSettings(saved.languageSettings);
  };

  // Runs in the render after the server data landed in the form state above.
  useEffect(() => {
    setSavedSnapshot(formSnapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadVersion]);

  // Initialize state when data loads
  useEffect(() => {
    if (projectDetail) {
      // Widget Dialog settings - using new nested structure
      const dialogSettings = projectDetail.settings?.widgetDialog;
      const hasCustomWidgetDialog = dialogSettings && Object.keys(dialogSettings).length > 0;
      setUseCustomWidgetDialog(!!hasCustomWidgetDialog);
      setWidgetDialogSettings(dialogSettings || {});

      // Widget Button (launcher) settings - using new nested structure
      const launcherSettings = projectDetail.settings?.widgetLauncherButton;
      const hasCustomButton = launcherSettings && Object.keys(launcherSettings).length > 0;
      setUseCustomButton(!!hasCustomButton);
      setButtonSettings(launcherSettings || {});

      // Screenshot settings - using new nested structure
      const screenshotConf = projectDetail.settings?.screenshot;
      const nextScreenshotSettings = {
        useScreenCaptureAPI: screenshotConf?.useScreenCaptureAPI,
        maxScreenshotSize: screenshotConf?.maxScreenshotSize,
        maxImageUploadSizeMb: screenshotConf?.maxImageUploadSizeMb,
      };
      const nextRecordingSettings = {
        maxVideoUploadSizeMb: screenshotConf?.maxVideoUploadSizeMb,
        maxVideoUploadMbPerDay: screenshotConf?.maxVideoUploadMbPerDay,
        enableScreenRecording: screenshotConf?.enableScreenRecording,
        allowRecordingMicrophone: screenshotConf?.allowRecordingMicrophone,
        maxRecordingDurationSeconds: screenshotConf?.maxRecordingDurationSeconds,
        recordingQuality: screenshotConf?.recordingQuality,
      };
      setUseCustomScreenshot(hasDefinedValue(nextScreenshotSettings));
      setScreenshotSettings(nextScreenshotSettings);
      setUseCustomRecording(hasDefinedValue(nextRecordingSettings));
      setRecordingSettings(nextRecordingSettings);

      const nextDiagnosticSettings = {
        activityCapture: projectDetail.settings?.activityCapture,
        consoleCapture: projectDetail.settings?.consoleCapture,
        networkCapture: projectDetail.settings?.networkCapture,
        storageKeysCapture: projectDetail.settings?.storageKeysCapture,
      };
      setUseCustomDiagnostics(hasDefinedValue(nextDiagnosticSettings));
      setDiagnosticSettings(nextDiagnosticSettings);

      // Whitelist settings
      const security = projectDetail.settings?.security;
      setWhitelistSettings(security?.allowedOrigins || []);

      // Reporter notification settings
      const reporterConf = projectDetail.settings?.reporterNotifications;
      setReporterSettings(reporterConf || {});

      // Default assignee
      setDefaultAssigneeUserId(projectDetail.settings?.defaultAssigneeUserId ?? null);

      // Language settings
      const projectLanguage = projectDetail.settings?.language;
      setUseCustomLanguage(!!projectLanguage);
      setLanguageSettings(projectLanguage ?? DEFAULT_LANGUAGE_SETTINGS);
      setLoadVersion((version) => version + 1);
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
    setLoadVersion((version) => version + 1);
  }, [notificationDefaults]);

  // Mutation for project settings (widget, button, screenshot, whitelist)
  const projectMutation = useMutation({
    mutationFn: async (data: { settings: Partial<ProjectSettings> }) => {
      const response = await api.patch(`/projects/${project.id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-summaries'] });
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
    },
  });

  // Mutation for notification defaults
  const notificationMutation = useMutation({
    mutationFn: async (data: Partial<ProjectNotificationDefaults>) => {
      const response = await api.patch(
        `/notification-preferences/projects/${project.id}/defaults`,
        data
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
        `/notification-preferences/projects/${project.id}/defaults`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-notification-defaults', project.id] });
    },
  });

  const handleSave = async (): Promise<boolean> => {
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

      // Screenshot and recording settings are stored together
      const customCaptureSettings: ScreenshotSettings = {
        ...(useCustomScreenshot ? screenshotSettings : {}),
        ...(useCustomRecording ? recordingSettings : {}),
      };
      newSettings.screenshot = hasDefinedValue(customCaptureSettings)
        ? customCaptureSettings
        : undefined;

      // Without an override the four values stay unset, so the instance defaults apply.
      const diagnostics = useCustomDiagnostics
        ? resolveDiagnosticSettings(diagnosticSettings, globalSettings?.diagnostics)
        : undefined;
      newSettings.activityCapture = diagnostics?.activityCapture;
      newSettings.consoleCapture = diagnostics?.consoleCapture;
      newSettings.networkCapture = diagnostics?.networkCapture;
      newSettings.storageKeysCapture = diagnostics?.storageKeysCapture;

      // Security settings (whitelist)
      if (whitelistSettings.length > 0) {
        newSettings.security = {
          allowedOrigins: whitelistSettings,
        };
      } else {
        newSettings.security = undefined;
      }

      // Reporter notification settings
      if (useCustomNotifications && Object.keys(reporterSettings).length > 0) {
        newSettings.reporterNotifications =
          reporterSettings as ProjectSettings['reporterNotifications'];
      } else {
        newSettings.reporterNotifications = undefined;
      }

      newSettings.defaultAssigneeUserId = defaultAssigneeUserId;

      // Language settings: null clears the override so the global language applies
      newSettings.language = useCustomLanguage ? languageSettings : null;

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

      setSavedSnapshot(formSnapshot);
      toast.success('Settings saved successfully');
      return true;
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to save settings');
      return false;
    }
  };

  const isLoading =
    isLoadingProject ||
    isLoadingGlobal ||
    isLoadingNotifications ||
    isLoadingBranding ||
    isLoadingAssignableUsers;

  const assignableUserIds = new Set(assignableUsers?.map((user) => user.id) ?? []);
  const isMissingAssignedUser =
    !!defaultAssigneeUserId && !assignableUserIds.has(defaultAssigneeUserId);
  const defaultAssigneeSelectValue = defaultAssigneeUserId ?? UNASSIGNED_VALUE;
  const selectedAssignee = assignableUsers?.find((user) => user.id === defaultAssigneeUserId);

  // Runs after the render that applied the switch, so handleSave sees the switched-off state.
  useEffect(() => {
    if (!saveRequested) return;
    setSaveRequested(false);
    void handleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveRequested]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="text-primary" />
      </div>
    );
  }

  const hasPreview = section === 'launcher' || section === 'dialog';
  const shownLanguage = useCustomLanguage
    ? languageSettings
    : (globalSettings?.language ?? DEFAULT_LANGUAGE_SETTINGS);

  return (
    <AutoSaveContext.Provider value={() => setSaveRequested(true)}>
      <UnsavedChangesGuard isDirty={isDirty} onSave={handleSave} onDiscard={discardChanges} />
      <div className={hasPreview ? 'space-y-6' : 'max-w-4xl space-y-6'}>
        {section === 'general' && (
          <>
            <SettingsCard
              title="Default Assignee"
              description="New reports from this project are assigned automatically to this user."
            >
              <div className="space-y-5">
                <Label htmlFor="default-assignee" className="sr-only">
                  Default Assignee
                </Label>

                <div className="rounded-lg border bg-muted/30 p-4">
                  {selectedAssignee ? (
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {selectedAssignee.avatarUrl ? (
                          <AvatarImage
                            src={selectedAssignee.avatarUrl}
                            alt={selectedAssignee.name}
                          />
                        ) : null}
                        <AvatarFallback>
                          {selectedAssignee.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium">{selectedAssignee.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {selectedAssignee.email}
                        </p>
                      </div>
                    </div>
                  ) : isMissingAssignedUser ? (
                    <div className="space-y-1">
                      <p className="font-medium">Current assignee unavailable</p>
                      <p className="text-sm text-muted-foreground">
                        This user can no longer receive default assignments for new reports.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-medium">No default assignee</p>
                      <p className="text-sm text-muted-foreground">
                        New reports stay unassigned until somebody picks them up manually.
                      </p>
                    </div>
                  )}
                </div>

                <Select
                  value={defaultAssigneeSelectValue}
                  onValueChange={(value) =>
                    setDefaultAssigneeUserId(value === UNASSIGNED_VALUE ? null : value)
                  }
                >
                  <SelectTrigger id="default-assignee" className="h-11 max-w-xl">
                    <SelectValue placeholder="Choose a default assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_VALUE}>No default assignee</SelectItem>
                    {isMissingAssignedUser && defaultAssigneeUserId ? (
                      <SelectItem value={defaultAssigneeUserId}>
                        Unavailable user (current setting)
                      </SelectItem>
                    ) : null}
                    {assignableUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {isMissingAssignedUser ? (
                  <p className="text-sm text-warning">
                    The current default assignee is no longer assignable. New reports stay
                    unassigned until you choose another user.
                  </p>
                ) : null}
              </div>
            </SettingsCard>
            <SettingsCard
              title="Allowed Domains"
              description="Only websites from these domains can use the project's widget."
            >
              <ProjectWhitelistForm value={whitelistSettings} onChange={setWhitelistSettings} />
            </SettingsCard>
          </>
        )}

        {section === 'launcher' && (
          <SettingsWithPreview
            preview={
              <LauncherPreviewCard
                launcher={buttonSettings}
                launcherGlobals={globalSettings}
                locale={previewLocale}
              />
            }
          >
            <SectionCard
              section="launcher"
              badge={!useCustomButton && <InheritedBadge />}
              action={
                <CustomSwitch
                  id="use-custom-settings"
                  label="Use custom launcher button settings"
                  checked={useCustomButton}
                  onCheckedChange={(checked) => {
                    setUseCustomButton(checked);
                    if (!checked) setButtonSettings({});
                  }}
                />
              }
            >
              <InheritedFields
                custom={useCustomButton}
                defaultsPath="/settings/project-defaults/launcher-button"
              >
                <WidgetLauncherButtonSettingsForm
                  value={buttonSettings}
                  onChange={setButtonSettings}
                  globalSettings={globalSettings}
                  onPreviewLocaleChange={setPreviewLocale}
                  disabled={!useCustomButton}
                />
              </InheritedFields>
            </SectionCard>
          </SettingsWithPreview>
        )}

        {section === 'dialog' && (
          <SettingsWithPreview
            placement="below"
            preview={
              <DialogPreviewCard
                colors={resolveDialogColors(
                  widgetDialogSettings,
                  brandingConfig?.widgetPrimaryColors
                )}
              />
            }
          >
            <SectionCard
              section="dialog"
              badge={!useCustomWidgetDialog && <InheritedBadge />}
              action={
                <CustomSwitch
                  id="use-custom-widget-dialog"
                  label="Use custom dialog colors"
                  checked={useCustomWidgetDialog}
                  onCheckedChange={(checked) => {
                    setUseCustomWidgetDialog(checked);
                    if (!checked) setWidgetDialogSettings({});
                  }}
                />
              }
            >
              <InheritedFields
                custom={useCustomWidgetDialog}
                defaultsPath="/settings/project-defaults/dialog-colors"
              >
                <WidgetDialogSettingsForm
                  value={widgetDialogSettings}
                  onChange={setWidgetDialogSettings}
                  globalWidgetColors={brandingConfig?.widgetPrimaryColors}
                  disabled={!useCustomWidgetDialog}
                />
              </InheritedFields>
            </SectionCard>
          </SettingsWithPreview>
        )}

        {section === 'language' && (
          <SectionCard
            section="language"
            badge={!useCustomLanguage && <InheritedBadge />}
            action={
              <CustomSwitch
                id="use-custom-language"
                label="Use custom language settings"
                checked={useCustomLanguage}
                onCheckedChange={(checked) => {
                  setUseCustomLanguage(checked);
                  if (checked) {
                    // Start the override from the current global language
                    setLanguageSettings(globalSettings?.language ?? DEFAULT_LANGUAGE_SETTINGS);
                  }
                }}
              />
            }
          >
            <InheritedFields
              custom={useCustomLanguage}
              defaultsPath="/settings/project-defaults/language"
            >
              <LanguageSettingsForm
                value={shownLanguage}
                onChange={setLanguageSettings}
                disabled={!useCustomLanguage}
              />
            </InheritedFields>
          </SectionCard>
        )}

        {section === 'capture' && (
          <>
            <SectionCard
              section="screenshot"
              badge={!useCustomScreenshot && <InheritedBadge />}
              action={
                <CustomSwitch
                  id="use-custom-screenshot"
                  label="Use custom screenshot settings"
                  checked={useCustomScreenshot}
                  onCheckedChange={(checked) => {
                    setUseCustomScreenshot(checked);
                    // Turning custom settings on copies the inherited values, so the project keeps
                    // them even when nothing else is changed before saving.
                    setScreenshotSettings(
                      checked ? resolveScreenshotSettings(screenshotSettings, globalSettings) : {}
                    );
                  }}
                />
              }
            >
              <InheritedFields
                custom={useCustomScreenshot}
                defaultsPath="/settings/project-defaults/capture"
              >
                <ScreenshotSettingsForm
                  value={screenshotSettings}
                  onChange={setScreenshotSettings}
                  globalSettings={globalSettings}
                  disabled={!useCustomScreenshot}
                />
              </InheritedFields>
            </SectionCard>
            <SectionCard
              section="recording"
              badge={!useCustomRecording && <InheritedBadge />}
              action={
                <CustomSwitch
                  id="use-custom-recording"
                  label="Use custom recording settings"
                  checked={useCustomRecording}
                  onCheckedChange={(checked) => {
                    setUseCustomRecording(checked);
                    setRecordingSettings(
                      checked ? resolveRecordingSettings(recordingSettings, globalSettings) : {}
                    );
                  }}
                />
              }
            >
              <InheritedFields
                custom={useCustomRecording}
                defaultsPath="/settings/project-defaults/capture"
              >
                <RecordingSettingsForm
                  value={recordingSettings}
                  onChange={setRecordingSettings}
                  globalSettings={globalSettings}
                  disabled={!useCustomRecording}
                />
              </InheritedFields>
            </SectionCard>
            <SectionCard
              section="diagnostics"
              badge={!useCustomDiagnostics && <InheritedBadge />}
              action={
                <CustomSwitch
                  id="use-custom-diagnostics"
                  label="Use custom diagnostics settings"
                  checked={useCustomDiagnostics}
                  onCheckedChange={(checked) => {
                    setUseCustomDiagnostics(checked);
                    setDiagnosticSettings(
                      checked
                        ? resolveDiagnosticSettings(diagnosticSettings, globalSettings?.diagnostics)
                        : {}
                    );
                  }}
                />
              }
            >
              <InheritedFields
                custom={useCustomDiagnostics}
                defaultsPath="/settings/project-defaults/capture"
              >
                <DiagnosticsSettingsForm
                  value={diagnosticSettings}
                  onChange={setDiagnosticSettings}
                  defaults={globalSettings?.diagnostics}
                  euPrivacyMode={globalSettings?.privacy?.euPrivacyMode}
                  disabled={!useCustomDiagnostics}
                />
              </InheritedFields>
            </SectionCard>
          </>
        )}

        {section === 'notifications' && (
          <SectionCard
            section="notifications"
            badge={!useCustomNotifications && <InheritedBadge />}
            action={
              <CustomSwitch
                id="use-custom-notifications"
                label="Use custom notification settings"
                checked={useCustomNotifications}
                onCheckedChange={(checked) => {
                  setUseCustomNotifications(checked);
                  if (!checked) {
                    setNotificationSettings({});
                    setReporterSettings({});
                  }
                }}
              />
            }
          >
            <InheritedFields
              custom={useCustomNotifications}
              defaultsPath="/settings/project-defaults/notifications"
            >
              <NotificationTabs
                team={notificationSettings}
                onTeamChange={setNotificationSettings}
                reporter={reporterSettings}
                onReporterChange={setReporterSettings}
                globalSettings={globalSettings}
                disabled={!useCustomNotifications}
              />
            </InheritedFields>
          </SectionCard>
        )}
      </div>
    </AutoSaveContext.Provider>
  );
}
