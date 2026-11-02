import { normalizeMimeType } from '@shared/mime.js';

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
  onTick?: (elapsedMs: number, bytes: number) => void;
  onAutoStop?: (reason: AutoStopReason) => void;
  onChunk?: (chunk: Blob, index: number) => void;
}

export interface RecordingSession {
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

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    VIDEO_CANDIDATES.some((candidate) => MediaRecorder.isTypeSupported(candidate))
  );
}

export function requestRecordingStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
      frameRate: { ideal: 15, max: 30 },
      width: { max: 1920 },
      height: { max: 1080 },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    monitorTypeSurfaces: 'exclude',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions);
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
  const hasAudio = microphone?.readyState === 'live';
  try {
    if (hasAudio && !stream.getTracks().includes(microphone)) {
      stream.addTrack(microphone);
    }
    const candidate = selectMimeType(hasAudio);
    if (!candidate) {
      throw new Error('No supported recording format');
    }
    selectedMimeType = candidate;
    recorder = new MediaRecorder(stream, {
      mimeType: candidate,
      videoBitsPerSecond: 1_500_000,
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
    try {
      void Promise.resolve(options.onChunk?.(event.data, chunkIndex++)).catch(() => undefined);
    } catch {
      // Chunk persistence is best-effort and must not stop an active recording.
    }
    notifyTick();
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
