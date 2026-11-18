import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Camera, Check, ChevronDown, GripVertical, Timer, X } from 'lucide-preact';
import { cn } from '../lib/utils';
import { Button, Card, Popover, Separator, Tooltip } from './ui';
import {
  CAPTURE_BAR_CLASS,
  CAPTURE_BAR_SHADOW_CLASS,
  CaptureBarButton,
  useCaptureBar,
  useCaptureBarThemeClass,
  type CaptureBarPosition,
} from './CaptureBar';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

const MENU_OFFSET = 8;

interface ScreenshotCaptureBarProps {
  isReady: boolean;
  isCountingDown: boolean;
  countdown: number;
  delaySeconds: number;
  delayOptions: readonly number[];
  position: CaptureBarPosition | null;
  onPositionChange: (position: CaptureBarPosition) => void;
  onDelayChange: (seconds: number) => void;
  onCapture: () => void;
  onCancel: () => void;
}

function delayText(seconds: number): string {
  return seconds === 0 ? t('screenshot.bar.timerOff') : t('screenshot.bar.timerShort', { seconds });
}

export const ScreenshotCaptureBar: FunctionComponent<ScreenshotCaptureBarProps> = ({
  isReady,
  isCountingDown,
  countdown,
  delaySeconds,
  delayOptions,
  position,
  onPositionChange,
  onDelayChange,
  onCapture,
  onCancel,
}) => {
  useLocale();
  const { barRef, style, tooltipSide, handlePointerDown, barHandlers } = useCaptureBar(
    position,
    onPositionChange,
    [isReady, isCountingDown]
  );
  const themeClass = useCaptureBarThemeClass(position);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const timerRef = useRef<HTMLDivElement>(null);

  const focusTimerItem = useCallback((selector: string) => {
    timerRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
  }, []);

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      setIsMenuOpen(false);
      if (restoreFocus) focusTimerItem('[aria-haspopup="menu"]');
    },
    [focusTimerItem]
  );

  useEffect(() => {
    if (!isMenuOpen) return;
    focusTimerItem('[role="menuitemradio"][aria-checked="true"]');
    // The bar lives in a shadow root, so the composed path is the reliable way to
    // tell a click inside the menu from one on the page.
    const handleOutside = (event: PointerEvent) => {
      const timer = timerRef.current;
      if (timer && !event.composedPath().includes(timer)) closeMenu(false);
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [isMenuOpen, closeMenu, focusTimerItem]);

  useEffect(() => {
    if (isCountingDown || !isReady) setIsMenuOpen(false);
  }, [isCountingDown, isReady]);

  const handleMenuKeyDown = useCallback(
    (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
      const items = Array.from(
        timerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
      );
      const root = timerRef.current?.getRootNode() as DocumentOrShadowRoot | undefined;
      const index = items.indexOf(root?.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      } else if (event.key === 'Tab') {
        closeMenu(false);
      }
    },
    [closeMenu]
  );

  const selectDelay = useCallback(
    (seconds: number) => {
      onDelayChange(seconds);
      closeMenu(true);
    },
    [closeMenu, onDelayChange]
  );

  const timerTrigger = (
    <Button
      variant={delaySeconds === 0 ? 'ghost' : 'secondary'}
      class="h-9 gap-1.5 px-2.5 text-sm"
      aria-haspopup="menu"
      aria-expanded={isMenuOpen}
      disabled={!isReady || isCountingDown}
      onClick={() => setIsMenuOpen((open) => !open)}
    >
      <Timer class="w-4 h-4" aria-hidden="true" />
      <span class="sr-only">{t('screenshot.bar.timerLabel')}: </span>
      <span>{delayText(delaySeconds)}</span>
      <ChevronDown class="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
    </Button>
  );

  return (
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
          data-screenshot-capture-bar-drag-handle
          class="flex items-center self-stretch px-0.5 text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={handlePointerDown}
        >
          <GripVertical class="w-4 h-4" aria-hidden="true" />
        </div>

        <div ref={timerRef} class="relative inline-flex" onKeyDown={handleMenuKeyDown}>
          <Tooltip
            content={t('screenshot.bar.timerLabel')}
            side={tooltipSide}
            disabled={isMenuOpen}
          >
            {timerTrigger}
          </Tooltip>
          <Popover
            open={isMenuOpen}
            side={tooltipSide}
            sideOffset={MENU_OFFSET}
            class={cn('flex min-w-[144px] flex-col gap-0.5 p-1', CAPTURE_BAR_SHADOW_CLASS)}
          >
            <div role="menu" aria-label={t('screenshot.bar.timerLabel')} class="contents">
              {delayOptions.map((seconds) => (
                <Button
                  key={seconds}
                  variant="ghost"
                  size="sm"
                  role="menuitemradio"
                  aria-checked={seconds === delaySeconds}
                  tabIndex={-1}
                  class="w-full justify-start gap-2 text-sm"
                  onClick={() => selectDelay(seconds)}
                >
                  <Check
                    class={cn('w-4 h-4', seconds !== delaySeconds && 'invisible')}
                    aria-hidden="true"
                  />
                  {seconds === 0
                    ? t('screenshot.bar.timerOff')
                    : t('screenshot.bar.timerOption', { seconds })}
                </Button>
              ))}
            </div>
          </Popover>
        </div>

        <Button
          class="h-9 min-w-[120px] gap-1.5 px-3 text-sm tabular-nums"
          disabled={!isReady}
          aria-disabled={isCountingDown || undefined}
          onClick={isCountingDown ? undefined : onCapture}
        >
          {isCountingDown ? (
            <span>{t('screenshot.bar.countdown', { seconds: countdown })}</span>
          ) : (
            <>
              <Camera class="w-4 h-4" aria-hidden="true" />
              <span>{t('screenshot.bar.capture')}</span>
            </>
          )}
        </Button>
        <span role="status" class="sr-only">
          {isCountingDown ? t('screenshot.bar.countdown', { seconds: countdown }) : ''}
        </span>

        <Separator orientation="vertical" class="h-5" />

        <CaptureBarButton
          label={t('screenshot.bar.cancel')}
          side={tooltipSide}
          variant="ghost"
          onClick={onCancel}
        >
          <X class="w-4 h-4" />
        </CaptureBarButton>
      </div>
    </Card>
  );
};
