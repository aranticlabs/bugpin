// Set up global mocks for animation frame APIs that Preact hooks require
// This must be done before any imports that might trigger Preact hooks
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0 as never;
  }) as typeof requestAnimationFrame;
}
if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
}

import { afterAll, beforeAll, describe, it, expect } from 'bun:test';
import { installDom } from '../helpers/dom';
import { renderToString } from 'preact-render-to-string';
import { Icon } from '../../components/Icon';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { ScreenshotManager, type CapturedMedia } from '../../components/ScreenshotManager';
import { WidgetDialog } from '../../components/WidgetDialog';
import type { WidgetConfig } from '../../config';

let restoreDom: (() => void) | null = null;

beforeAll(() => {
  restoreDom = installDom();
});

afterAll(() => {
  restoreDom?.();
});

const baseConfig: WidgetConfig = {
  apiKey: 'proj_key',
  serverUrl: 'https://example.com',
  position: 'bottom-right',
  buttonText: { project: { en: 'Report issue' }, global: null, builtin: null },
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 18,
  buttonIconStroke: 2,
  buttonOffsetX: 20,
  buttonOffsetY: 20,
  buttonSizeUnit: 'px',
  theme: 'auto',
  lightButtonColor: '#000000',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#111111',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#000000',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#111111',
  darkTextHoverColor: '#ffffff',
  dialogLightButtonColor: '#000000',
  dialogLightTextColor: '#ffffff',
  dialogLightButtonHoverColor: '#111111',
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
  dialogDarkButtonColor: '#000000',
  dialogDarkTextColor: '#ffffff',
  dialogDarkButtonHoverColor: '#111111',
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
  maxScreenshotSize: 5 * 1024 * 1024,
  maxImageUploadSize: 10 * 1024 * 1024,
  maxVideoUploadSize: 50 * 1024 * 1024,
  maxRecordingDurationSeconds: 180,
  recordingQuality: 'standard',
};

const mediaItem: CapturedMedia = {
  id: 'media_1',
  dataUrl: 'data:image/png;base64,abc',
  timestamp: new Date('2024-01-01T00:00:00Z'),
  annotated: false,
  mimeType: 'image/png',
  width: 100,
  height: 100,
};

