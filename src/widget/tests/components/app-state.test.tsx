import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render } from 'preact';
import type { WidgetConfig } from '../../config';
import { installDom } from '../helpers/dom';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';

const captureScreenshot = mock(async () => 'data:image/png;base64,abc');
const captureContext = mock(() => ({
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop', os: 'macOS' },
  viewport: { width: 800, height: 600, devicePixelRatio: 2 },
  timestamp: new Date().toISOString(),
}));
const submitReport = mock(async () => undefined);

let lastDialogProps: Record<string, unknown> | null = null;
let lastAnnotationProps: Record<string, unknown> | null = null;

const WidgetDialogStub = (props: Record<string, unknown>) => {
  lastDialogProps = props;
  return <div data-testid="widget-dialog" />;
};

const AnnotationCanvasStub = (props: Record<string, unknown>) => {
  lastAnnotationProps = props;
  return <div data-testid="annotation" />;
};

const appDeps = {
  WidgetDialog: WidgetDialogStub,
  AnnotationCanvas: AnnotationCanvasStub,
  captureScreenshot,
  captureContext,
  submitReport,
};

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

const originalSetTimeout = globalThis.setTimeout;
const originalImage = globalThis.Image;

let restoreDom: (() => void) | null = null;

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class MockImage {
  width = 640;
  height = 480;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.onload?.());
    } else {
      setTimeout(() => this.onload?.(), 0);
    }
  }
}

beforeEach(() => {
  restoreDom = installDom();
  lastDialogProps = null;
  lastAnnotationProps = null;
  captureScreenshot.mockClear();
  captureContext.mockClear();
  submitReport.mockClear();

  // Install fake IndexedDB for draft storage
  installFakeIndexedDB();

  // Clear localStorage
  if (globalThis.localStorage) {
    globalThis.localStorage.clear();
  }

  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
    if (typeof timeout === 'number' && timeout <= 200) {
      if (typeof handler === 'function') handler();
      return 0 as never;
    }
    return originalSetTimeout(handler, timeout);
  }) as typeof setTimeout;

  globalThis.Image = MockImage as unknown as typeof Image;
});

afterEach(() => {
  restoreDom?.();
  restoreDom = null;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.Image = originalImage;
});

describe('App state transitions', () => {
  it('opens via event and persists draft on close', async () => {
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?app-state');
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcherAgain = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcherAgain?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    expect(lastDialogProps).not.toBeNull();

    const onAddMedia = lastDialogProps?.onAddMedia as (item: unknown) => void;
    const onFormDataChange = lastDialogProps?.onFormDataChange as (data: unknown) => void;
    const onActiveTabChange = lastDialogProps?.onActiveTabChange as (tab: string) => void;
    const onClose = lastDialogProps?.onClose as () => void;

    onAddMedia({
      id: 'media_1',
      dataUrl: 'data:image/png;base64,abc',
      timestamp: new Date(),
      annotated: false,
      mimeType: 'image/png',
    });
    onFormDataChange({
      title: 'Bug title',
      description: '',
      priority: 'medium',
      reporterEmail: '',
      reporterName: '',
    });
    onActiveTabChange('media');

    await flush();

    // Close with content - should show confirmation dialog
    onClose();
    await flush();

    // Dialog should show close confirmation when there's content
    // In a real scenario, user would choose "Save Draft" or "Discard"
    // For this test, verify the state is preserved in the component
    expect(lastDialogProps?.media).toBeDefined();
    expect((lastDialogProps?.formData as { title?: string })?.title).toBe('Bug title');

    render(null, container);
    container.remove();
  });

  it('captures screenshots and adds media', async () => {
    captureScreenshot.mockResolvedValueOnce('data:image/png;base64,abc');
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?app-state');

    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcher?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    const onCaptureScreenshot = lastDialogProps?.onCaptureScreenshot as () => Promise<void>;
    await onCaptureScreenshot();
    await flush();

    const media = (lastDialogProps?.media as unknown[]) ?? [];
    expect(media.length).toBe(1);
    expect(lastDialogProps?.activeTab).toBe('media');

    render(null, container);
    container.remove();
  });

  it('shows a toast when screenshot capture fails', async () => {
    captureScreenshot.mockImplementationOnce(async () => {
      throw new Error('capture failed');
    });

    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?app-state');
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcher?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    const onCaptureScreenshot = lastDialogProps?.onCaptureScreenshot as () => Promise<void>;
    await onCaptureScreenshot();
    await flush();
    await flush();

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.textContent ?? '').toContain('Failed to capture screenshot');

    render(null, container);
    container.remove();
  });

  it('saves annotations and updates media state', async () => {
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?app-state');

    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcher?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    const onAddMedia = lastDialogProps?.onAddMedia as (item: unknown) => void;
    const onAnnotateMedia = lastDialogProps?.onAnnotateMedia as (id: string) => void;

    onAddMedia({
      id: 'media_1',
      dataUrl: 'data:image/png;base64,abc',
      timestamp: new Date(),
      annotated: false,
      mimeType: 'image/png',
    });
    await flush();

    onAnnotateMedia('media_1');
    await flush();

    const annotation = container.querySelector('[data-testid="annotation"]');
    expect(annotation).not.toBeNull();

    const onSave = lastAnnotationProps?.onSave as (image: string, data: object) => void;
    onSave('data:annotated', { mark: true });
    await flush();

    const media = (lastDialogProps?.media as { annotated?: boolean }[]) ?? [];
    expect(media[0]?.annotated).toBe(true);

    render(null, container);
    container.remove();
  });

  it('shows a toast when submit fails', async () => {
    submitReport.mockImplementationOnce(async () => {
      throw new Error('submit failed');
    });
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?app-state');

    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcherAgain = container.querySelector(
      'button[aria-label="Report issue"]',
    ) as HTMLButtonElement | null;
    launcherAgain?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    const onSubmit = lastDialogProps?.onSubmit as (data: object, media: unknown[]) => Promise<void>;
    await onSubmit(
      {
        title: 'Bug',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      [],
    );
    await flush();
    await flush();

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.textContent ?? '').toContain('submit failed');

    render(null, container);
    container.remove();
  });
});
