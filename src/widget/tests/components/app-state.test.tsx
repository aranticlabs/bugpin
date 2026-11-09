import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { render, type ComponentProps } from 'preact';
import type { WidgetDialog } from '../../components/WidgetDialog';
import type { AnnotationCanvas } from '../../annotate/AnnotationCanvas';
import type { WidgetConfig } from '../../config';
import type { FormData as WidgetFormData } from '../../components/WidgetDialog';
import { installDom } from '../helpers/dom';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';
import { draftStorage } from '../../storage/draft-storage';
import type { SendOptions, SubmitReportInput } from '../../api/submit';
import { t } from '../../i18n/index';

const captureScreenshot = mock(async () => 'data:image/png;base64,abc');
const captureContext = mock(() => ({
  url: 'https://example.com',
  browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
  device: { type: 'desktop' as const, os: 'macOS' },
  viewport: { width: 800, height: 600, devicePixelRatio: 2 },
  timestamp: new Date().toISOString(),
}));
const submitReport = mock(
  async (
    _input: SubmitReportInput,
    _options?: SendOptions
  ): Promise<{ success: boolean; queued?: boolean }> => ({ success: true })
);
const clearUserActivity = mock(() => undefined);

let lastDialogProps: Record<string, unknown> | null = null;
let lastAnnotationProps: Record<string, unknown> | null = null;

const WidgetDialogStub = (props: ComponentProps<typeof WidgetDialog>) => {
  lastDialogProps = { ...props };
  return <div data-testid="widget-dialog" />;
};

const AnnotationCanvasStub = (props: ComponentProps<typeof AnnotationCanvas>) => {
  lastAnnotationProps = { ...props };
  return <div data-testid="annotation" />;
};

