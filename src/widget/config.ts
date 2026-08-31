import type { LauncherTextBundle, LocaleCode, UserActivityCapturePolicy } from '@shared/types';

export type { LauncherTextBundle };

export interface WidgetLanguageConfig {
  mode: 'auto' | 'manual';
  defaultLanguage: LocaleCode;
}

export interface WidgetConfig {
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
  // Dialog colors (dark mode)
  dialogDarkButtonColor: string;
  dialogDarkTextColor: string;
  dialogDarkButtonHoverColor: string;
  dialogDarkTextHoverColor: string;
  dialogDarkBackgroundColor: string;
  dialogDarkSecondaryColor: string;
  dialogDarkInputColor: string;
  dialogDarkForegroundColor: string;
  enableHoverScaleEffect: boolean;
  tooltipEnabled: boolean;
  tooltipText: LauncherTextBundle;
  enableScreenshot: boolean;
  enableAnnotation: boolean;
  enableConsoleCapture: boolean;
  enableNetworkCapture: boolean;
  enableStorageKeysCapture: boolean;
  userActivityCapture: UserActivityCapturePolicy;
  captureMethod: 'visible' | 'fullpage' | 'element';
  useScreenCaptureAPI: boolean;
  maxScreenshotSize: number;
  maxImageUploadSize: number;
  maxVideoUploadSize: number;
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
  // Dialog colors (dark mode)
  dialogDarkButtonColor: '#02658D',
  dialogDarkTextColor: '#ffffff',
  dialogDarkButtonHoverColor: '#036F9B',
  dialogDarkTextHoverColor: '#ffffff',
  dialogDarkBackgroundColor: '#0a0a0a',
  dialogDarkSecondaryColor: '#262626',
  dialogDarkInputColor: '#1a1a1a',
  dialogDarkForegroundColor: '#fafafa',
  enableHoverScaleEffect: true,
  tooltipEnabled: false,
  tooltipText: { project: undefined, global: null, builtin: null },
  enableScreenshot: true,
  enableAnnotation: true,
  enableConsoleCapture: true,
  enableNetworkCapture: true,
  enableStorageKeysCapture: false,
  userActivityCapture: 'automatic',
  captureMethod: 'visible',
  useScreenCaptureAPI: false,
  maxScreenshotSize: 10 * 1024 * 1024, // 10MB
  maxImageUploadSize: 10 * 1024 * 1024, // 10MB
  maxVideoUploadSize: 50 * 1024 * 1024, // 50MB
};
