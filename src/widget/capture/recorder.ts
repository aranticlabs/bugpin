import { normalizeMimeType } from '@shared/mime.js';
import {
  DEFAULT_RECORDING_QUALITY,
  RECORDING_QUALITY_PRESETS,
  type RecordingQuality,
} from '@shared/recording-quality.js';

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export type AutoStopReason = 'duration' | 'size' | 'ended' | 'error';

export interface RecorderOptions {
  maxDurationMs: number;
  maxBytes: number;
  quality?: RecordingQuality;
  onTick?: (elapsedMs: number, bytes: number) => void;
  onAutoStop?: (reason: AutoStopReason) => void;
  onChunk?: (chunk: Blob, index: number) => void;
}

export interface RecordingSession {
  mimeType: string;
  hasAudio: boolean;
  pause(): void;
  resume(): void;
  stop(): void;
  discard(): void;
  finished: Promise<RecordingResult | null>;
}

const VIDEO_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/mp4;codecs=avc1.64003e',
  'video/mp4',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

const AUDIO_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/mp4;codecs=avc1.64003e,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.64003e,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

function selectMimeType(hasAudio: boolean): string | null {
  const candidates = hasAudio ? AUDIO_CANDIDATES : VIDEO_CANDIDATES;
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function stopTracks(stream: MediaStream, microphone: MediaStreamTrack | null): void {
  const tracks = new Set(stream.getTracks());
  if (microphone) tracks.add(microphone);
  tracks.forEach((track) => track.stop());
}

interface FeaturePolicyDocument {
  featurePolicy?: { allowsFeature(feature: string): boolean };
}

// Only Chromium exposes the policy. Elsewhere a blocked picker looks the same as
// a cancelled one, so the check reports the feature as allowed.
export function isDisplayCaptureAllowed(): boolean {
  try {
    const policy = (document as Document & FeaturePolicyDocument).featurePolicy;
    return policy?.allowsFeature('display-capture') ?? true;
  } catch {
    return true;
  }
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    VIDEO_CANDIDATES.some((candidate) => MediaRecorder.isTypeSupported(candidate))
  );
}

export function requestRecordingStream(
  quality: RecordingQuality = DEFAULT_RECORDING_QUALITY
): Promise<MediaStream> {
  const { width, height, frameRate } = RECORDING_QUALITY_PRESETS[quality];
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
      frameRate: { ideal: frameRate, max: 30 },
      width: { max: width },
      height: { max: height },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    monitorTypeSurfaces: 'exclude',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions);
}

interface RestrictableVideoTrack extends MediaStreamTrack {
  restrictTo?: (target: unknown) => Promise<void>;
}

interface RestrictionTargetFactory {
  fromElement(element: Element): Promise<unknown>;
}

const restrictionTargetFactory = () =>
  (globalThis as { RestrictionTarget?: RestrictionTargetFactory }).RestrictionTarget;

export function canRestrictCapture(): boolean {
  return !!restrictionTargetFactory();
}

// Element Capture records the root stacking context only, and top-layer elements paint
// outside it, so the recording bar stays on screen but out of the video. Browsers without
// Element Capture, and captures of anything but the current tab, record unrestricted.
export async function restrictCaptureToPage(track: MediaStreamTrack): Promise<void> {
  const factory = restrictionTargetFactory();
  const restrictableTrack = track as RestrictableVideoTrack;
  if (!factory || !restrictableTrack.restrictTo) return;
  try {
    await restrictableTrack.restrictTo(await factory.fromElement(document.documentElement));
  } catch {
    // An unrestricted recording still works; it just includes the recording bar.
  }
}

export async function requestMicrophoneTrack(): Promise<MediaStreamTrack | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const [microphone, ...extraTracks] = stream.getAudioTracks();
    extraTracks.forEach((track) => track.stop());
    if (!microphone) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    return microphone;
  } catch {
    return null;
  }
}