const appDeps = {
  WidgetDialog: WidgetDialogStub,
  AnnotationCanvas: AnnotationCanvasStub,
  captureScreenshot,
  captureContext,
  submitReport,
  clearUserActivity,
};

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
  clearUserActivity.mockClear();

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
      'button[aria-label="Report issue"]'
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

  it('keeps the widget open when saving a draft fails', async () => {
    const originalSave = draftStorage.save;
    draftStorage.save = async () => {
      throw new Error('storage quota exceeded');
    };
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?draft-save-failure');
    const container = document.createElement('div');
    document.body.appendChild(container);

    try {
      render(<App config={baseConfig} deps={appDeps} />, container);
      const launcher = container.querySelector(
        'button[aria-label="Report issue"]'
      ) as HTMLButtonElement;
      launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await flush();

      (lastDialogProps?.onFormDataChange as (data: WidgetFormData) => void)({
        title: 'Unsaved bug',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      });
      await flush();
      (lastDialogProps?.onClose as () => void)();
      await flush();

      const saveButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Save Draft'
      );
      saveButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await flush();
      await flush();

      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Failed to save the draft'
      );
    } finally {
      draftStorage.save = originalSave;
      render(null, container);
      container.remove();
    }
  });

  it('prefills reporter fields without treating defaults as unsaved content', async () => {
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?reporter-prefill');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const config = {
      ...baseConfig,
      reporterName: 'Current User',
      reporterEmail: 'current@example.com',
    };

    render(<App config={config} deps={appDeps} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]'
    ) as HTMLButtonElement;
    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    await flush();

    expect(lastDialogProps?.formData).toEqual({
      title: '',
      description: '',
      priority: 'medium',
      reporterEmail: 'current@example.com',
      reporterName: 'Current User',
    });

    const onClose = lastDialogProps?.onClose as () => void;
    onClose();
    await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    await flush();

    const onFormDataChange = lastDialogProps?.onFormDataChange as (data: unknown) => void;
    onFormDataChange({
      title: '',
      description: '',
      priority: 'medium',
      reporterEmail: 'current@example.com',
      reporterName: 'Edited User',
    });
    await flush();

    (lastDialogProps?.onClose as () => void)();
    await flush();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const discardButton = container.querySelector('[role="dialog"] button') as HTMLButtonElement;
    discardButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    await flush();
    expect(lastDialogProps?.formData).toEqual(
      expect.objectContaining({
        reporterEmail: 'current@example.com',
        reporterName: 'Current User',
      })
    );

    render(null, container);
    container.remove();
  });

  it('submits prefilled reporter values and restores them after success', async () => {
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?reporter-submit');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const config = {
      ...baseConfig,
      reporterName: 'Current User',
      reporterEmail: 'current@example.com',
    };

    render(<App config={config} deps={appDeps} />, container);
    const launcher = container.querySelector(
      'button[aria-label="Report issue"]'
    ) as HTMLButtonElement;
    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    await flush();

    const prefilledForm = lastDialogProps?.formData as WidgetFormData;
    const onSubmit = lastDialogProps?.onSubmit as (
      data: typeof prefilledForm,
      media: unknown[]
    ) => Promise<void>;
    await onSubmit({ ...prefilledForm, title: 'Bug title' }, []);
    await flush();

    expect(submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterEmail: 'current@example.com',
        reporterName: 'Current User',
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      })
    );

    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    await flush();
    expect(lastDialogProps?.formData).toEqual(
      expect.objectContaining({
        reporterEmail: 'current@example.com',
        reporterName: 'Current User',
      })
    );

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
      'button[aria-label="Report issue"]'
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
      'button[aria-label="Report issue"]'
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
      'button[aria-label="Report issue"]'
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

  it.each([true, false])(
    'shows portal success only for delivered submissions (queued %s)',
    async (queued) => {
      submitReport.mockImplementationOnce(async () => ({ success: true, queued }));
      const { App } = await import('../../components/App');
      const container = document.createElement('div');
      document.body.appendChild(container);
      const portalUrl = 'https://feedback.example.test/reporter-portal/';
      render(<App config={{ ...baseConfig, portalUrl }} deps={appDeps} />, container);
      const launcher = container.querySelector(
        'button[aria-label="Report issue"]'
      ) as HTMLButtonElement;
      launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await flush();
      await flush();
      await (
        lastDialogProps?.onSubmit as (data: WidgetFormData, media: unknown[]) => Promise<void>
      )(
        {
          title: 'Bug title',
          description: '',
          priority: 'medium',
          reporterEmail: 'jane@example.com',
          reporterName: '',
        },
        []
      );
      await flush();
      if (queued) {
        expect(container.querySelector('[data-testid="widget-dialog"]')).toBeNull();
        expect(container.querySelector('[role="alert"]')?.textContent).toContain(
          t('submit.queued')
        );
      } else {
        expect(lastDialogProps?.submitted).toBe(true);
        expect(lastDialogProps?.submittedWithEmail).toBe(true);
        expect(lastDialogProps?.portalUrl).toBe(portalUrl);
        expect(container.querySelector('[role="alert"]')).toBeNull();
        (lastDialogProps?.onClose as () => void)();
        await flush();
        expect(container.querySelector('[data-testid="widget-dialog"]')).toBeNull();
      }
      render(null, container);
      container.remove();
    }
  );

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
      'button[aria-label="Report issue"]'
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
      []
    );
    await flush();
    await flush();

    const toast = container.querySelector('[role="alert"]');
    expect(toast?.textContent ?? '').toContain('submit failed');

    render(null, container);
    container.remove();
  });

  it('cancels an in-flight upload without showing an error', async () => {
    submitReport.mockImplementationOnce(
      async (_input: SubmitReportInput, options?: SendOptions) =>
        await new Promise<never>((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Upload canceled', 'AbortError'));
          });
        })
    );
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?cancel-upload');
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]'
    ) as HTMLButtonElement;
    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    const submission = (
      lastDialogProps?.onSubmit as (data: WidgetFormData, media: unknown[]) => Promise<void>
    )(
      {
        title: 'Bug title',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      []
    );
    await flush();
    expect(lastDialogProps?.isSubmitting).toBe(true);

    (lastDialogProps?.onCancelSubmit as () => void)();
    await submission;
    await flush();

    expect(lastDialogProps?.isSubmitting).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    render(null, container);
    container.remove();
  });

  it('reuses the submission ID on retry and announces a queued report', async () => {
    submitReport.mockImplementationOnce(async () => {
      throw new Error(t('submit.error.rejected'));
    });
    submitReport.mockImplementationOnce(async () => ({ success: true, queued: true }));
    // @ts-expect-error - Query params in import for test isolation
    const { App } = await import('../../components/App?submission-id');
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(<App config={baseConfig} deps={appDeps} />, container);

    const launcher = container.querySelector(
      'button[aria-label="Report issue"]'
    ) as HTMLButtonElement;
    const form: WidgetFormData = {
      title: 'Bug title',
      description: '',
      priority: 'medium',
      reporterEmail: '',
      reporterName: '',
    };
    const submit = async () => {
      await (
        lastDialogProps?.onSubmit as (data: WidgetFormData, media: unknown[]) => Promise<void>
      )(form, []);
      await flush();
    };
    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();

    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      t('submit.error.rejected')
    );
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(t('submit.queued'));
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(
      t('toast.success.submit')
    );

    launcher.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await flush();
    await submit();

    const ids = submitReport.mock.calls.map(([input]) => input.submissionId);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(ids[1]).toBe(ids[0] as string);
    expect(ids[2]).not.toBe(ids[0] as string);

    render(null, container);
    container.remove();
  });
});
