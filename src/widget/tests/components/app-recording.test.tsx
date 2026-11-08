import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { render } from 'preact';
import type { WidgetConfig } from '../../config';
import type { CapturedMedia } from '../../components/ScreenshotManager';
import type { RecorderOptions, RecordingResult, RecordingSession } from '../../capture/recorder';
import { installDom } from '../helpers/dom';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';
import { draftStorage } from '../../storage/draft-storage';
import type { RecordingDependencies } from '../../hooks/use-screen-recording';
import { submitReport as submitReportApi } from '../../api/submit';
import { t } from '../../i18n/index';

const CONSENT_KEY = 'bugpin-skip-recording-consent';
const originalSetTimeout = globalThis.setTimeout;

class FakeTrack {
  readyState: MediaStreamTrackState = 'live';
  stopCount = 0;
  displaySurface = 'browser';
  private listeners = new Set<() => void>();

  stop(): void {
    this.stopCount++;
    this.readyState = 'ended';
  }

  getSettings(): MediaTrackSettings {
    return { displaySurface: this.displaySurface };
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: () => void): void {
    this.listeners.delete(listener);
  }

  end(): void {
    this.readyState = 'ended';
    [...this.listeners].forEach((listener) => listener());
  }
}

function makeStream(track: FakeTrack): MediaStream {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function makeSession() {
  let resolveFinished!: (result: RecordingResult | null) => void;
  const finished = new Promise<RecordingResult | null>((resolve) => {
    resolveFinished = resolve;
  });
  const session = {
    mimeType: 'video/webm',
    hasAudio: false,
    pause: mock(() => undefined),
    resume: mock(() => undefined),
    stop: mock(() => undefined),
    discard: mock(() => undefined),
    finished,
  } satisfies RecordingSession;
  return { session, resolveFinished };
}

function makeResult(size: number): RecordingResult {
  return {
    blob: new Blob([new Uint8Array(size)], { type: 'video/webm' }),
    mimeType: 'video/webm',
    durationMs: 4000,
    width: 1280,
    height: 720,
    hasAudio: false,
  };
}

let dialogProps: Record<string, unknown> | null = null;
const WidgetDialogStub = (props: Record<string, unknown>) => {
  dialogProps = props;
  return <div data-testid="widget-dialog" />;
};

let restoreDom: (() => void) | null = null;
let container: HTMLElement;
let track: FakeTrack;
let current: ReturnType<typeof makeSession>;
let recorderOptions: RecorderOptions | null;
let requestRecordingStream: ReturnType<typeof mock<() => Promise<MediaStream>>>;
let requestMicrophoneTrack: ReturnType<typeof mock<() => Promise<MediaStreamTrack | null>>>;
let startRecording: ReturnType<
  typeof mock<
    (stream: MediaStream, mic: MediaStreamTrack | null, o: RecorderOptions) => RecordingSession
  >
>;
let recoveryStore: RecordingDependencies['recordingStore'];
let isDisplayCaptureAllowed: ReturnType<typeof mock<() => boolean>>;
let submitReport: ReturnType<typeof mock<typeof submitReportApi>>;

let config: WidgetConfig;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => originalSetTimeout(resolve, 0));
  }
}

async function renderOpenApp(overrides: Partial<WidgetConfig> = {}, supported = true) {
  // @ts-expect-error - Query params in import for test isolation
  const { App } = await import('../../components/App?app-recording');
  render(
    <App
      config={{ ...config, ...overrides }}
      deps={{
        WidgetDialog: WidgetDialogStub,
        isRecordingSupported: () => supported,
        requestRecordingStream,
        requestMicrophoneTrack,
        startRecording,
        recordingStore: recoveryStore,
        isDisplayCaptureAllowed,
        submitReport,
      }}
    />,
    container
  );
  await flush();
  document.dispatchEvent(new window.CustomEvent('bugpin:open'));
  await flush();
}

