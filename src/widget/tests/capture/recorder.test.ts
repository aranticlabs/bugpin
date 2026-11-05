import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  canRestrictCapture,
  isRecordingSupported,
  requestMicrophoneTrack,
  requestRecordingStream,
  restrictCaptureToPage,
  startRecording,
} from '../../capture/recorder';

const originalNavigator = globalThis.navigator;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const originalPerformanceNow = globalThis.performance.now;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

class FakeTrack {
  readonly kind: 'audio' | 'video';
  readyState: MediaStreamTrackState = 'live';
  stopCount = 0;
  private listeners = new Set<EventListener>();

  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }

  stop(): void {
    this.stopCount++;
    this.readyState = 'ended';
  }

  getSettings(): MediaTrackSettings {
    return this.kind === 'video' && this.readyState === 'live' ? { width: 1280, height: 720 } : {};
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'ended' && typeof listener === 'function') this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'ended' && typeof listener === 'function') this.listeners.delete(listener);
  }

  end(): void {
    this.readyState = 'ended';
    this.listeners.forEach((listener) => listener({} as Event));
  }
}

class FakeStream {
  private tracks: FakeTrack[];

  constructor(tracks: FakeTrack[]) {
    this.tracks = [...tracks];
  }

  getTracks(): MediaStreamTrack[] {
    return this.tracks as unknown as MediaStreamTrack[];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video') as unknown as MediaStreamTrack[];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio') as unknown as MediaStreamTrack[];
  }

  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track as unknown as FakeTrack);
  }
}

class FakeMediaRecorder {
  static supported = new Set<string>();
  static instances: FakeMediaRecorder[] = [];
  static supportChecks: string[] = [];
  static finalChunk = new Blob();
  static failConstruction = false;
  static failStart = false;
  static reportedMimeType: string | null = null;

  static isTypeSupported(mimeType: string): boolean {
    this.supportChecks.push(mimeType);
    return this.supported.has(mimeType);
  }

  readonly stream: MediaStream;
  readonly options: MediaRecorderOptions;
  mimeType: string;
  state: RecordingState = 'inactive';
  startTimeslice: number | undefined;
  pauseCount = 0;
  resumeCount = 0;
  omitStopEvent = false;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onpause: ((event: Event) => void) | null = null;
  onresume: ((event: Event) => void) | null = null;
  onstart: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  constructor(stream: MediaStream, options: MediaRecorderOptions = {}) {
    if (FakeMediaRecorder.failConstruction) throw new Error('constructor failed');
    this.stream = stream;
    this.options = options;
    this.mimeType = FakeMediaRecorder.reportedMimeType ?? options.mimeType ?? '';
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice?: number): void {
    if (FakeMediaRecorder.failStart) throw new Error('start failed');
    this.startTimeslice = timeslice;
    this.state = 'recording';
  }

  pause(): void {
    this.pauseCount++;
    this.state = 'paused';
  }

  resume(): void {
    this.resumeCount++;
    this.state = 'recording';
  }

  stop(): void {
    if (this.state === 'inactive') throw new DOMException('Inactive recorder', 'InvalidStateError');
    this.state = 'inactive';
    queueMicrotask(() => {
      this.emitChunk(FakeMediaRecorder.finalChunk);
      if (!this.omitStopEvent) this.onstop?.({} as Event);
    });
  }

  emitChunk(chunk: Blob): void {
    this.ondataavailable?.({ data: chunk } as BlobEvent);
  }

  fail(finalChunk: Blob): void {
    this.state = 'inactive';
    this.onerror?.({} as Event);
    queueMicrotask(() => {
      this.emitChunk(finalChunk);
      this.onstop?.({} as Event);
    });
  }
}

let now = 0;
let nextTimerId = 1;
let timers = new Map<number, () => void>();

function setMediaDevices(mediaDevices: Partial<MediaDevices>): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices },
  });
}

function makeVideoStream(): { stream: MediaStream; track: FakeTrack } {
  const track = new FakeTrack('video');
  return { stream: new FakeStream([track]) as unknown as MediaStream, track };
}

function runTimers(): void {
  [...timers.values()].forEach((callback) => callback());
}

