import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';
import { Camera, GripVertical, Timer, Trash2 } from 'lucide-preact';
import { cn } from '../lib/utils';
import { Card } from './ui';
import {
  CAPTURE_BAR_CLASS,
  CAPTURE_BAR_SHADOW_CLASS,
  CaptureBarButton,
  useCaptureBar,
  type CaptureBarPosition,
} from './CaptureBar';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

interface ScreenshotCaptureBarProps {
  isReady: boolean;
  isCountingDown: boolean;
  countdown: number;
  delaySeconds: number;
  position: CaptureBarPosition | null;
  onPositionChange: (position: CaptureBarPosition) => void;
  onCaptureNow: () => void;
  onCaptureDelayed: () => void;
  onCancel: () => void;
}

export const ScreenshotCaptureBar: FunctionComponent<ScreenshotCaptureBarProps> = ({
  isReady,
  isCountingDown,
  countdown,
  delaySeconds,
  position,
  onPositionChange,
  onCaptureNow,
  onCaptureDelayed,
  onCancel,
}) => {
  useLocale();
  const { barRef, style, tooltipSide, handlePointerDown, barHandlers } = useCaptureBar(
    position,
    onPositionChange,
    [isReady, isCountingDown]
  );
  const countdownRef = useRef<HTMLSpanElement>(null);
  const keepFocusRef = useRef(false);

  // Starting the countdown removes the focused button, so focus moves to the countdown
  // instead of falling back to the page.
  useEffect(() => {
    if (isCountingDown && keepFocusRef.current) {
      keepFocusRef.current = false;
      countdownRef.current?.focus();
    }
  }, [isCountingDown]);

  const handleCaptureDelayed = useCallback(() => {
    const bar = barRef.current;
    const root = bar?.getRootNode() as DocumentOrShadowRoot | undefined;
    keepFocusRef.current = !!bar && !!root?.activeElement && bar.contains(root.activeElement);
    onCaptureDelayed();
  }, [barRef, onCaptureDelayed]);

  const delayedLabel = t('screenshot.bar.delayedLabel', { seconds: delaySeconds });

  return (
    <Card
      cardRef={barRef}
      data-bugpin-exclude
      popover="manual"
      class={cn(CAPTURE_BAR_CLASS, CAPTURE_BAR_SHADOW_CLASS)}
      style={style}
      {...barHandlers}
    >
      <div class="flex flex-wrap items-center justify-center gap-1.5">
        <div
          data-screenshot-capture-bar-drag-handle
          class="flex items-center self-stretch px-0.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={handlePointerDown}
        >
          <GripVertical class="w-4 h-4" aria-hidden="true" />
        </div>

        {isCountingDown ? (
          <span
            ref={countdownRef}
            role="status"
            tabIndex={-1}
            class="px-2 text-sm font-medium tabular-nums outline-none"
          >
            {t('screenshot.bar.countdown', { seconds: countdown })}
          </span>
        ) : (
          <div class="flex items-center gap-0.5">
            <CaptureBarButton
              label={t('screenshot.bar.nowLabel')}
              side={tooltipSide}
              class="w-auto gap-1.5 px-3 text-sm"
              disabled={!isReady}
              onClick={onCaptureNow}
            >
              <Camera class="w-4 h-4" aria-hidden="true" />
              <span>{t('screenshot.bar.now')}</span>
            </CaptureBarButton>
            <CaptureBarButton
              label={delayedLabel}
              side={tooltipSide}
              class="w-auto gap-1.5 px-3 text-sm"
              disabled={!isReady}
              onClick={handleCaptureDelayed}
            >
              <Timer class="w-4 h-4" aria-hidden="true" />
              <span>{t('screenshot.bar.delayed', { seconds: delaySeconds })}</span>
            </CaptureBarButton>
          </div>
        )}

        <CaptureBarButton
          label={t('screenshot.bar.cancel')}
          side={tooltipSide}
          variant="ghost"
          onClick={onCancel}
        >
          <Trash2 class="w-4 h-4" />
        </CaptureBarButton>
      </div>
    </Card>
  );
};