export function startRecording(
  stream: MediaStream,
  microphone: MediaStreamTrack | null,
  options: RecorderOptions
): RecordingSession {
  let recorder: MediaRecorder;
  let selectedMimeType: string;
  const audioCandidate = microphone?.readyState === 'live' ? selectMimeType(true) : null;
  const hasAudio = audioCandidate !== null;
  try {
    if (microphone && !hasAudio) {
      microphone.stop();
    } else if (microphone && !stream.getTracks().includes(microphone)) {
      stream.addTrack(microphone);
    }
    const candidate = audioCandidate ?? selectMimeType(false);
    if (!candidate) {
      throw new Error('No supported recording format');
    }
    selectedMimeType = candidate;
    recorder = new MediaRecorder(stream, {
      mimeType: candidate,
      videoBitsPerSecond:
        RECORDING_QUALITY_PRESETS[options.quality ?? DEFAULT_RECORDING_QUALITY].videoBitsPerSecond,
      audioBitsPerSecond: 64_000,
      videoKeyFrameIntervalDuration: 2000,
    } as MediaRecorderOptions);
  } catch (error) {
    stopTracks(stream, microphone);
    throw error;
  }

  const chunks: Blob[] = [];
  const videoTrack = stream.getVideoTracks()[0];
  let lastWidth = 0;
  let lastHeight = 0;
  let bytes = 0;
  let chunkIndex = 0;
  let recordedMs = 0;
  let segmentStartedAt: number | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let finalizeFallback: ReturnType<typeof setTimeout> | null = null;
  let stopping = false;
  let discarded = false;
  let finalized = false;
  let resolveFinished!: (result: RecordingResult | null) => void;

  const finished = new Promise<RecordingResult | null>((resolve) => {
    resolveFinished = resolve;
  });

  const elapsedMs = () =>
    recordedMs +
    (segmentStartedAt === null ? 0 : Math.max(0, performance.now() - segmentStartedAt));

  const updateElapsed = () => {
    if (segmentStartedAt !== null) {
      recordedMs += Math.max(0, performance.now() - segmentStartedAt);
      segmentStartedAt = null;
    }
  };

  const notifyTick = () => {
    refreshDimensions();
    try {
      options.onTick?.(Math.min(elapsedMs(), options.maxDurationMs), bytes);
    } catch {
      // UI callbacks must not interrupt the recorder lifecycle.
    }
  };

  const handleTrackEnded = () => stopSession('ended');

  function refreshDimensions(): void {
    const settings = videoTrack?.getSettings();
    if (settings?.width) lastWidth = settings.width;
    if (settings?.height) lastHeight = settings.height;
  }

  const cleanup = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (finalizeFallback !== null) {
      clearTimeout(finalizeFallback);
      finalizeFallback = null;
    }
    videoTrack?.removeEventListener('ended', handleTrackEnded);
    stopTracks(stream, microphone);
  };

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    updateElapsed();
    cleanup();
    if (discarded) {
      resolveFinished(null);
      return;
    }

    const mimeType = normalizeMimeType(recorder.mimeType || selectedMimeType);
    resolveFinished({
      blob: new Blob(chunks, { type: mimeType }),
      mimeType,
      durationMs: Math.round(recordedMs),
      width: lastWidth,
      height: lastHeight,
      hasAudio,
    });
  };

  function stopSession(reason?: AutoStopReason): void {
    if (stopping || finalized) return;
    stopping = true;
    refreshDimensions();
    updateElapsed();
    if (reason) {
      try {
        options.onAutoStop?.(reason);
      } catch {
        // UI callbacks must not interrupt recorder cleanup.
      }
    }
    finalizeFallback = setTimeout(finalize, 5000);
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      stopTracks(stream, microphone);
    } catch {
      finalize();
    }
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0 || finalized || discarded) return;
    chunks.push(event.data);
    bytes += event.data.size;
    notifyTick();
    try {
      void Promise.resolve(options.onChunk?.(event.data, chunkIndex++)).catch(() => undefined);
    } catch {
      // Chunk persistence is best-effort and must not stop an active recording.
    }
    if (bytes >= options.maxBytes) {
      stopSession('size');
    } else if (elapsedMs() >= options.maxDurationMs) {
      stopSession('duration');
    }
  };
  recorder.onstop = finalize;
  recorder.onerror = () => stopSession('error');
  videoTrack?.addEventListener('ended', handleTrackEnded);

  try {
    recorder.start(1000);
    segmentStartedAt = performance.now();
    refreshDimensions();
    notifyTick();
    timer = setInterval(() => {
      notifyTick();
      if (elapsedMs() >= options.maxDurationMs) stopSession('duration');
    }, 250);
    if (videoTrack?.readyState === 'ended') stopSession('ended');
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    mimeType: normalizeMimeType(recorder.mimeType || selectedMimeType),
    hasAudio,
    pause() {
      if (stopping || recorder.state !== 'recording') return;
      updateElapsed();
      recorder.pause();
      notifyTick();
    },
    resume() {
      if (stopping || recorder.state !== 'paused') return;
      recorder.resume();
      segmentStartedAt = performance.now();
      notifyTick();
    },
    stop() {
      stopSession();
    },
    discard() {
      discarded = true;
      stopSession();
    },
    finished,
  };
}
