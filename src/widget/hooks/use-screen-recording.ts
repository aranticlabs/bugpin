import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  type AutoStopReason,
  type RecordingResult,
  type RecordingSession,
  isDisplayCaptureAllowed,
  isWholeScreenCapture,
  requestMicrophoneTrack,
  requestRecordingStream,
  restrictCaptureToPage,
  startRecording,
} from '../capture/recorder.js';
import type { RecordingQuality } from '@shared/recording-quality.js';
import type { ToastType } from '../components/ui';
import { getLocale, t } from '../i18n/index.js';
import { recordingStore } from '../storage/recording-store.js';

const COUNTDOWN_SECONDS = 3;
const COUNTDOWN_STEP_MS = 1000;
const SIZE_MARGIN_BYTES = 2 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;

export type RecordingStatus = 'idle' | 'requesting' | 'ready' | 'countdown' | 'recording';

export interface RecordingDependencies {
  isDisplayCaptureAllowed: typeof isDisplayCaptureAllowed;
  requestRecordingStream: typeof requestRecordingStream;
  requestMicrophoneTrack: typeof requestMicrophoneTrack;
  startRecording: typeof startRecording;
  recordingStore: typeof recordingStore;
}

interface UseScreenRecordingOptions {
  apiKey: string;
  ownerEmail?: string;
  maxDurationMs: number;
  maxVideoSize: number;
  quality: RecordingQuality;
  dependencies?: Partial<RecordingDependencies>;
  prepare: () => Promise<boolean>;
  onEnter: () => void;
  onExit: (
    result: RecordingResult | null,
    failed: boolean,
    sessionId?: string
  ) => void | Promise<void>;
  onNotice: (message: string, type: ToastType) => void;
}

interface PendingCapture {
  stream: MediaStream;
  microphone: MediaStreamTrack | null;
  handleMicrophoneEnded?: () => void;
  videoTrack: MediaStreamTrack | undefined;
  handleEnded: () => void;
}

function stopCaptureTracks(stream: MediaStream, microphone: MediaStreamTrack | null): void {
  stream.getTracks().forEach((track) => track.stop());
  microphone?.stop();
}

function isPermissionDenial(error: unknown): boolean {
  return error instanceof Object && 'name' in error && error.name === 'NotAllowedError';
}

