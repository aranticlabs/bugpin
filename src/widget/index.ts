import { h, render } from 'preact';
import { App } from './components/App.js';
import { WidgetConfig, defaultConfig } from './config.js';

// Start error capture immediately when widget loads (before any async operations)
// This patches console and fetch to capture errors/network issues
import { startErrorCapture } from './capture/context.js';
startErrorCapture();

// Widget styles (will be injected into Shadow DOM)
import styles from './styles/main.css?inline';

// Track if widget is already initialized (prevent duplicates)
let isInitialized = false;

/**
 * Fetch widget configuration from server
 */
async function fetchConfig(
  apiKey: string,
  serverUrl: string,
): Promise<Partial<WidgetConfig> | null> {
  try {
    const response = await fetch(`${serverUrl}/api/widget/config/${apiKey}`);
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.config) {
        const cfg = data.config;
        return {
          buttonText: cfg.buttonText,
          buttonShape: cfg.buttonShape,
          buttonIcon: cfg.buttonIcon,
          buttonIconSize: cfg.buttonIconSize,
          buttonIconStroke: cfg.buttonIconStroke,
          position: cfg.position,
          theme: cfg.theme,
          // Light mode colors
          lightButtonColor: cfg.lightButtonColor,
          lightTextColor: cfg.lightTextColor,
          lightButtonHoverColor: cfg.lightButtonHoverColor,
          lightTextHoverColor: cfg.lightTextHoverColor,
          // Dark mode colors (launcher button)
          darkButtonColor: cfg.darkButtonColor,
          darkTextColor: cfg.darkTextColor,
          darkButtonHoverColor: cfg.darkButtonHoverColor,
          darkTextHoverColor: cfg.darkTextHoverColor,
          // Dialog colors (light mode)
          dialogLightButtonColor: cfg.dialogLightButtonColor,
          dialogLightTextColor: cfg.dialogLightTextColor,
          dialogLightButtonHoverColor: cfg.dialogLightButtonHoverColor,
          dialogLightTextHoverColor: cfg.dialogLightTextHoverColor,
          // Dialog colors (dark mode)
          dialogDarkButtonColor: cfg.dialogDarkButtonColor,
          dialogDarkTextColor: cfg.dialogDarkTextColor,
          dialogDarkButtonHoverColor: cfg.dialogDarkButtonHoverColor,
          dialogDarkTextHoverColor: cfg.dialogDarkTextHoverColor,
          enableHoverScaleEffect: cfg.enableHoverScaleEffect,
          tooltipEnabled: cfg.tooltipEnabled,
          tooltipText: cfg.tooltipText,
          enableScreenshot: cfg.features?.screenshot ?? true,
          enableAnnotation: cfg.features?.annotation ?? true,
          enableConsoleCapture: cfg.features?.consoleCapture ?? true,
          captureMethod: cfg.captureMethod,
          useScreenCaptureAPI: cfg.useScreenCaptureAPI,
        };
      }
    } else if (response.status === 403) {
      // Project is paused - don't initialize widget
      const data = await response.json();
      if (data.error === 'PROJECT_PAUSED') {
        console.info('[BugPin] Widget disabled - project is paused');
        return null;
      }
    }
  } catch (error) {
    console.warn('[BugPin] Failed to fetch widget config, using defaults', error);
  }
  return {};
}

/**
 * Create the widget container with Shadow DOM
 */
function createWidget(config: WidgetConfig): void {
  // Prevent duplicate widgets
  if (isInitialized) {
    console.warn('[BugPin] Widget already initialized');
    return;
  }
  isInitialized = true;

  // Create container element
  const container = document.createElement('div');
  container.id = 'bugpin-widget';
  container.setAttribute('data-bugpin-exclude', 'true');

  // Attach Shadow DOM
  const shadow = container.attachShadow({ mode: 'open' });

  // Inject styles
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  shadow.appendChild(styleElement);

  // Create render target
  const root = document.createElement('div');
  root.id = 'bugpin-root';
  shadow.appendChild(root);

  // Add container to document
  document.body.appendChild(container);

  // Render Preact app
  render(h(App, { config }), root);
}

/**
 * Auto-initialize from script tag attributes
 */
async function initFromScriptTag(scriptElement: HTMLScriptElement): Promise<void> {
  const apiKey = scriptElement.getAttribute('data-api-key');

  if (!apiKey) {
    console.error('[BugPin] Missing data-api-key attribute');
    return;
  }

  // Extract server URL from script src (https://your-bugpin-server.com/widget.js or http://localhost:7300/widget.js)
  // This ensures the widget connects to the correct server even when testing on localhost
  const serverUrl =
    scriptElement.getAttribute('data-server-url') || new URL(scriptElement.src).origin;

  // Fetch configuration from API
  const fetchedConfig = await fetchConfig(apiKey, serverUrl);

  // If null, project is paused - skip widget initialization
  if (fetchedConfig === null) {
    return;
  }

  // Merge configurations: defaults < API < data attributes
  const config: WidgetConfig = {
    ...defaultConfig,
    ...fetchedConfig,
    apiKey,
    serverUrl,
    // Data attributes override API config
    ...(scriptElement.getAttribute('data-position') && {
      position: scriptElement.getAttribute('data-position') as WidgetConfig['position'],
    }),
    ...(scriptElement.getAttribute('data-button-text') && {
      buttonText: scriptElement.getAttribute('data-button-text')!,
    }),
    ...(scriptElement.getAttribute('data-theme') && {
      theme: scriptElement.getAttribute('data-theme') as 'light' | 'dark',
    }),
  };

  createWidget(config);
}

// Public API

declare global {
  interface Window {
    BugPin?: {
      init: (
        config: Partial<WidgetConfig> & { apiKey: string; serverUrl?: string },
      ) => Promise<void>;
      open: () => void;
      close: () => void;
    };
  }
}

// Public API object
const BugPin = {
  /**
   * Initialize the widget programmatically (for npm/module usage)
   */
  init: async (
    config: Partial<WidgetConfig> & { apiKey: string; serverUrl?: string },
  ): Promise<void> => {
    const serverUrl = config.serverUrl || defaultConfig.serverUrl;
    const fetchedConfig = await fetchConfig(config.apiKey, serverUrl);

    // If null, project is paused - skip widget initialization
    if (fetchedConfig === null) {
      return;
    }

    // Merge: defaults < server config < user-provided config
    const fullConfig: WidgetConfig = {
      ...defaultConfig,
      ...fetchedConfig,
      ...config,
      serverUrl,
    };
    createWidget(fullConfig);
  },

  /**
   * Open the bug report dialog
   */
  open: () => {
    document.dispatchEvent(new CustomEvent('bugpin:open'));
  },

  /**
   * Close the bug report dialog
   */
  close: () => {
    document.dispatchEvent(new CustomEvent('bugpin:close'));
  },
};

// Expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.BugPin = BugPin;
}

// Auto-initialize when loaded as script tag
// Capture currentScript immediately at load time (before any async operations)
const loadingScript = document.currentScript as HTMLScriptElement | null;

if (loadingScript?.hasAttribute('data-api-key')) {
  // Script tag with data-api-key - auto-initialize
  const initWidget = () => initFromScriptTag(loadingScript);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
}

// Export for npm/module usage
export default BugPin;
export { BugPin, createWidget, type WidgetConfig };
