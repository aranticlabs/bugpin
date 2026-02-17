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

import { describe, it, expect } from 'bun:test';
import { renderToString } from 'preact-render-to-string';
import { Icon } from '../../components/Icon';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { ScreenshotManager, type CapturedMedia } from '../../components/ScreenshotManager';
import { WidgetDialog } from '../../components/WidgetDialog';
import type { WidgetConfig } from '../../config';

const baseConfig: WidgetConfig = {
  apiKey: 'proj_key',
  serverUrl: 'https://example.com',
  position: 'bottom-right',
  buttonText: 'Report issue',
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 18,
  buttonIconStroke: 2,
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
  dialogDarkButtonColor: '#000000',
  dialogDarkTextColor: '#ffffff',
  dialogDarkButtonHoverColor: '#111111',
  dialogDarkTextHoverColor: '#ffffff',
  enableHoverScaleEffect: true,
  tooltipEnabled: false,
  tooltipText: null,
  enableScreenshot: true,
  enableAnnotation: true,
  enableConsoleCapture: true,
  captureMethod: 'visible',
  useScreenCaptureAPI: false,
  maxScreenshotSize: 5 * 1024 * 1024,
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
        buttonText="Report"
        buttonShape="round"
        buttonIcon="bug"
        buttonIconSize={18}
        buttonIconStroke={2}
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
        tooltipText={null}
        onClick={() => undefined}
      />,
    );
    expect(html).toContain('Report');
  });

  it('uses default aria-label when button text is missing', () => {
    const html = renderToString(
      <WidgetLauncherButton
        position="bottom-right"
        buttonText={null}
        buttonShape="round"
        buttonIcon={null}
        buttonIconSize={18}
        buttonIconStroke={2}
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
        tooltipText={null}
        onClick={() => undefined}
      />,
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
      />,
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
      />,
    );
    expect(html).toContain('Add more');
  });

  it('renders screenshot manager with video and annotation disabled', () => {
    const videoItem: CapturedMedia = {
      ...mediaItem,
      id: 'media_video',
      mimeType: 'video/mp4',
    };
    const html = renderToString(
      <ScreenshotManager
        media={[videoItem]}
        onCapture={() => undefined}
        onUpload={() => undefined}
        onRemove={() => undefined}
        onAnnotate={() => undefined}
        isCapturing={false}
        enableAnnotation={false}
      />,
    );
    expect(html).toContain('Video');
    expect(html).not.toContain('title="Annotate"');
  });

  it('renders widget dialog details tab', () => {
    const html = renderToString(
      <WidgetDialog
        onClose={() => undefined}
        onSubmit={() => undefined}
        onCaptureScreenshot={() => undefined}
        onAnnotateMedia={() => undefined}
        media={[]}
        onAddMedia={() => undefined}
        onRemoveMedia={() => undefined}
        isSubmitting={false}
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
      />,
    );
    expect(html).toContain('Report a Bug');
    expect(html).toContain('Submit Report');
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
      />,
    );
    expect(html).toContain('Screenshots (1)');
    expect(html).toContain('Capture Screenshot');
  });

  it('shows submitting spinner when submitting', () => {
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
      />,
    );
    expect(html).toContain('animate-[spin_0.8s_linear_infinite]');
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
      />,
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
    expect(html).toContain('bugpin-theme-auto');
    expect(html).toContain('Report issue');

    globalThis.window = originalWindow;
    globalThis.navigator = originalNavigator;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });
});