function formatDurationLimit(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  const useMinutes = seconds >= 60 && seconds % 30 === 0;
  const value = useMinutes ? seconds / 60 : seconds;
  const unit = useMinutes ? 'minute' : 'second';
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: 'unit',
      unit,
      unitDisplay: 'long',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${value} ${unit}${value === 1 ? '' : 's'}`;
  }
}

export function useScreenRecording(options: UseScreenRecordingOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [isRequestingMicrophone, setIsRequestingMicrophone] = useState(false);
  const [isWholeScreen, setIsWholeScreen] = useState(false);

  const statusRef = useRef<RecordingStatus>('idle');
  const requestingMicrophoneRef = useRef(false);
  const pendingRef = useRef<PendingCapture | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const failedRef = useRef(false);
  const mountedRef = useRef(true);
  const unloadingRef = useRef(false);
  const elapsedRef = useRef(0);

  const updateStatus = useCallback((next: RecordingStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const takePending = useCallback((): PendingCapture | null => {
    const pending = pendingRef.current;
    if (!pending) return null;
    pendingRef.current = null;
    pending.videoTrack?.removeEventListener('ended', pending.handleEnded);
    if (pending.microphone && pending.handleMicrophoneEnded) {
      pending.microphone.removeEventListener('ended', pending.handleMicrophoneEnded);
    }
    return pending;
  }, []);

  const cancelCountdown = useCallback(() => {
    const pending = takePending();
    if (!pending) return;
    stopCaptureTracks(pending.stream, pending.microphone);
    updateStatus('idle');
    optionsRef.current.onExit(null, false);
  }, [takePending, updateStatus]);

  const handleAutoStop = useCallback((reason: AutoStopReason) => {
    const { maxDurationMs, maxVideoSize, onNotice } = optionsRef.current;
    if (reason === 'duration') {
      onNotice(
        t('recording.stopped.duration', { duration: formatDurationLimit(maxDurationMs) }),
        'info'
      );
    } else if (reason === 'size') {
      onNotice(
        t('recording.stopped.size', { size: Math.round(maxVideoSize / BYTES_PER_MB) }),
        'info'
      );
    } else if (reason === 'error') {
      failedRef.current = true;
      onNotice(t('recording.error.failed'), 'error');
    }
  }, []);

  const beginRecording = useCallback(() => {
    const pending = takePending();
    if (!pending) return;

    const { apiKey, ownerEmail, maxDurationMs, maxVideoSize, quality, dependencies } =
      optionsRef.current;
    const startFn = dependencies?.startRecording ?? startRecording;
    const store = dependencies?.recordingStore ?? recordingStore;
    failedRef.current = false;
    elapsedRef.current = 0;

    let session: RecordingSession;
    let storedSession = Promise.resolve<string | null>(null);
    try {
      session = startFn(pending.stream, pending.microphone, {
        maxDurationMs,
        maxBytes: Math.max(maxVideoSize - SIZE_MARGIN_BYTES, maxVideoSize / 2),
        quality,
        onTick: (ms) => {
          elapsedRef.current = ms;
          setElapsedMs(Math.floor(ms / 1000) * 1000);
          void storedSession.then((sessionId) => {
            if (sessionId) store.touch(sessionId);
          });
        },
        onAutoStop: handleAutoStop,
        onChunk: async (chunk, index) => {
          const durationMs = elapsedRef.current;
          const sessionId = await storedSession;
          if (sessionId) await store.addChunk(sessionId, index, chunk, durationMs);
        },
      });
      storedSession = store.begin({
        apiKey,
        ownerEmail,
        mimeType: session.mimeType,
        hasAudio: session.hasAudio,
        recordingQuality: quality,
        width: pending.stream.getVideoTracks()[0]?.getSettings().width,
        height: pending.stream.getVideoTracks()[0]?.getSettings().height,
      });
    } catch (error) {
      console.error('[BugPin] Failed to start recording:', error);
      updateStatus('idle');
      optionsRef.current.onNotice(t('recording.error.failed'), 'error');
      optionsRef.current.onExit(null, true);
      return;
    }

    sessionRef.current = session;
    setHasMicrophone(session.hasAudio);
    updateStatus('recording');
    void session.finished.then(async (result) => {
      sessionRef.current = null;
      const sessionId = await storedSession;
      if (unloadingRef.current) return;
      if (!mountedRef.current) {
        if (sessionId) await store.remove(apiKey, sessionId);
        return;
      }
      try {
        await optionsRef.current.onExit(result, failedRef.current, sessionId ?? undefined);
        if (sessionId) await store.remove(apiKey, sessionId);
      } catch (error) {
        console.error('[BugPin] Failed to save completed recording:', error);
        if (sessionId) store.release(sessionId);
      } finally {
        updateStatus('idle');
      }
    });
  }, [handleAutoStop, takePending, updateStatus]);

  useEffect(() => {
    if (status !== 'countdown') return;
    if (countdown === 0) {
      beginRecording();
      return;
    }
    const timeout = setTimeout(() => setCountdown((value) => value - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(timeout);
  }, [status, countdown, beginRecording]);

  useEffect(() => {
    mountedRef.current = true;
    const handlePageHide = () => (unloadingRef.current = true);
    const handlePageShow = () => (unloadingRef.current = false);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      const pending = takePending();
      if (pending) stopCaptureTracks(pending.stream, pending.microphone);
      sessionRef.current?.discard();
    };
  }, [takePending]);

  // The picker needs the click's transient activation, so nothing may be awaited
  // before requestStream runs.
  const start = useCallback(async () => {
    if (statusRef.current !== 'idle') return;
    const { apiKey, quality, dependencies } = optionsRef.current;
    const requestStream = dependencies?.requestRecordingStream ?? requestRecordingStream;
    const store = dependencies?.recordingStore ?? recordingStore;
    const captureAllowed = dependencies?.isDisplayCaptureAllowed ?? isDisplayCaptureAllowed;
    if (!captureAllowed()) {
      optionsRef.current.onNotice(t('recording.error.unavailable'), 'error');
      return;
    }
    if (store.isStartBlocked(apiKey)) {
      optionsRef.current.onNotice(t('recording.error.unavailable'), 'error');
      return;
    }
    updateStatus('requesting');

    let stream: MediaStream;
    try {
      stream = await requestStream(quality);
    } catch (error) {
      updateStatus('idle');
      if (!isPermissionDenial(error)) {
        console.error('[BugPin] Failed to request a recording stream:', error);
        optionsRef.current.onNotice(t('recording.error.unavailable'), 'error');
      }
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) await restrictCaptureToPage(videoTrack);

    const prepared = mountedRef.current && (await optionsRef.current.prepare());
    if (!prepared || !mountedRef.current || videoTrack?.readyState === 'ended') {
      stopCaptureTracks(stream, null);
      if (mountedRef.current) updateStatus('idle');
      return;
    }

    videoTrack?.addEventListener('ended', cancelCountdown);
    pendingRef.current = { stream, microphone: null, videoTrack, handleEnded: cancelCountdown };
    setCountdown(COUNTDOWN_SECONDS);
    setElapsedMs(0);
    setIsPaused(false);
    setHasMicrophone(false);
    setIsWholeScreen(isWholeScreenCapture(videoTrack));
    updateStatus('ready');
    optionsRef.current.onEnter();
  }, [cancelCountdown, updateStatus]);

  const toggleMicrophone = useCallback(async () => {
    if (statusRef.current !== 'ready' || requestingMicrophoneRef.current) return;
    const pending = pendingRef.current;
    if (!pending) return;

    if (pending.microphone) {
      if (pending.handleMicrophoneEnded) {
        pending.microphone.removeEventListener('ended', pending.handleMicrophoneEnded);
        pending.handleMicrophoneEnded = undefined;
      }
      pending.microphone.stop();
      pending.microphone = null;
      setHasMicrophone(false);
      return;
    }

    requestingMicrophoneRef.current = true;
    setIsRequestingMicrophone(true);
    const requestMicrophone =
      optionsRef.current.dependencies?.requestMicrophoneTrack ?? requestMicrophoneTrack;
    let microphone: MediaStreamTrack | null = null;
    try {
      microphone = await requestMicrophone();
    } finally {
      requestingMicrophoneRef.current = false;
      if (mountedRef.current) setIsRequestingMicrophone(false);
    }

    if (!mountedRef.current || statusRef.current !== 'ready' || pendingRef.current !== pending) {
      microphone?.stop();
      return;
    }

    if (!microphone) {
      optionsRef.current.onNotice(t('recording.notice.noMicrophone'), 'info');
      setHasMicrophone(false);
      return;
    }

    const handleMicrophoneEnded = () => {
      if (pendingRef.current === pending && pending.microphone === microphone) {
        pending.microphone = null;
        pending.handleMicrophoneEnded = undefined;
        setHasMicrophone(false);
      }
    };
    microphone.addEventListener('ended', handleMicrophoneEnded, { once: true });
    pending.microphone = microphone;
    pending.handleMicrophoneEnded = handleMicrophoneEnded;
    setHasMicrophone(microphone.readyState === 'live');
  }, []);

  const startCountdown = useCallback(() => {
    if (statusRef.current === 'ready') {
      updateStatus('countdown');
    }
  }, [updateStatus]);

  const pause = useCallback(() => {
    sessionRef.current?.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    sessionRef.current?.resume();
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    if (statusRef.current === 'ready' || statusRef.current === 'countdown') {
      cancelCountdown();
    } else {
      sessionRef.current?.stop();
    }
  }, [cancelCountdown]);

  const discard = useCallback(() => {
    if (statusRef.current === 'ready' || statusRef.current === 'countdown') {
      cancelCountdown();
    } else {
      sessionRef.current?.discard();
    }
  }, [cancelCountdown]);

  return {
    status,
    countdown,
    elapsedMs,
    isPaused,
    hasMicrophone,
    isRequestingMicrophone,
    isWholeScreen,
    start,
    toggleMicrophone,
    startCountdown,
    pause,
    resume,
    stop,
    discard,
  };
}
