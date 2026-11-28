import { FunctionComponent, JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import {
  Camera,
  Check,
  ChevronDown,
  GripVertical,
  ImageDown,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-preact';
import { cn } from '../lib/utils';
import { Alert, Button, Card, Popover, Separator, Tooltip } from './ui';
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

type OpenMenu = 'timer' | 'size' | null;

interface ScreenshotCaptureBarProps {
  isReady: boolean;
  isCountingDown: boolean;
  countdown: number;
  delaySeconds: number;
  delayOptions: readonly number[];
  reduceImageSize: boolean;
  oversizedCapture?: { sizeMb: number; limitMb: number } | null;
  position: CaptureBarPosition | null;
  onPositionChange: (position: CaptureBarPosition) => void;
  onDelayChange: (seconds: number) => void;
  onReduceImageSizeChange: (reduce: boolean) => void;
  onDismissOversizedCapture?: () => void;
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
  reduceImageSize,
  oversizedCapture = null,
  position,
  onPositionChange,
  onDelayChange,
  onReduceImageSizeChange,
  onDismissOversizedCapture,
  onCapture,
  onCancel,
}) => {
  useLocale();
  const { barRef, style, positionClass, tooltipSide, handlePointerDown, barHandlers } =
    useCaptureBar(position, onPositionChange, [isReady, isCountingDown, Boolean(oversizedCapture)]);
  const themeClass = useCaptureBarThemeClass(position);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);

  const menuContainer = useCallback(
    (menu: Exclude<OpenMenu, null>) => (menu === 'timer' ? timerRef.current : sizeRef.current),
    []
  );

  const focusMenuItem = useCallback(
    (menu: Exclude<OpenMenu, null>, selector: string) => {
      menuContainer(menu)?.querySelector<HTMLButtonElement>(selector)?.focus();
    },
    [menuContainer]
  );

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      const closing = openMenu;
      setOpenMenu(null);
      if (restoreFocus && closing) focusMenuItem(closing, '[aria-haspopup="menu"]');
    },
    [focusMenuItem, openMenu]
  );

  useEffect(() => {
    if (!openMenu) return;
    focusMenuItem(openMenu, '[role="menuitemradio"][aria-checked="true"]');
    // The bar lives in a shadow root, so the composed path is the reliable way to
    // tell a click inside the menu from one on the page.
    const handleOutside = (event: PointerEvent) => {
      const container = menuContainer(openMenu);
      if (container && !event.composedPath().includes(container)) closeMenu(false);
    };
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  }, [openMenu, closeMenu, focusMenuItem, menuContainer]);

  useEffect(() => {
    if (isCountingDown || !isReady) setOpenMenu(null);
  }, [isCountingDown, isReady]);

  useEffect(() => {
    if (oversizedCapture && isReady && !isCountingDown) {
      focusMenuItem('size', '[aria-haspopup="menu"]');
    }
  }, [oversizedCapture, isReady, isCountingDown, focusMenuItem]);

  const handleMenuKeyDown = useCallback(
    (menu: Exclude<OpenMenu, null>) => (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
      const container = menuContainer(menu);
      const items = Array.from(
        container?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []
      );
      const root = container?.getRootNode() as DocumentOrShadowRoot | undefined;
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
    [closeMenu, menuContainer]
  );

  const selectDelay = useCallback(
    (seconds: number) => {
      onDelayChange(seconds);
      closeMenu(true);
    },
    [closeMenu, onDelayChange]
  );

  const selectSize = useCallback(
    (reduce: boolean) => {
      onReduceImageSizeChange(reduce);
      closeMenu(true);
    },
    [closeMenu, onReduceImageSizeChange]
  );

  const isTimerMenuOpen = openMenu === 'timer';
  const isSizeMenuOpen = openMenu === 'size';

  const timerTrigger = (
    <Button
      variant={delaySeconds === 0 ? 'ghost' : 'secondary'}
      class="h-9 gap-1.5 px-2.5 text-sm"
      aria-haspopup="menu"
      aria-expanded={isTimerMenuOpen}
      disabled={!isReady || isCountingDown}
      onClick={() => setOpenMenu((current) => (current === 'timer' ? null : 'timer'))}
    >
      <Timer class="w-4 h-4" aria-hidden="true" />
      <span class="sr-only">{t('screenshot.bar.timerLabel')}: </span>
      <span>{delayText(delaySeconds)}</span>
      <ChevronDown class="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
    </Button>
  );

  const sizeTrigger = (
    <Button
      variant={reduceImageSize ? 'secondary' : 'ghost'}
      class="h-9 gap-1.5 px-2.5 text-sm"
      aria-haspopup="menu"
      aria-expanded={isSizeMenuOpen}
      disabled={!isReady || isCountingDown}
      onClick={() => setOpenMenu((current) => (current === 'size' ? null : 'size'))}
    >
      <ImageDown class="w-4 h-4" aria-hidden="true" />
      <span class="sr-only">{t('screenshot.bar.sizeLabel')}: </span>
      <span>
        {t(reduceImageSize ? 'screenshot.bar.sizeReducedShort' : 'screenshot.bar.sizeFullShort')}
      </span>
      <ChevronDown class="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
    </Button>
  );

  return (
    <Card
      cardRef={barRef}
      data-bugpin-exclude
      popover="manual"
      class={cn(CAPTURE_BAR_CLASS, themeClass, CAPTURE_BAR_SHADOW_CLASS, positionClass)}
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

        <div ref={timerRef} class="relative inline-flex" onKeyDown={handleMenuKeyDown('timer')}>
          <Tooltip
            content={t('screenshot.bar.timerLabel')}
            side={tooltipSide}
            disabled={isTimerMenuOpen}
          >
            {timerTrigger}
          </Tooltip>
          <Popover
            open={isTimerMenuOpen}
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

        <div ref={sizeRef} class="relative inline-flex" onKeyDown={handleMenuKeyDown('size')}>
          <Tooltip
            content={t('screenshot.bar.sizeLabel')}
            side={tooltipSide}
            disabled={isSizeMenuOpen}
          >
            {sizeTrigger}
          </Tooltip>
          <Popover
            open={isSizeMenuOpen}
            side={tooltipSide}
            sideOffset={MENU_OFFSET}
            class={cn('flex min-w-[208px] flex-col gap-0.5 p-1', CAPTURE_BAR_SHADOW_CLASS)}
          >
            <div role="menu" aria-label={t('screenshot.bar.sizeLabel')} class="contents">
              <Button
                variant="ghost"
                size="sm"
                role="menuitemradio"
                aria-checked={!reduceImageSize}
                tabIndex={-1}
                class="h-auto w-full justify-start gap-2 py-1.5 text-left text-sm"
                onClick={() => selectSize(false)}
              >
                <Check
                  class={cn('w-4 h-4 shrink-0', reduceImageSize && 'invisible')}
                  aria-hidden="true"
                />
                <span class="flex flex-col leading-tight">
                  <span>{t('screenshot.bar.sizeFull')}</span>
                  <span class="text-2xs font-normal text-muted-foreground">
                    {t('screenshot.bar.sizeFullHint')}
                  </span>
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                role="menuitemradio"
                aria-checked={reduceImageSize}
                tabIndex={-1}
                class="h-auto w-full justify-start gap-2 py-1.5 text-left text-sm"
                onClick={() => selectSize(true)}
              >
                <Check
                  class={cn('w-4 h-4 shrink-0', !reduceImageSize && 'invisible')}
                  aria-hidden="true"
                />
                <span class="flex flex-col leading-tight">
                  <span>{t('screenshot.bar.sizeReduced')}</span>
                  <span class="text-2xs font-normal text-muted-foreground">
                    {t('screenshot.bar.sizeReducedHint')}
                  </span>
                </span>
              </Button>
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

      {oversizedCapture && !isCountingDown && (
        <Alert
          role="alert"
          class="flex w-0 min-w-full items-start gap-2 border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div class="min-w-0 flex-1 leading-relaxed">
            <p class="text-xs font-medium text-inherit">
              {t('screenshot.error.captureTooLarge', {
                size: oversizedCapture.sizeMb,
                limit: oversizedCapture.limitMb,
              })}
            </p>
            <p class="mt-0.5 text-xs text-inherit opacity-90">
              {t('screenshot.error.captureTooLargeHint')}
            </p>
          </div>
          {onDismissOversizedCapture && (
            <button
              type="button"
              onClick={onDismissOversizedCapture}
              class="-mt-0.5 -mr-1 shrink-0 rounded p-1 text-inherit transition-colors hover:bg-warning/15 focus-visible:[outline:2px_solid_currentColor] focus-visible:outline-offset-2"
              aria-label={t('aria.close')}
            >
              <X class="h-3.5 w-3.5" />
            </button>
          )}
        </Alert>
      )}
    </Card>
  );
};
