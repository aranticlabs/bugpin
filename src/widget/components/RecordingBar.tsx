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
  Play,
  Square,
  Target,
  Trash2,
  TriangleAlert,
  Undo2,
} from 'lucide-preact';
import { cn } from '../lib/utils';
import {
  Alert,
  Badge,
  Button,
  type ButtonProps,
  Card,
  Popover,
  Separator,
  Tooltip,
  type TooltipSide,
} from './ui';
import { RecordingAnnotationLayer } from './RecordingAnnotationLayer';
import { useLocale } from '../hooks/use-locale.js';
import { PEN_COLORS, useRecordingTools, type RecordingTool } from '../hooks/use-recording-tools';
import { t } from '../i18n/index.js';

const VIEWPORT_MARGIN = 8;
const NEAR_LIMIT_MS = 30_000;
const TOOLTIP_CLEARANCE = 90;
const PEN_TRAY_OFFSET = 14;
const PEN_TRAY_OFFSET_BELOW_WARNING = 58;
const ACTIVE_TOOL_CLASS = 'bg-foreground text-background hover:bg-foreground/90';

// Tailwind's shadow and ring utilities rely on @property defaults, which do not apply in a shadow root.
const BAR_SHADOW_CLASS =
  '[box-shadow:0_0_0_1px_rgb(255_255_255/0.25),0_25px_50px_-12px_rgb(0_0_0/0.5)]';
const SELECTED_COLOR_CLASS = '[box-shadow:0_0_0_2px_var(--ring)]';

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

interface BarButtonProps extends ButtonProps {
  label: string;
  shortcut?: string;
  side: TooltipSide;
}

