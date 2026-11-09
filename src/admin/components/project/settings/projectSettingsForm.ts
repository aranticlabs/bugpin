import type {
  DiagnosticSettings,
  NotificationDefaultSettings,
  ProjectLanguageSettings,
  ProjectNotificationDefaults,
  ProjectSettings,
  ProjectSettingsUpdate,
  ReporterNotificationSettings,
  ReporterPortalProjectSettings,
  ScreenshotSettings,
  ThemeColors,
  WidgetDialogContentSettings,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { DEFAULT_LANGUAGE_SETTINGS } from '../../LanguageSettingsForm';
import { resolveDiagnosticSettings } from '../../DiagnosticsSettingsForm';

export interface ProjectSettingsForm {
  reporterPortal: ReporterPortalProjectSettings;
  useCustomWidgetDialog: boolean;
  widgetDialogSettings: Partial<ThemeColors>;
  useCustomDialogContent: boolean;
  dialogContentSettings: WidgetDialogContentSettings;
  useCustomButton: boolean;
  buttonSettings: WidgetLauncherButtonSettings;
  useCustomScreenshot: boolean;
  screenshotSettings: ScreenshotSettings;
  useCustomRecording: boolean;
  recordingSettings: ScreenshotSettings;
  useCustomDiagnostics: boolean;
  diagnosticSettings: Partial<DiagnosticSettings>;
  useCustomNotifications: boolean;
  notificationSettings: Partial<NotificationDefaultSettings>;
  reporterSettings: Partial<ReporterNotificationSettings>;
  defaultAssigneeUserId: string | null;
  whitelistSettings: string[];
  useCustomLanguage: boolean;
  languageSettings: ProjectLanguageSettings;
}

export type UpdateProjectSettingsForm = (changes: Partial<ProjectSettingsForm>) => void;

export const hasDefinedValue = (settings: object) =>
  Object.values(settings).some((value) => value !== undefined);

const hasKeys = (settings: object) => Object.keys(settings).length > 0;

function normalizeReporterPortal(
  settings: ProjectSettings['reporterPortal']
): ReporterPortalProjectSettings {
  return {
    enabled: settings?.enabled ?? false,
    allowNewFeedback: settings?.allowNewFeedback ?? false,
  };
}

export function projectSettingsToForm(
  settings: ProjectSettings | undefined,
  notificationDefaults: ProjectNotificationDefaults | null | undefined
): ProjectSettingsForm {
  const widgetDialog = settings?.widgetDialog ?? {};
  const widgetDialogContent = settings?.widgetDialogContent ?? {};
  const widgetLauncherButton = settings?.widgetLauncherButton ?? {};
  const screenshot = settings?.screenshot;
  const screenshotSettings: ScreenshotSettings = {
    useScreenCaptureAPI: screenshot?.useScreenCaptureAPI,
    maxScreenshotSize: screenshot?.maxScreenshotSize,
    maxImageUploadSizeMb: screenshot?.maxImageUploadSizeMb,
  };
  const recordingSettings: ScreenshotSettings = {
    maxVideoUploadSizeMb: screenshot?.maxVideoUploadSizeMb,
    maxVideoUploadMbPerDay: screenshot?.maxVideoUploadMbPerDay,
    enableScreenRecording: screenshot?.enableScreenRecording,
    allowRecordingMicrophone: screenshot?.allowRecordingMicrophone,
    maxRecordingDurationSeconds: screenshot?.maxRecordingDurationSeconds,
    recordingQuality: screenshot?.recordingQuality,
  };
  const diagnosticSettings: Partial<DiagnosticSettings> = {
    activityCapture: settings?.activityCapture,
    consoleCapture: settings?.consoleCapture,
    networkCapture: settings?.networkCapture,
    storageKeysCapture: settings?.storageKeysCapture,
  };

  return {
    reporterPortal: normalizeReporterPortal(settings?.reporterPortal),
    useCustomWidgetDialog: hasKeys(widgetDialog),
    widgetDialogSettings: widgetDialog,
    useCustomDialogContent: hasDefinedValue(widgetDialogContent),
    dialogContentSettings: widgetDialogContent,
    useCustomButton: hasKeys(widgetLauncherButton),
    buttonSettings: widgetLauncherButton,
    useCustomScreenshot: hasDefinedValue(screenshotSettings),
    screenshotSettings,
    useCustomRecording: hasDefinedValue(recordingSettings),
    recordingSettings,
    useCustomDiagnostics: hasDefinedValue(diagnosticSettings),
    diagnosticSettings,
    useCustomNotifications: !!notificationDefaults,
    notificationSettings: notificationDefaults
      ? {
          emailEnabled: notificationDefaults.defaultEmailEnabled,
          notifyOnNewReport: notificationDefaults.defaultNotifyOnNewReport,
          notifyOnStatusChange: notificationDefaults.defaultNotifyOnStatusChange,
          notifyOnPriorityChange: notificationDefaults.defaultNotifyOnPriorityChange,
          notifyOnAssignment: notificationDefaults.defaultNotifyOnAssignment,
          notifyOnDeletion: notificationDefaults.defaultNotifyOnDeletion,
          notifyOnReporterReply: notificationDefaults.defaultNotifyOnReporterReply,
        }
      : {},
    reporterSettings: settings?.reporterNotifications ?? {},
    defaultAssigneeUserId: settings?.defaultAssigneeUserId ?? null,
    whitelistSettings: settings?.security?.allowedOrigins ?? [],
    useCustomLanguage: !!settings?.language,
    languageSettings: settings?.language ?? DEFAULT_LANGUAGE_SETTINGS,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const sameForm = (a: ProjectSettingsForm, b: ProjectSettingsForm) => sameValue(a, b);

/**
 * Applies freshly loaded values to the fields the user has not edited since the last load or
 * save, and keeps every edited field as it is.
 */
export function mergeLoadedForm(
  form: ProjectSettingsForm,
  baseline: ProjectSettingsForm,
  loaded: ProjectSettingsForm
): ProjectSettingsForm {
  const merged = { ...form };
  for (const key of Object.keys(loaded) as (keyof ProjectSettingsForm)[]) {
    if (sameValue(form[key], baseline[key])) {
      Object.assign(merged, { [key]: loaded[key] });
    }
  }
  return merged;
}

type OverrideKey =
  | 'widgetDialog'
  | 'widgetDialogContent'
  | 'widgetLauncherButton'
  | 'screenshot'
  | 'activityCapture'
  | 'consoleCapture'
  | 'networkCapture'
  | 'storageKeysCapture'
  | 'security'
  | 'reporterNotifications';

/**
 * Builds the PATCH body for the project settings. The server merges the body into the stored
 * settings and removes keys sent as null, so every override that is turned off is sent as null.
 * This does not depend on whether the loaded project still stores the override.
 */
export function buildProjectSettingsUpdate(
  saved: ProjectSettings | undefined,
  form: ProjectSettingsForm,
  defaultDiagnostics: DiagnosticSettings | undefined
): ProjectSettingsUpdate {
  const { reporterPortal: savedPortal, ...otherSettings } = saved ?? {};
  const update: ProjectSettingsUpdate = { ...otherSettings };

  const setOverride = <K extends OverrideKey>(key: K, value: ProjectSettings[K] | undefined) => {
    update[key] = value === undefined ? null : value;
  };

  setOverride(
    'widgetDialog',
    form.useCustomWidgetDialog && hasKeys(form.widgetDialogSettings)
      ? form.widgetDialogSettings
      : undefined
  );

  setOverride(
    'widgetDialogContent',
    form.useCustomDialogContent && hasDefinedValue(form.dialogContentSettings)
      ? form.dialogContentSettings
      : undefined
  );

  setOverride(
    'widgetLauncherButton',
    form.useCustomButton && hasKeys(form.buttonSettings) ? form.buttonSettings : undefined
  );

  // Screenshot and recording settings are stored together.
  const captureSettings: ScreenshotSettings = {
    ...(form.useCustomScreenshot ? form.screenshotSettings : {}),
    ...(form.useCustomRecording ? form.recordingSettings : {}),
  };
  setOverride('screenshot', hasDefinedValue(captureSettings) ? captureSettings : undefined);

  const diagnostics = form.useCustomDiagnostics
    ? resolveDiagnosticSettings(form.diagnosticSettings, defaultDiagnostics)
    : undefined;
  setOverride('activityCapture', diagnostics?.activityCapture);
  setOverride('consoleCapture', diagnostics?.consoleCapture);
  setOverride('networkCapture', diagnostics?.networkCapture);
  setOverride('storageKeysCapture', diagnostics?.storageKeysCapture);

  setOverride(
    'security',
    form.whitelistSettings.length > 0 ? { allowedOrigins: form.whitelistSettings } : undefined
  );

  setOverride(
    'reporterNotifications',
    form.useCustomNotifications && hasKeys(form.reporterSettings)
      ? form.reporterSettings
      : undefined
  );

  update.defaultAssigneeUserId = form.defaultAssigneeUserId;
  const reporterPortal = normalizeReporterPortal(form.reporterPortal);
  if (!sameValue(normalizeReporterPortal(savedPortal), reporterPortal))
    update.reporterPortal = reporterPortal;
  update.language = form.useCustomLanguage ? form.languageSettings : null;

  return update;
}

export function formToNotificationDefaults(
  form: ProjectSettingsForm
): Partial<ProjectNotificationDefaults> {
  const { notificationSettings } = form;
  return {
    defaultEmailEnabled: notificationSettings.emailEnabled,
    defaultNotifyOnNewReport: notificationSettings.notifyOnNewReport,
    defaultNotifyOnStatusChange: notificationSettings.notifyOnStatusChange,
    defaultNotifyOnPriorityChange: notificationSettings.notifyOnPriorityChange,
    defaultNotifyOnAssignment: notificationSettings.notifyOnAssignment,
    defaultNotifyOnDeletion: notificationSettings.notifyOnDeletion,
    defaultNotifyOnReporterReply: notificationSettings.notifyOnReporterReply,
  };
}