describe('widget components', () => {
  it('returns null for unknown icon', () => {
    const html = renderToString(<Icon name="unknown" />);
    expect(html).toBe('');
  });

  it('renders launcher button text', () => {
    const html = renderToString(
      <WidgetLauncherButton
        position="bottom-right"
        buttonText={{ project: { en: 'Report' }, global: null, builtin: null }}
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={18}
        buttonIconStroke={2}
        buttonOffsetX={20}
        buttonOffsetY={20}
        buttonSizeUnit="px"
        theme="auto"
        lightButtonColor="#000000"
        lightTextColor="#ffffff"
        lightButtonHoverColor="#111111"
        lightTextHoverColor="#ffffff"
        darkButtonColor="#000000"
        darkTextColor="#ffffff"
        darkButtonHoverColor="#111111"
        darkTextHoverColor="#ffffff"
        enableHoverScaleEffect={true}
        tooltipEnabled={false}
        tooltipText={{ project: undefined, global: null, builtin: null }}
        onClick={() => undefined}
      />
    );
    expect(html).toContain('Report');
  });

  it('uses default aria-label when button text is missing', () => {
    const html = renderToString(
      <WidgetLauncherButton
        position="bottom-right"
        buttonText={{ project: null, global: null, builtin: null }}
        buttonShape="round"
        buttonIcon={null}
        buttonIconSize={18}
        buttonIconStroke={2}
        buttonOffsetX={20}
        buttonOffsetY={20}
        buttonSizeUnit="px"
        theme="auto"
        lightButtonColor="#000000"
        lightTextColor="#ffffff"
        lightButtonHoverColor="#111111"
        lightTextHoverColor="#ffffff"
        darkButtonColor="#000000"
        darkTextColor="#ffffff"
        darkButtonHoverColor="#111111"
        darkTextHoverColor="#ffffff"
        enableHoverScaleEffect={false}
        tooltipEnabled={false}
        tooltipText={{ project: undefined, global: null, builtin: null }}
        onClick={() => undefined}
      />
    );
    expect(html).toContain('aria-label="Report Bug"');
  });

  it('renders screenshot manager empty state', () => {
    const html = renderToString(
      <ScreenshotManager
        media={[]}
        onCapture={() => undefined}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('Drag and drop files here');
  });

  it('renders screenshot manager with media', () => {
    const html = renderToString(
      <ScreenshotManager
        media={[mediaItem]}
        onCapture={() => undefined}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('Add more');
  });

  it('renders screenshot manager without annotation actions when disabled', () => {
    const html = renderToString(
      <ScreenshotManager
        media={[mediaItem]}
        onCapture={() => undefined}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={false}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('Screenshot');
    expect(html).not.toContain('title="Annotate"');
  });

  it('renders widget dialog details tab', () => {
    const dialog = (
      <WidgetDialog
        onClose={() => undefined}
        onSubmit={() => undefined}
        onCaptureScreenshot={() => undefined}
        onAnnotateMedia={() => undefined}
        media={[]}
        onAddMedia={() => undefined}
        onRemoveMedia={() => undefined}
        isSubmitting={false}
        uploadProgress={null}
        onCancelSubmit={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        activeTab="details"
        onActiveTabChange={() => undefined}
        formData={{
          title: '',
          description: '',
          priority: 'medium',
          reporterEmail: '',
          reporterName: '',
        }}
        onFormDataChange={() => undefined}
        showScreenCaptureConsent={false}
        onConsentConfirm={() => undefined}
        onConsentCancel={() => undefined}
        reduceScreenshotQuality={false}
        onReduceScreenshotQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    const html = renderToString(dialog);
    const portalUrl = 'https://feedback.example.test/reporter-portal/';
    const enabled = renderToString(
      <WidgetDialog {...dialog.props} portalUrl={portalUrl} hidePoweredBy />
    );
    expect(enabled).toContain('My feedback');
    expect(enabled).toContain(portalUrl);
    expect(enabled).not.toContain('Powered by');
    expect(html).not.toContain('My feedback');
    const success = renderToString(
      <WidgetDialog {...dialog.props} portalUrl={portalUrl} submitted submittedWithEmail />
    );
    expect(success).toContain('View my feedback');
    expect(success).toContain('Check your inbox');
    expect(success).not.toContain('Submit Report');
    const anonymous = renderToString(
      <WidgetDialog {...dialog.props} portalUrl={portalUrl} submitted />
    );
    expect(anonymous).not.toContain('Check your inbox');
    expect(html).toContain('Report a Bug');
    expect(html).toContain('Submit Report');
    expect(html).toContain('h-[770px]');
    expect(html).not.toContain('min-h-[770px]');
    expect(html).toContain('max-h-[calc(100vh-40px)]');
  });

  it('renders custom dialog texts and hides the priority field', () => {
    const html = renderToString(
      <WidgetDialog
        content={{
          title: {
            project: { en: 'Send Feedback' },
            global: { en: 'Global Title' },
            builtin: null,
          },
          titlePlaceholder: { project: undefined, global: { en: 'Short summary' }, builtin: null },
          descriptionPlaceholder: { project: null, global: { en: 'Unused' }, builtin: null },
          submitButtonText: { project: { en: 'Send' }, global: null, builtin: null },
          showPriority: false,
        }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onCaptureScreenshot={() => undefined}
        onAnnotateMedia={() => undefined}
        media={[]}
        onAddMedia={() => undefined}
        onRemoveMedia={() => undefined}
        isSubmitting={false}
        uploadProgress={null}
        onCancelSubmit={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        activeTab="details"
        onActiveTabChange={() => undefined}
        formData={{
          title: '',
          description: '',
          priority: 'medium',
          reporterEmail: '',
          reporterName: '',
        }}
        onFormDataChange={() => undefined}
        showScreenCaptureConsent={false}
        onConsentConfirm={() => undefined}
        onConsentCancel={() => undefined}
        reduceScreenshotQuality={false}
        onReduceScreenshotQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('Send Feedback');
    expect(html).not.toContain('Report a Bug');
    expect(html).toContain('placeholder="Short summary"');
    expect(html).toContain('placeholder="Steps to reproduce, expected behavior, etc."');
    expect(html).toContain('>Send</button>');
    expect(html).not.toContain('bugpin-priority');
  });

  it('renders widget dialog media tab with count', () => {
    const html = renderToString(
      <WidgetDialog
        onClose={() => undefined}
        onSubmit={() => undefined}
        onCaptureScreenshot={() => undefined}
        onAnnotateMedia={() => undefined}
        media={[mediaItem]}
        onAddMedia={() => undefined}
        onRemoveMedia={() => undefined}
        isSubmitting={false}
        uploadProgress={null}
        onCancelSubmit={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        activeTab="media"
        onActiveTabChange={() => undefined}
        formData={{
          title: '',
          description: '',
          priority: 'medium',
          reporterEmail: '',
          reporterName: '',
        }}
        onFormDataChange={() => undefined}
        showScreenCaptureConsent={false}
        onConsentConfirm={() => undefined}
        onConsentCancel={() => undefined}
        reduceScreenshotQuality={false}
        onReduceScreenshotQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('Screenshots (1)');
    expect(html).toContain('Capture Screenshot');
  });

  it('shows upload progress when submitting', () => {
    const html = renderToString(
      <WidgetDialog
        onClose={() => undefined}
        onSubmit={() => undefined}
        onCaptureScreenshot={() => undefined}
        onAnnotateMedia={() => undefined}
        media={[]}
        onAddMedia={() => undefined}
        onRemoveMedia={() => undefined}
        isSubmitting={true}
        uploadProgress={0.42}
        onCancelSubmit={() => undefined}
        isCapturing={false}
        enableAnnotation={true}
        activeTab="details"
        onActiveTabChange={() => undefined}
        formData={{
          title: 'Valid title',
          description: '',
          priority: 'medium',
          reporterEmail: '',
          reporterName: '',
        }}
        onFormDataChange={() => undefined}
        showScreenCaptureConsent={false}
        onConsentConfirm={() => undefined}
        onConsentCancel={() => undefined}
        reduceScreenshotQuality={false}
        onReduceScreenshotQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('Uploading 42%');
    expect(html).toContain('Cancel upload');
  });

  it('shows capturing label when capturing', () => {
    const html = renderToString(
      <ScreenshotManager
        media={[]}
        onCapture={() => undefined}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={true}
        enableAnnotation={true}
        reduceQuality={false}
        onReduceQualityChange={() => undefined}
        oversizedCapture={null}
        onDismissOversizedCapture={() => undefined}
      />
    );
    expect(html).toContain('Capturing...');
  });

  it('renders known icon', () => {
    const html = renderToString(<Icon name="bug" class="test-icon" size={20} strokeWidth={3} />);
    expect(html).toContain('test-icon');
    expect(html).toContain('stroke-width="3"');
  });

  it('renders app container', async () => {
    const originalWindow = globalThis.window;
    const originalNavigator = globalThis.navigator;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    globalThis.window = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      matchMedia: () =>
        ({
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
      innerWidth: 1024,
      innerHeight: 768,
    } as unknown as typeof globalThis.window;
    globalThis.navigator = { userAgent: 'Mozilla/5.0' } as Navigator;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0 as never;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    const { App } = await import('../../components/App');
    const html = renderToString(<App config={baseConfig} />);
    expect(html).toContain('bugpin-container');
    expect(html).toContain('bugpin-theme-light');
    expect(html).toContain('Report issue');

    globalThis.window = originalWindow;
    globalThis.navigator = originalNavigator;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });
});