beforeEach(() => {
  now = 0;
  nextTimerId = 1;
  timers = new Map();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supported = new Set(['video/mp4', 'video/webm']);
  FakeMediaRecorder.supportChecks = [];
  FakeMediaRecorder.finalChunk = new Blob();
  FakeMediaRecorder.failConstruction = false;
  FakeMediaRecorder.failStart = false;
  FakeMediaRecorder.reportedMimeType = null;
  globalThis.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder;
  setMediaDevices({ getDisplayMedia: async () => makeVideoStream().stream });
  globalThis.setInterval = ((callback: TimerHandler) => {
    const id = nextTimerId++;
    timers.set(id, callback as () => void);
    return id;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((id: number | undefined) => {
    if (id !== undefined) timers.delete(id);
  }) as unknown as typeof clearInterval;
  Object.defineProperty(globalThis.performance, 'now', {
    configurable: true,
    value: () => now,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  });
  globalThis.MediaRecorder = originalMediaRecorder;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  Object.defineProperty(globalThis.performance, 'now', {
    configurable: true,
    value: originalPerformanceNow,
  });
});

describe('screen recorder', () => {
  it('detects the required browser APIs and a supported video format', () => {
    expect(isRecordingSupported()).toBe(true);

    globalThis.MediaRecorder = undefined as unknown as typeof MediaRecorder;
    expect(isRecordingSupported()).toBe(false);
    globalThis.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder;

    globalThis.MediaRecorder = class {} as unknown as typeof MediaRecorder;
    expect(isRecordingSupported()).toBe(false);
    globalThis.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder;

    setMediaDevices({});
    expect(isRecordingSupported()).toBe(false);
    setMediaDevices({ getDisplayMedia: async () => makeVideoStream().stream });

    FakeMediaRecorder.supported.clear();
    expect(isRecordingSupported()).toBe(false);
  });

  it('requests the constrained display stream', async () => {
    const { stream } = makeVideoStream();
    let captured: DisplayMediaStreamOptions | undefined;
    setMediaDevices({
      getDisplayMedia: async (options) => {
        captured = options;
        return stream;
      },
    });

    expect(await requestRecordingStream()).toBe(stream);
    expect(captured?.audio).toBe(false);
    expect(captured?.video).toMatchObject({
      displaySurface: 'browser',
      frameRate: { ideal: 15, max: 30 },
      width: { max: 1920 },
      height: { max: 1080 },
    });
    expect(captured).toMatchObject({
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      monitorTypeSurfaces: 'exclude',
      surfaceSwitching: 'exclude',
    });
  });

  it('requests the resolution and frame rate of the chosen quality', async () => {
    let captured: DisplayMediaStreamOptions | undefined;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getDisplayMedia: async (options: DisplayMediaStreamOptions) => {
            captured = options;
            return {} as MediaStream;
          },
        },
      },
    });

    await requestRecordingStream('low');
    expect(captured?.video).toMatchObject({
      frameRate: { ideal: 10, max: 30 },
      width: { max: 1280 },
      height: { max: 720 },
    });

    await requestRecordingStream('high');
    expect(captured?.video).toMatchObject({
      frameRate: { ideal: 30, max: 30 },
      width: { max: 2560 },
      height: { max: 1440 },
    });
  });

  it('returns one microphone track, stops extras, and tolerates denial', async () => {
    const microphone = new FakeTrack('audio');
    const extra = new FakeTrack('audio');
    setMediaDevices({
      getUserMedia: async () => new FakeStream([microphone, extra]) as unknown as MediaStream,
    });

    expect(await requestMicrophoneTrack()).toBe(microphone as unknown as MediaStreamTrack);
    expect(extra.stopCount).toBe(1);

    setMediaDevices({ getUserMedia: async () => Promise.reject(new DOMException('Denied')) });
    expect(await requestMicrophoneTrack()).toBeNull();
  });

  it('selects the first supported format with and without microphone audio', async () => {
    FakeMediaRecorder.supported = new Set(['video/webm']);
    const videoOnly = makeVideoStream();
    const videoSession = startRecording(videoOnly.stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });
    const videoRecorder = FakeMediaRecorder.instances[0];
    expect(videoRecorder?.options.mimeType).toBe('video/webm');
    expect(FakeMediaRecorder.supportChecks).toEqual([
      'video/webm;codecs=vp9',
      'video/mp4;codecs=avc1.64003e',
      'video/mp4',
      'video/webm;codecs=vp8',
      'video/webm',
    ]);
    expect(videoRecorder?.options.videoBitsPerSecond).toBe(1_500_000);
    expect(videoRecorder?.options.audioBitsPerSecond).toBe(64_000);
    expect(
      (
        videoRecorder?.options as MediaRecorderOptions & {
          videoKeyFrameIntervalDuration?: number;
        }
      ).videoKeyFrameIntervalDuration
    ).toBe(2000);
    expect(videoRecorder?.startTimeslice).toBe(1000);
    videoSession.stop();
    expect((await videoSession.finished)?.mimeType).toBe('video/webm');

    FakeMediaRecorder.supportChecks = [];
    const withAudio = makeVideoStream();
    const microphone = new FakeTrack('audio');
    const audioSession = startRecording(
      withAudio.stream,
      microphone as unknown as MediaStreamTrack,
      { maxDurationMs: 10_000, maxBytes: 10_000 }
    );
    const audioRecorder = FakeMediaRecorder.instances[1];
    expect(audioRecorder?.options.mimeType).toBe('video/webm');
    expect(FakeMediaRecorder.supportChecks).toEqual([
      'video/webm;codecs=vp9,opus',
      'video/mp4;codecs=avc1.64003e,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.64003e,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]);
    audioSession.stop();
    const result = await audioSession.finished;
    expect(result?.mimeType).toBe('video/webm');
    expect(result?.hasAudio).toBe(true);
    expect(microphone.stopCount).toBeGreaterThan(0);
  });

  it('records microphone audio into plain MP4 when that is the only audio format', async () => {
    FakeMediaRecorder.supported = new Set(['video/mp4']);
    const { stream } = makeVideoStream();
    const microphone = new FakeTrack('audio');
    const session = startRecording(stream, microphone as unknown as MediaStreamTrack, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });

    expect(FakeMediaRecorder.instances[0]?.options.mimeType).toBe('video/mp4');
    expect(session.hasAudio).toBe(true);
    session.stop();
    expect((await session.finished)?.hasAudio).toBe(true);
  });

  it('falls back to video only when no format can carry the microphone', async () => {
    FakeMediaRecorder.supported = new Set(['video/webm;codecs=vp9']);
    const { stream } = makeVideoStream();
    const microphone = new FakeTrack('audio');
    const session = startRecording(stream, microphone as unknown as MediaStreamTrack, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });

    expect(FakeMediaRecorder.instances[0]?.options.mimeType).toBe('video/webm;codecs=vp9');
    expect(session.hasAudio).toBe(false);
    expect(microphone.stopCount).toBeGreaterThan(0);
    session.stop();
    expect((await session.finished)?.hasAudio).toBe(false);
  });

  it('uses the MIME type reported by the recorder for recovery metadata', async () => {
    FakeMediaRecorder.reportedMimeType = 'video/mp4;codecs=avc1.64003e';
    const { stream } = makeVideoStream();
    const session = startRecording(stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });

    expect(session.mimeType).toBe('video/mp4');
    session.stop();
    expect((await session.finished)?.mimeType).toBe('video/mp4');
  });

  it('reports no audio when the microphone ended before recording started', async () => {
    const { stream } = makeVideoStream();
    const microphone = new FakeTrack('audio');
    microphone.stop();
    const session = startRecording(stream, microphone as unknown as MediaStreamTrack, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });

    session.stop();
    expect((await session.finished)?.hasAudio).toBe(false);
  });

  it('resolves with an empty blob when no data arrived', async () => {
    const { stream } = makeVideoStream();
    const session = startRecording(stream, null, { maxDurationMs: 10_000, maxBytes: 10_000 });

    session.stop();
    expect((await session.finished)?.blob.size).toBe(0);
  });

  it('stops every track and timer after a recorder error', async () => {
    const { stream, track } = makeVideoStream();
    const microphone = new FakeTrack('audio');
    const session = startRecording(stream, microphone as unknown as MediaStreamTrack, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });

    FakeMediaRecorder.instances[0]?.fail(new Blob());

    await session.finished;
    expect(track.stopCount).toBeGreaterThan(0);
    expect(microphone.stopCount).toBeGreaterThan(0);
    expect(timers.size).toBe(0);
  });

  it('settles finished when the stop event never arrives', async () => {
    let finalizeCallback: (() => void) | undefined;
    globalThis.setTimeout = ((callback: () => void) => {
      finalizeCallback = callback;
      return 1;
    }) as unknown as typeof setTimeout;
    const { stream } = makeVideoStream();
    const session = startRecording(stream, null, { maxDurationMs: 10_000, maxBytes: 10_000 });
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error('Recorder was not created');
    recorder.omitStopEvent = true;
    recorder.emitChunk(new Blob([new Uint8Array([1])]));

    session.stop();
    await Promise.resolve();
    finalizeCallback?.();

    expect((await session.finished)?.blob.size).toBe(1);
    expect(timers.size).toBe(0);
  });

  it('stops from a paused state without counting paused time', async () => {
    const { stream, track } = makeVideoStream();
    const session = startRecording(stream, null, { maxDurationMs: 10_000, maxBytes: 10_000 });

    now = 1000;
    session.pause();
    now = 5000;
    session.stop();

    expect((await session.finished)?.durationMs).toBe(1000);
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('ignores repeated stops and lets discard win during stopping', async () => {
    const { stream } = makeVideoStream();
    const session = startRecording(stream, null, { maxDurationMs: 10_000, maxBytes: 10_000 });
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error('Recorder was not created');

    session.stop();
    session.stop();
    session.pause();
    session.resume();
    session.discard();

    expect(await session.finished).toBeNull();
    expect(recorder.pauseCount).toBe(0);
    expect(recorder.resumeCount).toBe(0);
  });

  it('checks the duration limit on chunks when timers are throttled', async () => {
    const { stream } = makeVideoStream();
    const reasons: string[] = [];
    const session = startRecording(stream, null, {
      maxDurationMs: 3000,
      maxBytes: 10_000,
      onAutoStop: (reason) => reasons.push(reason),
    });

    now = 3500;
    FakeMediaRecorder.instances[0]?.emitChunk(new Blob([new Uint8Array([1])]));

    expect((await session.finished)?.durationMs).toBe(3500);
    expect(reasons).toEqual(['duration']);
  });

  it('excludes paused time and auto-stops at the duration limit', async () => {
    const { stream, track } = makeVideoStream();
    const ticks: number[] = [];
    const reasons: string[] = [];
    const session = startRecording(stream, null, {
      maxDurationMs: 3000,
      maxBytes: 10_000,
      onTick: (elapsed) => ticks.push(elapsed),
      onAutoStop: (reason) => reasons.push(reason),
    });
    const recorder = FakeMediaRecorder.instances[0];

    now = 1000;
    runTimers();
    session.pause();
    now = 6000;
    runTimers();
    expect(ticks[ticks.length - 1]).toBe(1000);
    session.resume();
    now = 8000;
    runTimers();

    const result = await session.finished;
    expect(result?.durationMs).toBe(3000);
    expect(result?.width).toBe(1280);
    expect(result?.height).toBe(720);
    expect(reasons).toEqual(['duration']);
    expect(recorder?.pauseCount).toBe(1);
    expect(recorder?.resumeCount).toBe(1);
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('auto-stops at the byte limit and emits indexed chunks', async () => {
    const { stream, track } = makeVideoStream();
    const chunks: Array<{ size: number; index: number }> = [];
    const reasons: string[] = [];
    const session = startRecording(stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 3,
      onChunk: (chunk, index) => chunks.push({ size: chunk.size, index }),
      onAutoStop: (reason) => reasons.push(reason),
    });

    FakeMediaRecorder.instances[0]?.emitChunk(new Blob([new Uint8Array([1, 2, 3])]));

    const result = await session.finished;
    expect(result?.blob.size).toBe(3);
    expect(chunks).toEqual([{ size: 3, index: 0 }]);
    expect(reasons).toEqual(['size']);
    expect(track.stopCount).toBeGreaterThan(0);
  });

  it('keeps the final chunk on normal stop and recorder error', async () => {
    FakeMediaRecorder.finalChunk = new Blob([new Uint8Array([1, 2, 3])]);
    const normal = makeVideoStream();
    const normalSession = startRecording(normal.stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
    });
    normalSession.stop();
    const normalResult = await normalSession.finished;
    expect(normalResult?.blob.size).toBe(3);
    expect(normalResult?.width).toBe(1280);
    expect(normalResult?.height).toBe(720);

    FakeMediaRecorder.finalChunk = new Blob();
    const errored = makeVideoStream();
    const reasons: string[] = [];
    const errorSession = startRecording(errored.stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
      onAutoStop: (reason) => reasons.push(reason),
    });
    const recorder = FakeMediaRecorder.instances[1];
    recorder?.emitChunk(new Blob([new Uint8Array([1])]));
    recorder?.fail(new Blob([new Uint8Array([2, 3, 4])]));

    expect((await errorSession.finished)?.blob.size).toBe(4);
    expect(reasons).toEqual(['error']);
  });

  it('finishes when sharing ends and resolves null when discarded', async () => {
    const ended = makeVideoStream();
    const reasons: string[] = [];
    const endedSession = startRecording(ended.stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
      onAutoStop: (reason) => reasons.push(reason),
    });
    ended.track.end();
    const endedResult = await endedSession.finished;
    expect(endedResult?.width).toBe(1280);
    expect(endedResult?.height).toBe(720);
    expect(reasons).toEqual(['ended']);

    const discarded = makeVideoStream();
    const discardedChunks: number[] = [];
    FakeMediaRecorder.finalChunk = new Blob([new Uint8Array([9, 9])]);
    const discardedSession = startRecording(discarded.stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
      onChunk: (chunk) => discardedChunks.push(chunk.size),
    });
    discardedSession.discard();
    expect(await discardedSession.finished).toBeNull();
    expect(discardedChunks).toEqual([]);
    expect(discarded.track.stopCount).toBeGreaterThan(0);
  });

  it('stops every track when construction or start fails', () => {
    FakeMediaRecorder.failConstruction = true;
    const construction = makeVideoStream();
    expect(() =>
      startRecording(construction.stream, null, {
        maxDurationMs: 10_000,
        maxBytes: 10_000,
      })
    ).toThrow('constructor failed');
    expect(construction.track.stopCount).toBeGreaterThan(0);

    FakeMediaRecorder.failConstruction = false;
    FakeMediaRecorder.failStart = true;
    const start = makeVideoStream();
    const microphone = new FakeTrack('audio');
    expect(() =>
      startRecording(start.stream, microphone as unknown as MediaStreamTrack, {
        maxDurationMs: 10_000,
        maxBytes: 10_000,
      })
    ).toThrow('start failed');
    expect(start.track.stopCount).toBeGreaterThan(0);
    expect(microphone.stopCount).toBeGreaterThan(0);
    expect(timers.size).toBe(0);
  });

  it('stops every track when no recording format is supported', () => {
    FakeMediaRecorder.supported.clear();
    const { stream, track } = makeVideoStream();
    const microphone = new FakeTrack('audio');

    expect(() =>
      startRecording(stream, microphone as unknown as MediaStreamTrack, {
        maxDurationMs: 10_000,
        maxBytes: 10_000,
      })
    ).toThrow('No supported recording format');
    expect(track.stopCount).toBeGreaterThan(0);
    expect(microphone.stopCount).toBeGreaterThan(0);
  });

  it('records at the bitrate of the chosen quality', () => {
    FakeMediaRecorder.supported.add('video/webm');
    const { stream } = makeVideoStream();

    const session = startRecording(stream, null, {
      maxDurationMs: 10_000,
      maxBytes: 10_000,
      quality: 'high',
    });

    const [recorder] = FakeMediaRecorder.instances.slice(-1);
    expect(recorder.options.videoBitsPerSecond).toBe(4_000_000);
    session.discard();
  });
});