const BarButton: FunctionComponent<BarButtonProps> = ({
  label,
  shortcut,
  side,
  class: className,
  ...props
}) => (
  <Tooltip content={shortcut ? `${label} (${shortcut})` : label} side={side}>
    <Button size="icon" aria-label={label} class={cn('h-9 w-9', className)} {...props} />
  </Tooltip>
);

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
  const tools = useRecordingTools(!isCountingDown);
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
  }, [isCountingDown, onPositionChange]);

  useEffect(() => {
    barRef.current?.showPopover?.();
  }, []);

  const handlePointerDown = useCallback((event: JSX.TargetedPointerEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    if (!bar || event.button !== 0) return;
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

  const tooltipSide: TooltipSide = position && position.y < TOOLTIP_CLEARANCE ? 'bottom' : 'top';
  const showWarning = !isCountingDown && isWholeScreen;
  const hasStrokes = tools.strokes.length > 0;

  const toolButton = (tool: RecordingTool, label: string, shortcut: string, icon: JSX.Element) => (
    <BarButton
      label={label}
      shortcut={shortcut}
      side={tooltipSide}
      variant="ghost"
      class={cn(tools.tool === tool && ACTIVE_TOOL_CLASS)}
      aria-pressed={tools.tool === tool}
      onClick={() => tools.setTool(tool)}
    >
      {icon}
    </BarButton>
  );

  return (
    <>
      <RecordingAnnotationLayer
        tool={tools.tool}
        clickEffects={tools.clickEffects}
        color={tools.color}
        strokes={tools.strokes}
        isActive={!isCountingDown}
        isPaused={isPaused}
        onStrokeComplete={tools.addStroke}
      />
      <Card
        cardRef={barRef}
        data-bugpin-exclude
        popover="manual"
        class={cn(
          'bugpin-theme-dark [--destructive:#dc2626] fixed z-[2147483647] m-0 flex w-max max-w-[calc(100vw-16px)] cursor-default select-none flex-col gap-1.5 overflow-visible p-1.5 [inset:auto]',
          BAR_SHADOW_CLASS
        )}
        style={
          position ? { left: `${position.x}px`, top: `${position.y}px` } : DEFAULT_POSITION_STYLE
        }
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
            <span role="status" class="px-2 text-sm font-medium">
              {t('recording.countdown', { seconds: countdown })}
            </span>
          )}

          {!isCountingDown && (
            <>
              <div class="flex items-center gap-2 px-1">
                <Badge
                  variant={isPaused ? 'secondary' : 'destructive'}
                  class="gap-1.5 rounded-md px-2 tracking-wide"
                >
                  <Circle
                    class={cn('w-2 h-2 fill-current', !isPaused && 'animate-pulse')}
                    aria-hidden="true"
                  />
                  {t(isPaused ? 'recording.status.paused' : 'recording.status.recording')}
                </Badge>
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
                {hasMicrophone && <Mic class="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
              </div>

              <Separator orientation="vertical" class="h-5 max-[640px]:hidden" />

              <div class="flex items-center gap-0.5">
                {toolButton(
                  'cursor',
                  t('recording.tool.cursor'),
                  'V',
                  <MousePointer2 class="w-4 h-4" />
                )}
                <div class="relative inline-flex">
                  {toolButton('pen', t('recording.tool.pen'), 'P', <Pencil class="w-4 h-4" />)}
                  <Popover
                    open={tools.tool === 'pen'}
                    side={tooltipSide}
                    sideOffset={
                      showWarning && tooltipSide === 'bottom'
                        ? PEN_TRAY_OFFSET_BELOW_WARNING
                        : PEN_TRAY_OFFSET
                    }
                    class={cn('flex items-center gap-1 p-1.5', BAR_SHADOW_CLASS)}
                  >
                    {PEN_COLORS.map(({ value, labelKey }) => (
                      <BarButton
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
                      </BarButton>
                    ))}
                    <Separator orientation="vertical" class="mx-1 h-5" />
                    <BarButton
                      label={t('recording.tool.undo')}
                      side={tooltipSide}
                      variant="ghost"
                      class="h-8 w-8"
                      disabled={!hasStrokes}
                      onClick={tools.undo}
                    >
                      <Undo2 class="w-4 h-4" />
                    </BarButton>
                    <BarButton
                      label={t('recording.tool.clear')}
                      side={tooltipSide}
                      variant="ghost"
                      class="h-8 w-8"
                      disabled={!hasStrokes}
                      onClick={tools.clear}
                    >
                      <Eraser class="w-4 h-4" />
                    </BarButton>
                  </Popover>
                </div>
                {toolButton('laser', t('recording.tool.laser'), 'L', <Target class="w-4 h-4" />)}
                <BarButton
                  label={t('recording.tool.clickEffects')}
                  shortcut="C"
                  side={tooltipSide}
                  variant={tools.clickEffects ? 'secondary' : 'ghost'}
                  class={cn(!tools.clickEffects && 'text-muted-foreground')}
                  aria-pressed={tools.clickEffects}
                  onClick={tools.toggleClickEffects}
                >
                  <MousePointerClick class="w-4 h-4" />
                </BarButton>
              </div>

              <Separator orientation="vertical" class="h-5 max-[640px]:hidden" />

              <div class="flex items-center gap-0.5">
                <BarButton
                  label={isPaused ? t('recording.resume') : t('recording.pause')}
                  side={tooltipSide}
                  variant="ghost"
                  onClick={isPaused ? onResume : onPause}
                >
                  {isPaused ? <Play class="w-4 h-4" /> : <Pause class="w-4 h-4" />}
                </BarButton>
                <Tooltip content={t('recording.stop')} side={tooltipSide}>
                  <Button
                    variant="destructive"
                    class="h-9 rounded-md px-3"
                    onClick={onStop}
                    aria-label={t('recording.stop')}
                  >
                    <Square class="w-4 h-4 fill-current" />
                    {t('recording.stop')}
                  </Button>
                </Tooltip>
              </div>
            </>
          )}

          <BarButton
            label={t('recording.discard')}
            side={tooltipSide}
            variant="ghost"
            onClick={onDiscard}
          >
            <Trash2 class="w-4 h-4" />
          </BarButton>
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