async function renderClosedApp(overrides: Partial<WidgetConfig> = {}, supported = true) {
  // @ts-expect-error - Query params in import for test isolation
  const { App } = await import('../../components/App?app-recording');
  render(
    <App
      config={{ ...config, ...overrides }}
      deps={{
        WidgetDialog: WidgetDialogStub,
        isRecordingSupported: () => supported,
        requestRecordingStream,
        requestMicrophoneTrack,
        startRecording,
        recordingStore: recoveryStore,
        isDisplayCaptureAllowed,
        submitReport,
      }}
    />,
    container
  );
  await flush();
}

function startFromDialog(): void {
  (dialogProps?.onStartRecording as () => void)();
}

async function reachRecording(): Promise<void> {
  startFromDialog();
  await beginFromBar();
}

async function beginFromBar(): Promise<void> {
  for (let i = 0; i < 100 && !button(t('recording.record')); i++) await flush();
  button(t('recording.record'))?.click();
  for (let i = 0; i < 100 && startRecording.mock.calls.length === 0; i++) {
    await flush();
  }
  await flush();
}

const launcher = () => container.querySelector('button[aria-label="Report issue"]');
const dialog = () => container.querySelector('[data-testid="widget-dialog"]');
const bar = () => container.querySelector('[data-bugpin-exclude]');
const button = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const toast = () => container.querySelector('[role="alert"]')?.textContent ?? null;
const clips = () => dialogProps?.media as CapturedMedia[];

beforeEach(async () => {
  restoreDom = installDom();
  const { defaultConfig } = await import('../../config');
  config = {
    ...defaultConfig,
    apiKey: 'proj_key',
    serverUrl: 'https://example.com',
    enableScreenRecording: true,
    allowRecordingMicrophone: true,
    maxRecordingDurationSeconds: 90,
    maxVideoUploadSize: 10 * 1024 * 1024,
    buttonText: { project: { en: 'Report issue' }, global: null, builtin: null },
  };
  installFakeIndexedDB();
  localStorage.clear();
  localStorage.setItem(CONSENT_KEY, 'true');
  dialogProps = null;
  recorderOptions = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  track = new FakeTrack();
  current = makeSession();
  requestRecordingStream = mock(async () => makeStream(track));
  requestMicrophoneTrack = mock(async () => null);
  startRecording = mock((_stream, _microphone, options) => {
    recorderOptions = options;
    return current.session;
  });
  recoveryStore = {
    isStartBlocked: mock(() => false),
    begin: mock(async () => 'recording-session'),
    addChunk: mock(async () => undefined),
    touch: mock(() => undefined),
    release: mock(() => undefined),
    remove: mock(async () => undefined),
    recover: mock(async () => null),
    expire: mock(async () => false),
  };
  submitReport = mock(async () => ({ success: true, reportId: 'report-1' }));
  isDisplayCaptureAllowed = mock(() => true);
  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
  // The countdown steps once per second, so it runs on the next tick here.
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) =>
    originalSetTimeout(handler, timeout === 1000 ? 0 : timeout)) as typeof setTimeout;
});

afterEach(() => {
  render(null, container);
  restoreDom?.();
  restoreDom = null;
  globalThis.setTimeout = originalSetTimeout;
  mock.restore();
});