describe('restrictCaptureToPage', () => {
  const originalDocument = globalThis.document;
  const documentElement = { tagName: 'HTML' };
  const scope = globalThis as unknown as { RestrictionTarget?: unknown; document: unknown };

  const restrictableTrack = (restrictTo: (target: unknown) => Promise<void>) =>
    Object.assign(new FakeTrack('video'), { restrictTo }) as unknown as MediaStreamTrack;

  beforeEach(() => {
    scope.document = { documentElement };
    scope.RestrictionTarget = {
      fromElement: async (element: unknown) => ({ element }),
    };
  });

  afterEach(() => {
    scope.document = originalDocument;
    delete scope.RestrictionTarget;
  });

  it('restricts the track to the root element', async () => {
    const targets: unknown[] = [];
    await restrictCaptureToPage(
      restrictableTrack(async (target) => {
        targets.push(target);
      })
    );

    expect(canRestrictCapture()).toBe(true);
    expect(targets).toEqual([{ element: documentElement }]);
  });

  it('keeps recording unrestricted when the track cannot be restricted', async () => {
    const track = restrictableTrack(async () => {
      throw new DOMException('Not self-capture', 'NotSupportedError');
    });

    await expect(restrictCaptureToPage(track)).resolves.toBeUndefined();
    expect(track.readyState).toBe('live');
  });

  it('does nothing without Element Capture', async () => {
    delete scope.RestrictionTarget;
    let called = false;

    await restrictCaptureToPage(
      restrictableTrack(async () => {
        called = true;
      })
    );

    expect(canRestrictCapture()).toBe(false);
    expect(called).toBe(false);
  });

  it('ignores tracks without restrictTo', async () => {
    await expect(
      restrictCaptureToPage(new FakeTrack('video') as unknown as MediaStreamTrack)
    ).resolves.toBeUndefined();
  });
});
