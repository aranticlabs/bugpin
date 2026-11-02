import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { Mic, Pause, Play, Square, Trash2 } from 'lucide-preact';
import { cn } from '../lib/utils';
import { Button } from './ui';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

const VIEWPORT_MARGIN = 8;

// Tailwind's translate utilities rely on @property defaults, which do not apply in a shadow root.
const DEFAULT_POSITION_STYLE = { left: '50%', bottom: '20px', transform: 'translateX(-50%)' };

export interface RecordingBarPosition {
  x: number;
  y: number;
}

interface RecordingBarProps {
  isCountingDown: boolean;
  countdown: number;
  elapsedMs: number;
  maxDurationMs: number;
  isPaused: boolean;
  hasMicrophone: boolean;
  isWholeScreen: boolean;
  position: RecordingBarPosition | null;
  onPositionChange: (position: RecordingBarPosition) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${seconds.toString().padStart(2, '0')}`;
}

function clampToViewport(bar: HTMLElement, x: number, y: number): RecordingBarPosition {
  const { width, height } = bar.getBoundingClientRect();
  const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxY),
  };
}

export const RecordingBar: FunctionComponent<RecordingBarProps> = ({
  isCountingDown,
  countdown,
  elapsedMs,
  maxDurationMs,
  isPaused,
  hasMicrophone,
  isWholeScreen,
  position,
  onPositionChange,
  onPause,
  onResume,
  onStop,
  onDiscard,
}) => {
  useLocale();
  const barRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    const keepInViewport = () => {
      const bar = barRef.current;
      const current = positionRef.current;
      if (bar && current) onPositionChange(clampToViewport(bar, current.x, current.y));
    };

    keepInViewport();
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [onPositionChange]);

  const handlePointerDown = useCallback((event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar || event.button !== 0 || (event.target as Element).closest('button')) return;
    const rect = bar.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    bar.setPointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      const bar = barRef.current;
      const offset = dragOffsetRef.current;
      if (!bar || !offset) return;
      onPositionChange(clampToViewport(bar, event.clientX - offset.x, event.clientY - offset.y));
    },
    [onPositionChange]
  );

  const handlePointerUp = useCallback(() => {
    dragOffsetRef.current = null;
  }, []);

  return (
    <div
      ref={barRef}
      data-bugpin-exclude
      class={cn(
        'fixed z-[2147483647] w-max flex flex-col gap-1 px-3 py-2 bg-background text-foreground border border-solid border-border rounded shadow-lg cursor-grab select-none touch-none'
      )}
      style={
        position ? { left: `${position.x}px`, top: `${position.y}px` } : DEFAULT_POSITION_STYLE
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div class="flex items-center gap-2">
        {!isCountingDown && (
          <>
            <span
              class={cn(
                'w-2.5 h-2.5 rounded-full bg-red-500',
                !isPaused && 'animate-pulse',
                isPaused && 'opacity-50'
              )}
              aria-hidden="true"
            />
            <span class="text-sm tabular-nums">
              {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
            </span>
            {hasMicrophone && <Mic class="w-4 h-4" aria-hidden="true" />}
            <Button
              variant="ghost"
              size="icon"
              onClick={isPaused ? onResume : onPause}
              title={isPaused ? t('recording.resume') : t('recording.pause')}
              aria-label={isPaused ? t('recording.resume') : t('recording.pause')}
            >
              {isPaused ? <Play class="w-4 h-4" /> : <Pause class="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              title={t('recording.stop')}
              aria-label={t('recording.stop')}
            >
              <Square class="w-4 h-4" />
            </Button>
          </>
        )}
        {isCountingDown && (
          <span role="status" class="text-sm">
            {t('recording.countdown', { seconds: countdown })}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onDiscard}
          title={t('recording.discard')}
          aria-label={t('recording.discard')}
        >
          <Trash2 class="w-4 h-4" />
        </Button>
      </div>
      {!isCountingDown && isWholeScreen && (
        <p role="status" class="text-xs text-amber-700 dark:text-amber-300">
          {t('recording.warning.wholeScreen')}
        </p>
      )}
    </div>
  );
};
