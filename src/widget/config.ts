import { DEFAULT_RECORDING_QUALITY, type RecordingQuality } from '@shared/recording-quality.js';
import type { LauncherTextBundle, LocaleCode, UserActivityCapturePolicy } from '@shared/types';

export type { LauncherTextBundle };

export interface WidgetLanguageConfig {
  mode: 'auto' | 'manual';
  defaultLanguage: LocaleCode;
}

export interface WidgetConfig {
  hidePoweredBy?: boolean;
  apiKey: string;
  serverUrl: string;
  reporterName?: string;
  reporterEmail?: string;
  language?: WidgetLanguageConfig;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: LauncherTextBundle;
  buttonShape: 'round' | 'rectangle';
  buttonIcon: string | null;
  buttonIconSize: number;
  buttonIconStroke: number;
  buttonOffsetX: number;
  buttonOffsetY: number;
  buttonSizeUnit: 'px' | 'rem';
  theme: 'auto' | 'light' | 'dark';
  // Light mode colors
  lightButtonColor: string;
  lightTextColor: string;
  lightButtonHoverColor: string;
  lightTextHoverColor: string;
  // Dark mode colors (launcher button)
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
  // Dialog colors (light mode)
  dialogLightButtonColor: string;
  dialogLightTextColor: string;
  dialogLightButtonHoverColor: string;
  dialogLightTextHoverColor: string;
  dialogLightBackgroundColor: string;
  dialogLightSecondaryColor: string;
  dialogLightInputColor: string;
  dialogLightForegroundColor: string;
  dialogLightSecondaryButtonColor: string;
  dialogLightSecondaryButtonTextColor: string;
  dialogLightSecondaryButtonHoverColor: string;
  dialogLightSecondaryButtonTextHoverColor: string;
  dialogLightTabBarColor: string;
  dialogLightActiveTabColor: string;
  dialogLightActiveTabTextColor: string;
  dialogLightTabTextColor: string;
  dialogLightTabTextHoverColor: string;
  // Dialog colors (dark mode)
  dialogDarkButtonColor: string;
  dialogDarkTextColor: string;
  dialogDarkButtonHoverColor: string;
  dialogDarkTextHoverColor: string;
  dialogDarkBackgroundColor: string;
  dialogDarkSecondaryColor: string;
  dialogDarkInputColor: string;
  dialogDarkForegroundColor: string;
  dialogDarkSecondaryButtonColor: string;
  dialogDarkSecondaryButtonTextColor: string;
  dialogDarkSecondaryButtonHoverColor: string;
  dialogDarkSecondaryButtonTextHoverColor: string;
  dialogDarkTabBarColor: string;
  dialogDarkActiveTabColor: string;
  dialogDarkActiveTabTextColor: string;
  dialogDarkTabTextColor: string;
  dialogDarkTabTextHoverColor: string;
  enableHoverScaleEffect: boolean;
  tooltipEnabled: boolean;
  tooltipText: LauncherTextBundle;
  dialogTitle: LauncherTextBundle;
  dialogTitlePlaceholder: LauncherTextBundle;
  dialogDescriptionPlaceholder: LauncherTextBundle;
  dialogSubmitButtonText: LauncherTextBundle;
  dialogShowPriority: boolean;
  enableScreenshot: boolean;
  enableAnnotation: boolean;
  enableConsoleCapture: boolean;
  enableNetworkCapture: boolean;
  enableStorageKeysCapture: boolean;
  enableScreenRecording: boolean;
  allowRecordingMicrophone: boolean;
  userActivityCapture: UserActivityCapturePolicy;
  captureMethod: 'visible' | 'fullpage' | 'element';
  useScreenCaptureAPI: boolean;
  maxScreenshotSize: number;
  maxImageUploadSize: number;
  maxVideoUploadSize: number;
  maxRecordingDurationSeconds: number;
  recordingQuality: RecordingQuality;
}

export const defaultConfig: WidgetConfig = {
  apiKey: '',
  serverUrl: window.location.origin,
  position: 'bottom-right',
  buttonText: { project: undefined, global: null, builtin: null },
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 18,
  buttonIconStroke: 2,
  buttonOffsetX: 20,
  buttonOffsetY: 20,
  buttonSizeUnit: 'px',
  theme: 'auto',
  // Light mode colors
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  // Dark mode colors (launcher button)
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  // Dialog colors (light mode)
  dialogLightButtonColor: '#02658D',
  dialogLightTextColor: '#ffffff',
  dialogLightButtonHoverColor: '#024F6F',
  dialogLightTextHoverColor: '#ffffff',
  dialogLightBackgroundColor: '#ffffff',
  dialogLightSecondaryColor: '#f5f5f5',
  dialogLightInputColor: '#ffffff',
  dialogLightForegroundColor: '#0a0a0a',
  dialogLightSecondaryButtonColor: '#ffffff',
  dialogLightSecondaryButtonTextColor: '#0a0a0a',
  dialogLightSecondaryButtonHoverColor: '#e5e5e5',
  dialogLightSecondaryButtonTextHoverColor: '#0a0a0a',
  dialogLightTabBarColor: '#f5f5f5',
  dialogLightActiveTabColor: '#ffffff',
  dialogLightActiveTabTextColor: '#0a0a0a',
  dialogLightTabTextColor: '#737373',
  dialogLightTabTextHoverColor: '#0a0a0a',
  // Dialog colors (dark mode)
  dialogDarkButtonColor: '#02658D',
  dialogDarkTextColor: '#ffffff',
  dialogDarkButtonHoverColor: '#036F9B',
  dialogDarkTextHoverColor: '#ffffff',
  dialogDarkBackgroundColor: '#0a0a0a',
  dialogDarkSecondaryColor: '#262626',
  dialogDarkInputColor: '#1a1a1a',
  dialogDarkForegroundColor: '#fafafa',
  dialogDarkSecondaryButtonColor: '#0a0a0a',
  dialogDarkSecondaryButtonTextColor: '#fafafa',
  dialogDarkSecondaryButtonHoverColor: '#404040',
  dialogDarkSecondaryButtonTextHoverColor: '#fafafa',
  dialogDarkTabBarColor: '#262626',
  dialogDarkActiveTabColor: '#0a0a0a',
  dialogDarkActiveTabTextColor: '#fafafa',
  dialogDarkTabTextColor: '#a3a3a3',
  dialogDarkTabTextHoverColor: '#fafafa',
  enableHoverScaleEffect: true,
  tooltipEnabled: false,
  tooltipText: { project: undefined, global: null, builtin: null },
  dialogTitle: { project: undefined, global: null, builtin: null },
  dialogTitlePlaceholder: { project: undefined, global: null, builtin: null },
  dialogDescriptionPlaceholder: { project: undefined, global: null, builtin: null },
  dialogSubmitButtonText: { project: undefined, global: null, builtin: null },
  dialogShowPriority: true,
  enableScreenshot: true,
  enableAnnotation: true,
  enableConsoleCapture: true,
  enableNetworkCapture: true,
  enableStorageKeysCapture: false,
  enableScreenRecording: false,
  allowRecordingMicrophone: false,
  userActivityCapture: 'automatic',
  captureMethod: 'visible',
  useScreenCaptureAPI: false,
  maxScreenshotSize: 10 * 1024 * 1024, // 10MB
  maxImageUploadSize: 10 * 1024 * 1024, // 10MB
  maxVideoUploadSize: 50 * 1024 * 1024, // 50MB
  maxRecordingDurationSeconds: 180,
  recordingQuality: DEFAULT_RECORDING_QUALITY,
};
