export interface WidgetConfig {
  apiKey: string;
  serverUrl: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: string | null;
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
  // Dialog colors (dark mode)
  dialogDarkButtonColor: string;
  dialogDarkTextColor: string;
  dialogDarkButtonHoverColor: string;
  dialogDarkTextHoverColor: string;
  enableHoverScaleEffect: boolean;
  tooltipEnabled: boolean;
  tooltipText: string | null;
  enableScreenshot: boolean;
  enableAnnotation: boolean;
  enableConsoleCapture: boolean;
  captureMethod: 'visible' | 'fullpage' | 'element';
  useScreenCaptureAPI: boolean;
  maxScreenshotSize: number;
}

export const defaultConfig: WidgetConfig = {
  apiKey: '',
  serverUrl: window.location.origin,
  position: 'bottom-right',
  buttonText: null,
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
  // Dialog colors (dark mode)
  dialogDarkButtonColor: '#02658D',
  dialogDarkTextColor: '#ffffff',
  dialogDarkButtonHoverColor: '#036F9B',
  dialogDarkTextHoverColor: '#ffffff',
  enableHoverScaleEffect: true,
  tooltipEnabled: false,
  tooltipText: null,
  enableScreenshot: true,
  enableAnnotation: true,
  enableConsoleCapture: true,
  captureMethod: 'visible',
  useScreenCaptureAPI: false,
  maxScreenshotSize: 5 * 1024 * 1024, // 5MB
};
