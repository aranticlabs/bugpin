import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { openScreenCaptureSession, type ScreenCaptureSession } from '../capture/screenshot.js';

export const CAPTURE_DELAY_SECONDS = 3;
const COUNTDOWN_STEP_MS = 1000;

export type ScreenshotCaptureBarStatus = 'idle' | 'preparing' | 'ready' | 'countdown' | 'capturing';

export interface ScreenshotCaptureBarDependencies {
  openScreenCaptureSession: typeof openScreenCaptureSession;
}

interface UseScreenshotBarOptions {
  useScreenCaptureAPI: boolean;
  dependencies?: Partial<ScreenshotCaptureBarDependencies>;
  /**
   * Runs once the bar is hidden. Receives the shared tab stream when one is open, or null
   * to capture the DOM (also after the user declined the share picker).
   */
  capture: (session: ScreenCaptureSession | null) => Promise<void>;
}

/**
 * State machine behind the screenshot capture bar. In Screen Capture API mode
 * the share picker is shown when the bar opens, so the countdown can end in a
 * frame grab without the picker stealing focus from the page state being captured.
 */
export function useScreenshotCaptureBar({
  useScreenCaptureAPI,
  dependencies,
  capture,
}: UseScreenshotBarOptions) {
  const openSession = dependencies?.openScreenCaptureSession ?? openScreenCaptureSession;
  const [status, setStatus] = useState<ScreenshotCaptureBarStatus>('idle');
  const statusRef = useRef(status);
  const [countdown, setCountdown] = useState(CAPTURE_DELAY_SECONDS);
  const sessionRef = useRef<ScreenCaptureSession | null>(null);
  const openGenerationRef = useRef(0);
  const captureRef = useRef(capture);
  captureRef.current = capture;

  const updateStatus = useCallback((next: ScreenshotCaptureBarStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const releaseSession = useCallback(() => {
    openGenerationRef.current += 1;
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  useEffect(() => releaseSession, [releaseSession]);

  const open = useCallback(async () => {
    if (statusRef.current !== 'idle') return;
    if (!useScreenCaptureAPI) {
      updateStatus('ready');
      return;
    }

    updateStatus('preparing');
    // Cancelling while the share picker is open bumps the generation, so a late
    // result from an abandoned picker is discarded even if the bar was reopened.
    const generation = openGenerationRef.current;
    const isStillPreparing = () => generation === openGenerationRef.current;
    try {
      const session = await openSession();
      if (!isStillPreparing()) {
        session.stop();
        return;
      }
      sessionRef.current = session;
    } catch (error) {
      if (!isStillPreparing()) return;
      console.warn(
        '[BugPin] Screen Capture API unavailable, falling back to DOM capture.',
        `(${error instanceof Error ? error.message : error})`
      );
    }
    updateStatus('ready');
  }, [openSession, updateStatus, useScreenCaptureAPI]);

  const captureNow = useCallback(async () => {
    const current = statusRef.current;
    if (current !== 'ready' && current !== 'countdown') return;
    updateStatus('capturing');
    try {
      await captureRef.current(sessionRef.current);
    } finally {
      releaseSession();
      updateStatus('idle');
    }
  }, [releaseSession, updateStatus]);

  const captureDelayed = useCallback(() => {
    if (statusRef.current !== 'ready') return;
    setCountdown(CAPTURE_DELAY_SECONDS);
    updateStatus('countdown');
  }, [updateStatus]);

  const cancel = useCallback(() => {
    releaseSession();
    updateStatus('idle');
  }, [releaseSession, updateStatus]);

  useEffect(() => {
    if (status !== 'countdown') return;
    if (countdown === 0) {
      void captureNow();
      return;
    }
    const timeout = setTimeout(() => setCountdown((value) => value - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(timeout);
  }, [status, countdown, captureNow]);

  return { status, countdown, open, captureNow, captureDelayed, cancel };
}