describe('App screen recording', () => {
  it('waits for media expiry before loading an opened draft', async () => {
    let finishExpiry: (() => void) | undefined;
    const expiry = new Promise<boolean>((resolve) => {
      finishExpiry = () => resolve(false);
    });
    const expire = spyOn(draftStorage, 'expireMedia').mockImplementation(() => expiry);
    const load = spyOn(draftStorage, 'load');

    await renderOpenApp({ enableScreenRecording: false });
    expect(expire).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(0);

    finishExpiry?.();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('offers the tab only when enabled and supported', async () => {
    await renderOpenApp();
    expect(dialogProps?.recordingEnabled).toBe(true);
    render(null, container);

    await renderOpenApp({ enableScreenRecording: false });
    expect(dialogProps?.recordingEnabled).toBe(false);
    render(null, container);

    await renderOpenApp({}, false);
    expect(dialogProps?.recordingEnabled).toBe(false);
  });

  it('saves a recovered clip to the draft and clears its launcher badge on open', async () => {
    recoveryStore.recover = mock(async () => ({
      sessionId: 'recovered-session',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' }),
      mimeType: 'video/webm',
      durationMs: 2000,
      startedAt: new Date().toISOString(),
      hasAudio: false,
    }));

    await renderClosedApp();

    expect(container.querySelector('[data-testid="bugpin-pending-recording"]')).not.toBeNull();
    expect(toast()).toContain(t('recording.recovered'));
    expect(recoveryStore.remove).toHaveBeenCalledWith('proj_key', 'recovered-session');

    document.dispatchEvent(new window.CustomEvent('bugpin:open'));
    await flush();
    expect(container.querySelector('[data-testid="bugpin-pending-recording"]')).toBeNull();
    expect(clips()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'recording-recovered-session',
          source: 'recording',
          recovered: true,
        }),
      ])
    );
  });

  it('keeps a recovered clip visible when saving it to the draft fails', async () => {
    recoveryStore.recover = mock(async () => ({
      sessionId: 'failed-recovery-save',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' }),
      mimeType: 'video/webm',
      durationMs: 2000,
      startedAt: new Date().toISOString(),
      hasAudio: false,
    }));
    spyOn(draftStorage, 'save').mockRejectedValue(new Error('Quota exceeded'));

    await renderClosedApp();

    expect(container.querySelector('[data-testid="bugpin-pending-recording"]')).not.toBeNull();
    document.dispatchEvent(new window.CustomEvent('bugpin:open'));
    await flush();
    expect(clips()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'recording-failed-recovery-save', recovered: true }),
      ])
    );
    expect(toast()).toContain('Failed to save the draft');
    expect(recoveryStore.remove).toHaveBeenCalledTimes(0);
  });

  it('does not duplicate a completed clip recovered before cleanup finishes', async () => {
    const clip: CapturedMedia = {
      id: 'recording-same-session',
      blob: new Blob([new Uint8Array([1])], { type: 'video/webm' }),
      timestamp: new Date(),
      annotated: false,
      mimeType: 'video/webm',
      source: 'recording',
    };
    await draftStorage.save(
      'proj_key',
      {
        title: 'Existing recording',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      'recording',
      [clip]
    );
    recoveryStore.recover = mock(async () => ({
      sessionId: 'same-session',
      blob: new Blob([new Uint8Array([1])], { type: 'video/webm' }),
      mimeType: 'video/webm',
      durationMs: 2000,
      startedAt: new Date().toISOString(),
      hasAudio: false,
    }));

    await renderClosedApp();

    document.dispatchEvent(new window.CustomEvent('bugpin:open'));
    await flush();
    expect(clips().filter((item) => item.id === 'recording-same-session')).toHaveLength(1);
  });

  it('does not submit hidden recording drafts when the feature is disabled', async () => {
    await renderOpenApp({ enableScreenRecording: false });
    const hiddenRecording: CapturedMedia = {
      id: 'hidden-recording',
      blob: new Blob([new Uint8Array([1])], { type: 'video/webm' }),
      timestamp: new Date(),
      annotated: false,
      mimeType: 'video/webm',
      source: 'recording',
    };

    await (
      dialogProps?.onSubmit as (
        formData: Record<string, string>,
        media: CapturedMedia[]
      ) => Promise<void>
    )(
      {
        title: 'Hidden recording',
        description: '',
        priority: 'medium',
        reporterEmail: '',
        reporterName: '',
      },
      [hiddenRecording]
    );

    expect(submitReport).toHaveBeenCalledTimes(1);
    expect(submitReport.mock.calls[0]?.[0].media).toEqual([]);
  });

  it('shows consent on first use and requests the stream from the confirm click', async () => {
    localStorage.removeItem(CONSENT_KEY);
    await renderOpenApp();

    startFromDialog();
    await flush();
    expect(dialogProps?.showScreenCaptureConsent).toBe(true);
    expect(dialogProps?.consentMode).toBe('recording');
    expect(requestRecordingStream).toHaveBeenCalledTimes(0);

    (dialogProps?.onConsentConfirm as () => void)();
    expect(requestRecordingStream).toHaveBeenCalledTimes(1);
  });

  it('returns to the screenshot consent mode after canceling', async () => {
    localStorage.removeItem(CONSENT_KEY);
    await renderOpenApp();

    startFromDialog();
    await flush();
    (dialogProps?.onConsentCancel as () => void)();
    await flush();

    expect(dialogProps?.showScreenCaptureConsent).toBe(false);
    expect(dialogProps?.consentMode).toBe('screenshot');
    expect(requestRecordingStream).toHaveBeenCalledTimes(0);
  });

  it('requests the stream synchronously to keep user activation', async () => {
    await renderOpenApp();

    startFromDialog();

    expect(requestRecordingStream).toHaveBeenCalledTimes(1);
  });

  it('saves the draft before hiding the dialog, then records with the bar', async () => {
    const save = spyOn(draftStorage, 'save');
    await renderOpenApp();
    (dialogProps?.onFormDataChange as (data: unknown) => void)({
      title: 'Broken',
      description: '',
      priority: 'medium',
      reporterEmail: '',
      reporterName: '',
    });
    await flush();

    await reachRecording();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1]).toMatchObject({ title: 'Broken' });
    expect(save.mock.calls[0]?.[2]).toBe('recording');
    expect(dialog()).toBeNull();
    expect(launcher()).toBeNull();
    expect(bar()).not.toBeNull();
    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(recorderOptions?.maxDurationMs).toBe(90_000);
    expect(recorderOptions?.maxBytes).toBe(8 * 1024 * 1024);
  });

  it('keeps a usable byte limit when the upload limit is below the margin', async () => {
    await renderOpenApp({ maxVideoUploadSize: 1024 * 1024 });

    await reachRecording();

    expect(recorderOptions?.maxBytes).toBe(512 * 1024);
  });

  it('adds the clip and restores the form when recording stops', async () => {
    const save = spyOn(draftStorage, 'save');
    await renderOpenApp();
    await reachRecording();

    button(t('recording.stop'))?.click();
    expect(current.session.stop).toHaveBeenCalledTimes(1);
    current.resolveFinished(makeResult(100));
    await flush();

    expect(dialog()).not.toBeNull();
    expect(launcher()).not.toBeNull();
    expect(bar()).toBeNull();
    expect(dialogProps?.activeTab).toBe('recording');
    expect(clips()).toHaveLength(1);
    expect(clips()[0]).toMatchObject({
      id: 'recording-recording-session',
      source: 'recording',
      mimeType: 'video/webm',
      durationMs: 4000,
      width: 1280,
      height: 720,
    });
    expect(clips()[0]?.blob?.size).toBe(100);
    const completedSave = save.mock.calls[save.mock.calls.length - 1];
    expect(completedSave?.[2]).toBe('recording');
    expect(completedSave?.[3]).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'recording' })])
    );
    expect(recoveryStore.remove).toHaveBeenCalledWith('proj_key', 'recording-session');
  });

  it('releases recovery storage when the completed clip cannot be saved', async () => {
    await renderOpenApp();
    await reachRecording();
    spyOn(draftStorage, 'save').mockRejectedValue(new Error('Quota exceeded'));

    current.resolveFinished(makeResult(100));
    await flush();

    expect(clips()).toHaveLength(1);
    expect(toast()).toContain(t('toast.error.draftSave'));
    expect(recoveryStore.release).toHaveBeenCalledWith('recording-session');
    expect(recoveryStore.remove).toHaveBeenCalledTimes(0);
    expect(dialogProps?.isRecordingStarting).toBe(false);
  });

  it('forgets the stored recording once the report is submitted', async () => {
    await renderOpenApp();
    await reachRecording();
    recoveryStore.remove = mock(async () => undefined);
    spyOn(draftStorage, 'save').mockRejectedValue(new Error('Quota exceeded'));
    current.resolveFinished(makeResult(100));
    await flush();
    expect(recoveryStore.remove).toHaveBeenCalledTimes(0);

    await (dialogProps?.onSubmit as (formData: unknown, media: CapturedMedia[]) => Promise<void>)(
      dialogProps?.formData,
      clips()
    );
    await flush();

    expect(submitReport).toHaveBeenCalledTimes(1);
    expect(recoveryStore.remove).toHaveBeenCalledWith('proj_key', 'recording-session');
  });

  it('forgets the stored recording when its clip is removed', async () => {
    await renderOpenApp();
    await reachRecording();
    current.resolveFinished(makeResult(100));
    await flush();
    recoveryStore.remove = mock(async () => undefined);

    (dialogProps?.onRemoveMedia as (id: string) => void)('recording-recording-session');
    await flush();

    expect(clips()).toHaveLength(0);
    expect(recoveryStore.remove).toHaveBeenCalledWith('proj_key', 'recording-session');
  });

  it('does not restore a removed clip from the saved draft after closing', async () => {
    await renderOpenApp();
    await reachRecording();
    current.resolveFinished(makeResult(100));
    await flush();
    expect((await draftStorage.load('proj_key'))?.media).toHaveLength(1);

    (dialogProps?.onRemoveMedia as (id: string) => void)('recording-recording-session');
    await flush();
    expect((await draftStorage.load('proj_key'))?.media).toEqual([]);

    document.dispatchEvent(new window.CustomEvent('bugpin:close'));
    await flush();
    expect(dialog()).toBeNull();
    document.dispatchEvent(new window.CustomEvent('bugpin:open'));
    await flush();

    expect(clips()).toEqual([]);
  });

  it('does not restore a removed clip on the next page', async () => {
    await renderOpenApp();
    await reachRecording();
    current.resolveFinished(makeResult(100));
    await flush();
    (dialogProps?.onRemoveMedia as (id: string) => void)('recording-recording-session');
    await flush();

    render(null, container);
    dialogProps = null;
    await renderOpenApp();

    expect(dialog()).not.toBeNull();
    expect(clips()).toEqual([]);
  });

  it('keeps the remaining clips in the saved draft when one is removed', async () => {
    await renderOpenApp();
    await reachRecording();
    current.resolveFinished(makeResult(100));
    await flush();
    const kept: CapturedMedia = {
      id: 'capture-kept',
      dataUrl: 'data:image/png;base64,AA==',
      timestamp: new Date(),
      annotated: false,
      mimeType: 'image/png',
    };
    (dialogProps?.onAddMedia as (item: CapturedMedia) => void)(kept);
    await flush();

    (dialogProps?.onRemoveMedia as (id: string) => void)('recording-recording-session');
    await flush();

    expect((await draftStorage.load('proj_key'))?.media.map((item) => item.id)).toEqual([
      'capture-kept',
    ]);
  });

  it('recovers a recording abandoned in another tab when the widget opens', async () => {
    let calls = 0;
    recoveryStore.recover = mock(async () => {
      calls += 1;
      if (calls !== 2) return null;
      return {
        sessionId: 'other-tab',
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' }),
        mimeType: 'video/webm',
        durationMs: 2000,
        startedAt: new Date().toISOString(),
        hasAudio: false,
      };
    });

    await renderOpenApp();

    expect(clips()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'recording-other-tab' })])
    );
    expect(recoveryStore.remove).toHaveBeenCalledWith('proj_key', 'other-tab');
  });

  it('explains when the page does not allow screen recording', async () => {
    isDisplayCaptureAllowed = mock(() => false);
    await renderOpenApp();

    startFromDialog();
    await flush();

    expect(requestRecordingStream).toHaveBeenCalledTimes(0);
    expect(toast()).toContain(t('recording.error.unavailable'));
  });

  it('waits for completed recording cleanup before allowing another recording', async () => {
    let finishCleanup: (() => void) | undefined;
    recoveryStore.remove = mock(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );
    await renderOpenApp();
    await reachRecording();

    current.resolveFinished(makeResult(100));
    await flush();

    expect(dialogProps?.isRecordingStarting).toBe(true);
    startFromDialog();
    await flush();
    expect(startRecording).toHaveBeenCalledTimes(1);

    finishCleanup?.();
    await flush();
    expect(dialogProps?.isRecordingStarting).toBe(false);

    track = new FakeTrack();
    current = makeSession();
    startFromDialog();
    await beginFromBar();
    for (let i = 0; i < 100 && startRecording.mock.calls.length < 2; i++) {
      await flush();
    }
    expect(startRecording).toHaveBeenCalledTimes(2);
  });

  it('writes chunks to recovery storage while recording', async () => {
    await renderOpenApp();
    await reachRecording();

    recorderOptions?.onTick?.(1250, 3);
    await recorderOptions?.onChunk?.(new Blob([new Uint8Array([1, 2, 3])]), 0);

    expect(recoveryStore.begin).toHaveBeenCalledWith({
      apiKey: 'proj_key',
      ownerEmail: undefined,
      mimeType: 'video/webm',
      hasAudio: false,
    });
    expect(recoveryStore.addChunk).toHaveBeenCalledWith(
      'recording-session',
      0,
      expect.any(Blob),
      1250
    );
    expect(recoveryStore.touch).toHaveBeenCalledWith('recording-session');
  });

  it('captures chunk duration before waiting for recovery storage', async () => {
    let finishBegin: ((sessionId: string) => void) | undefined;
    recoveryStore.begin = mock(
      () =>
        new Promise<string>((resolve) => {
          finishBegin = resolve;
        })
    );
    await renderOpenApp();
    await reachRecording();

    recorderOptions?.onTick?.(1250, 3);
    const write = recorderOptions?.onChunk?.(new Blob([new Uint8Array([1])]), 0);
    recorderOptions?.onTick?.(2500, 4);
    finishBegin?.('delayed-session');
    await write;

    expect(recoveryStore.addChunk).toHaveBeenCalledWith(
      'delayed-session',
      0,
      expect.any(Blob),
      1250
    );
  });

  it('continues recording when recovery storage is unavailable', async () => {
    recoveryStore.begin = mock(async () => null);
    await renderOpenApp();
    await reachRecording();

    await recorderOptions?.onChunk?.(new Blob([new Uint8Array([1])]), 0);

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(recoveryStore.addChunk).toHaveBeenCalledTimes(0);
  });

  it('adds no clip when the recording is discarded', async () => {
    await renderOpenApp();
    await reachRecording();

    button(t('recording.discard'))?.click();
    expect(current.session.discard).toHaveBeenCalledTimes(1);
    current.resolveFinished(null);
    await flush();

    expect(clips()).toHaveLength(0);
    expect(dialog()).not.toBeNull();
    expect(toast()).toBeNull();
    expect(recoveryStore.remove).toHaveBeenCalledWith('proj_key', 'recording-session');
  });

  it('forwards pause and resume to the session', async () => {
    await renderOpenApp();
    await reachRecording();

    button(t('recording.pause'))?.click();
    await flush();
    expect(current.session.pause).toHaveBeenCalledTimes(1);

    button(t('recording.resume'))?.click();
    await flush();
    expect(current.session.resume).toHaveBeenCalledTimes(1);
    expect(button(t('recording.pause'))).not.toBeNull();
  });

  it('rejects an empty recording with a toast', async () => {
    await renderOpenApp();
    await reachRecording();

    current.resolveFinished(makeResult(0));
    await flush();

    expect(clips()).toHaveLength(0);
    expect(toast()).toContain(t('recording.error.empty'));
  });

  it('keeps the failure toast when a failed recording is empty', async () => {
    await renderOpenApp();
    await reachRecording();

    recorderOptions?.onAutoStop?.('error');
    current.resolveFinished(makeResult(0));
    await flush();

    expect(toast()).toContain(t('recording.error.failed'));
  });

  it('keeps a clip over the upload limit and reports it', async () => {
    await renderOpenApp({ maxVideoUploadSize: 1024 * 1024 });
    await reachRecording();

    current.resolveFinished(makeResult(2 * 1024 * 1024));
    await flush();

    expect(clips()).toHaveLength(1);
    expect(dialogProps?.oversizedRecording).toMatchObject({ sizeMb: 2, limitMb: 1 });

    (dialogProps?.onRemoveMedia as (id: string) => void)(clips()[0]?.id ?? '');
    await flush();
    expect(dialogProps?.oversizedRecording).toBeNull();
  });

  it.each([
    ['duration', () => t('recording.stopped.duration', { duration: '1.5 minutes' })],
    ['size', () => t('recording.stopped.size', { size: 10 })],
    ['error', () => t('recording.error.failed')],
  ] as const)('shows a toast for the %s auto-stop', async (reason, message) => {
    await renderOpenApp();
    await reachRecording();

    recorderOptions?.onAutoStop?.(reason);
    await flush();

    expect(toast()).toContain(message());
  });

  it('keeps non-round duration limits exact', async () => {
    await renderOpenApp({ maxRecordingDurationSeconds: 61 });
    await reachRecording();

    recorderOptions?.onAutoStop?.('duration');
    await flush();

    expect(toast()).toContain(
      t('recording.stopped.duration', {
        duration: new Intl.NumberFormat('en', {
          style: 'unit',
          unit: 'second',
          unitDisplay: 'long',
        }).format(61),
      })
    );
  });

  it('shows no toast when sharing ends', async () => {
    await renderOpenApp();
    await reachRecording();

    recorderOptions?.onAutoStop?.('ended');
    await flush();

    expect(toast()).toBeNull();
  });

  it('stays on the form without a toast when the picker is canceled', async () => {
    requestRecordingStream = mock(async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    });
    await renderOpenApp();

    await reachRecording();

    expect(dialog()).not.toBeNull();
    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(toast()).toBeNull();
    expect(dialogProps?.isRecordingStarting).toBe(false);
  });

  it('reports other capture failures', async () => {
    requestRecordingStream = mock(async () => {
      throw new DOMException('Blocked', 'NotReadableError');
    });
    await renderOpenApp();

    await reachRecording();

    expect(dialog()).not.toBeNull();
    expect(toast()).toContain(t('recording.error.unavailable'));
  });

  it('continues without audio when the microphone is denied', async () => {
    await renderOpenApp();
    (dialogProps?.onIncludeMicrophoneChange as (value: boolean) => void)(true);
    await flush();

    await reachRecording();

    expect(requestMicrophoneTrack).toHaveBeenCalledTimes(1);
    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(startRecording.mock.calls[0]?.[1]).toBeNull();
    expect(toast()).toContain(t('recording.notice.noMicrophone'));
  });

  it('does not request the microphone unless the reporter opted in', async () => {
    await renderOpenApp();

    await reachRecording();

    expect(requestMicrophoneTrack).toHaveBeenCalledTimes(0);
  });

  it('resets the microphone option after each recording', async () => {
    await renderOpenApp();
    (dialogProps?.onIncludeMicrophoneChange as (value: boolean) => void)(true);
    await flush();
    await reachRecording();

    current.resolveFinished(makeResult(10));
    await flush();

    expect(dialogProps?.includeMicrophone).toBe(false);
  });

  it('keeps the dialog open and stops tracks when the draft cannot be saved', async () => {
    spyOn(draftStorage, 'save').mockImplementation(async () => {
      throw new Error('Quota exceeded');
    });
    const microphone = new FakeTrack();
    requestMicrophoneTrack = mock(async () => microphone as unknown as MediaStreamTrack);
    await renderOpenApp();
    (dialogProps?.onIncludeMicrophoneChange as (value: boolean) => void)(true);
    await flush();

    await reachRecording();

    expect(dialog()).not.toBeNull();
    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(track.stopCount).toBeGreaterThan(0);
    expect(microphone.stopCount).toBeGreaterThan(0);
    expect(toast()).not.toBeNull();
  });

  it('waits for the bar record button before starting the countdown', async () => {
    await renderOpenApp();
    startFromDialog();
    for (let i = 0; i < 100 && !button(t('recording.record')); i++) await flush();

    expect(button(t('recording.record'))).not.toBeNull();
    expect(bar()?.textContent).not.toContain(t('recording.countdown', { seconds: 3 }));
    expect(startRecording).toHaveBeenCalledTimes(0);
    track.end();
    await flush();
    expect(dialog()).not.toBeNull();
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('returns to the form when sharing ends during the countdown', async () => {
    globalThis.setTimeout = originalSetTimeout;
    await renderOpenApp();

    await reachRecording();
    expect(bar()?.textContent).toContain(t('recording.countdown', { seconds: 3 }));
    track.end();
    await flush();

    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(dialog()).not.toBeNull();
    expect(bar()).toBeNull();
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('cancels from the bar during the countdown and stops tracks', async () => {
    globalThis.setTimeout = originalSetTimeout;
    await renderOpenApp();

    await reachRecording();
    button(t('recording.discard'))?.click();
    await flush();

    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(dialog()).not.toBeNull();
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('discards from the ready bar and stops tracks without recording', async () => {
    await renderOpenApp();
    startFromDialog();
    for (let i = 0; i < 100 && !button(t('recording.record')); i++) await flush();

    button(t('recording.discard'))?.click();
    await flush();

    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(dialog()).not.toBeNull();
    expect(bar()).toBeNull();
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('cancels the ready bar on bugpin:close and stops tracks', async () => {
    await renderOpenApp();
    startFromDialog();
    for (let i = 0; i < 100 && !button(t('recording.record')); i++) await flush();

    document.dispatchEvent(new window.CustomEvent('bugpin:close'));
    await flush();

    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(dialog()).not.toBeNull();
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('stops ready tracks when the widget unmounts', async () => {
    await renderOpenApp();
    startFromDialog();
    for (let i = 0; i < 100 && !button(t('recording.record')); i++) await flush();

    render(null, container);
    await flush();

    expect(startRecording).toHaveBeenCalledTimes(0);
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('returns to the form when the recorder cannot start', async () => {
    startRecording = mock(() => {
      throw new Error('No supported recording format');
    });
    await renderOpenApp();

    await reachRecording();

    expect(dialog()).not.toBeNull();
    expect(toast()).toContain(t('recording.error.failed'));
  });

  it('warns on the bar when the whole screen is shared', async () => {
    track.displaySurface = 'monitor';
    await renderOpenApp();

    await reachRecording();

    expect(bar()?.textContent).toContain(t('recording.warning.wholeScreen'));
  });

  it('ignores bugpin:open and stops on bugpin:close while recording', async () => {
    await renderOpenApp();
    await reachRecording();

    document.dispatchEvent(new window.CustomEvent('bugpin:open'));
    await flush();
    expect(dialog()).toBeNull();

    document.dispatchEvent(new window.CustomEvent('bugpin:close'));
    expect(current.session.stop).toHaveBeenCalledTimes(1);
  });

  it('discards the session when the widget unmounts', async () => {
    await renderOpenApp();
    await reachRecording();

    render(null, container);
    await flush();

    expect(current.session.discard).toHaveBeenCalledTimes(1);
  });

  it('keeps recovery storage when the page unloads during recording', async () => {
    await renderOpenApp();
    await reachRecording();

    window.dispatchEvent(new window.Event('pagehide'));
    render(null, container);
    current.resolveFinished(null);
    await Promise.resolve();

    expect(recoveryStore.remove).toHaveBeenCalledTimes(0);
  });
});
