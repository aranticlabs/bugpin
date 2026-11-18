import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import {
  Circle,
  Eraser,
  GripVertical,
  Mic,
  MousePointer2,
  MousePointerClick,
  Pause,
  Pencil,
  Square,
  Target,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-preact';
import { cn } from '../lib/utils';
import { Alert, Card, Popover, Separator } from './ui';
import {
  CAPTURE_BAR_CLASS,
  CAPTURE_BAR_SHADOW_CLASS,
  CaptureBarButton,
  useCaptureBar,
  useCaptureBarThemeClass,
  type CaptureBarPosition,
} from './CaptureBar';
import { RecordingAnnotationLayer } from './RecordingAnnotationLayer';
import { useLocale } from '../hooks/use-locale.js';
import {
  PEN_COLORS,
  formatShortcut,
  useRecordingTools,
  type RecordingTool,
} from '../hooks/use-recording-tools';
import { t } from '../i18n/index.js';

const NEAR_LIMIT_MS = 30_000;
const PEN_TRAY_OFFSET = 14;
const PEN_TRAY_OFFSET_BELOW_WARNING = 58;
const ACTIVE_TOOL_CLASS = 'bg-foreground text-background hover:bg-foreground/90';
const SELECTED_COLOR_CLASS = '[box-shadow:0_0_0_2px_var(--ring)]';

interface VideoCaptureBarProps {
  isReady: boolean;
  isCountingDown: boolean;
  countdown: number;
  elapsedMs: number;
  maxDurationMs: number;
  isPaused: boolean;
  hasMicrophone: boolean;
  isWholeScreen: boolean;
  position: CaptureBarPosition | null;
  onPositionChange: (position: CaptureBarPosition) => void;
  onStart: () => void;
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

export const VideoCaptureBar: FunctionComponent<VideoCaptureBarProps> = ({
  isReady,
  isCountingDown,
  countdown,
  elapsedMs,
  maxDurationMs,
  isPaused,
  hasMicrophone,
  isWholeScreen,
  position,
  onPositionChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onDiscard,
}) => {
  useLocale();
  const tools = useRecordingTools(!isCountingDown);
  const { barRef, style, tooltipSide, handlePointerDown, barHandlers } = useCaptureBar(
    position,
    onPositionChange,
    [isReady, isCountingDown]
  );
  const themeClass = useCaptureBarThemeClass(position);
  const countdownRef = useRef<HTMLSpanElement>(null);
  const keepFocusRef = useRef(false);

  // Starting replaces the focused record button, so focus is carried to the countdown
  // and then to the stop button instead of falling back to the page.
  useEffect(() => {
    if (!keepFocusRef.current) return;
    if (isCountingDown) {
      countdownRef.current?.focus();
    } else if (!isReady) {
      keepFocusRef.current = false;
      barRef.current?.querySelector<HTMLButtonElement>('[data-recording-stop]')?.focus();
    }
  }, [isReady, isCountingDown]);

  const handleStart = useCallback(() => {
    const bar = barRef.current;
    const root = bar?.getRootNode() as DocumentOrShadowRoot | undefined;
    keepFocusRef.current = !!bar && !!root?.activeElement && bar.contains(root.activeElement);
    onStart();
  }, [onStart]);

  const showWarning = !isCountingDown && isWholeScreen;
  const hasStrokes = tools.strokes.length > 0;

  const toolButton = (tool: RecordingTool, label: string, shortcut: string, icon: JSX.Element) => (
    <CaptureBarButton
      label={label}
      shortcut={shortcut}
      side={tooltipSide}
      variant="ghost"
      class={cn(tools.tool === tool && ACTIVE_TOOL_CLASS)}
      aria-pressed={tools.tool === tool}
      onClick={() => tools.setTool(tool)}
    >
      {icon}
    </CaptureBarButton>
  );

  return (
    <>
      <RecordingAnnotationLayer
        tool={isCountingDown ? 'cursor' : tools.tool}
        clickEffects={tools.clickEffects}
        color={tools.color}
        strokes={tools.strokes}
        isActive={!isReady && !isCountingDown}
        isPaused={isPaused}
        onStrokeComplete={tools.addStroke}
      />
      <Card
        cardRef={barRef}
        data-bugpin-exclude
        popover="manual"
        class={cn(CAPTURE_BAR_CLASS, themeClass, CAPTURE_BAR_SHADOW_CLASS)}
        style={style}
        {...barHandlers}
      >
        <div class="flex flex-wrap items-center justify-center gap-1.5">
          <div
            data-recording-drag-handle
            class="flex items-center self-stretch px-0.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handlePointerDown}
          >
            <GripVertical class="w-4 h-4" aria-hidden="true" />
          </div>

          {isCountingDown && (
            <span
              ref={countdownRef}
              role="status"
              tabIndex={-1}
              class="px-2 text-sm font-medium outline-none"
            >
              {t('recording.countdown', { seconds: countdown })}
            </span>
          )}

          {!isCountingDown && (
            <>
              {(!isReady || hasMicrophone) && (
                <>
                  <div class="flex items-center gap-2 px-1">
                    {!isReady && (
                      <>
                        <Circle
                          data-recording-indicator
                          class={cn(
                            'w-2.5 h-2.5 shrink-0 fill-current',
                            isPaused ? 'text-muted-foreground' : 'text-destructive animate-pulse'
                          )}
                          aria-hidden="true"
                        />
                        <span
                          class={cn(
                            'text-sm font-semibold tabular-nums',
                            maxDurationMs - elapsedMs <= NEAR_LIMIT_MS && 'animate-pulse'
                          )}
                        >
                          {formatDuration(elapsedMs)}{' '}
                          <span class="font-normal text-muted-foreground">
                            / {formatDuration(maxDurationMs)}
                          </span>
                        </span>
                      </>
                    )}
                    {hasMicrophone && (
                      <Mic class="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>

                  <Separator orientation="vertical" class="h-5 max-[640px]:hidden" />
                </>
              )}

              <div class="flex items-center gap-0.5">
                {toolButton(
                  'cursor',
                  t('recording.tool.cursor'),
                  formatShortcut('V'),
                  <MousePointer2 class="w-4 h-4" />
                )}
                <div class="relative inline-flex">
                  {toolButton(
                    'pen',
                    t('recording.tool.pen'),
                    formatShortcut('P'),
                    <Pencil class="w-4 h-4" />
                  )}
                  <Popover
                    open={tools.tool === 'pen'}
                    side={tooltipSide}
                    sideOffset={
                      showWarning && tooltipSide === 'bottom'
                        ? PEN_TRAY_OFFSET_BELOW_WARNING
                        : PEN_TRAY_OFFSET
                    }
                    class={cn('flex items-center gap-1 p-1.5', CAPTURE_BAR_SHADOW_CLASS)}
                  >
                    {PEN_COLORS.map(({ value, labelKey }) => (
                      <CaptureBarButton
                        key={value}
                        label={t(labelKey)}
                        side={tooltipSide}
                        variant={tools.color === value ? 'secondary' : 'ghost'}
                        class={cn('h-8 w-8', tools.color === value && SELECTED_COLOR_CLASS)}
                        aria-pressed={tools.color === value}
                        onClick={() => tools.setColor(value)}
                      >
                        <span
                          class="w-4 h-4 rounded-full border border-solid border-border"
                          style={{ backgroundColor: value }}
                        />
                      </CaptureBarButton>
                    ))}
                    <Separator orientation="vertical" class="mx-1 h-5" />
                    <CaptureBarButton
                      label={t('recording.tool.undo')}
                      shortcut={formatShortcut('Z')}
                      side={tooltipSide}
                      variant="ghost"
                      class="h-8 w-8"
                      disabled={!hasStrokes}
                      onClick={tools.undo}
                    >
                      <Undo2 class="w-4 h-4" />
                    </CaptureBarButton>
                    <CaptureBarButton
                      label={t('recording.tool.clear')}
                      side={tooltipSide}
                      variant="ghost"
                      class="h-8 w-8"
                      disabled={!hasStrokes}
                      onClick={tools.clear}
                    >
                      <Eraser class="w-4 h-4" />
                    </CaptureBarButton>
                  </Popover>
                </div>
                {toolButton(
                  'laser',
                  t('recording.tool.laser'),
                  formatShortcut('L'),
                  <Target class="w-4 h-4" />
                )}
                <CaptureBarButton
                  label={t('recording.tool.clickEffects')}
                  shortcut={formatShortcut('C')}
                  side={tooltipSide}
                  variant={tools.clickEffects ? 'secondary' : 'ghost'}
                  class={cn(!tools.clickEffects && 'text-muted-foreground')}
                  aria-pressed={tools.clickEffects}
                  onClick={tools.toggleClickEffects}
                >
                  <MousePointerClick class="w-4 h-4" />
                </CaptureBarButton>
              </div>

              <Separator orientation="vertical" class="h-5 max-[640px]:hidden" />

              <div class="flex items-center gap-0.5">
                <CaptureBarButton
                  label={isPaused ? t('recording.resume') : t('recording.pause')}
                  side={tooltipSide}
                  variant="ghost"
                  class={cn(
                    isPaused && 'bg-amber-500 text-black hover:bg-amber-400 hover:text-black'
                  )}
                  onClick={isPaused ? onResume : onPause}
                  disabled={isReady}
                >
                  <Pause class="w-4 h-4" />
                </CaptureBarButton>
                <CaptureBarButton
                  label={t(isReady ? 'recording.record' : 'recording.stop')}
                  side={tooltipSide}
                  variant="destructive"
                  class="w-auto gap-1.5 px-3 text-sm"
                  data-recording-stop={isReady ? undefined : ''}
                  onClick={isReady ? handleStart : onStop}
                >
                  {isReady ? (
                    <Circle class="w-3 h-3 fill-current" aria-hidden="true" />
                  ) : (
                    <Square class="w-4 h-4 fill-current" aria-hidden="true" />
                  )}
                  <span>{t(isReady ? 'recording.startShort' : 'recording.stop')}</span>
                </CaptureBarButton>
              </div>
            </>
          )}

          <CaptureBarButton
            label={t('recording.discard')}
            side={tooltipSide}
            variant="ghost"
            onClick={onDiscard}
          >
            <Trash2 class="w-4 h-4" />
          </CaptureBarButton>
        </div>

        {showWarning && (
          <Alert role="status" class="flex items-center gap-2 px-3 py-2 text-xs">
            <TriangleAlert class="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {t('recording.warning.wholeScreen')}
          </Alert>
        )}
      </Card>
    </>
  );
};
