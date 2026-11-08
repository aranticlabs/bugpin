import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '../../../lib/utils';
import { resolveForPreview } from '../../../lib/localizedPreview';
import { computeTooltipShift, LAUNCHER_TOOLTIP_DELAY_MS } from '@shared/tooltip-position';
import type {
  GlobalWidgetLauncherButtonSettings,
  LocaleCode,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { AVAILABLE_ICONS, TOOLTIP_BUILTIN_PREVIEW } from './constants';
import { splitPosition, toPx } from './sizing';
import { resolveLauncherSettings, type LauncherGlobals } from './resolveLauncherSettings';

// The preview box is much smaller than a real page, so large offsets are capped to keep the button visible.
const MAX_PREVIEW_OFFSET_PX = 64;

interface LauncherPreviewProps extends Omit<
  GlobalWidgetLauncherButtonSettings,
  'buttonText' | 'tooltipText'
> {
  buttonText: string | null;
  tooltipText: string | null;
}

function LauncherPreview({
  position,
  buttonText,
  buttonShape,
  buttonIcon,
  buttonIconSize,
  buttonIconStroke,
  buttonOffsetX,
  buttonOffsetY,
  buttonSizeUnit,
  theme,
  lightButtonColor,
  lightTextColor,
  lightButtonHoverColor,
  lightTextHoverColor,
  darkButtonColor,
  darkTextColor,
  darkButtonHoverColor,
  darkTextHoverColor,
  enableHoverScaleEffect,
  tooltipEnabled,
  tooltipText,
}: LauncherPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipShift, setTooltipShift] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const offsetX = toPx(buttonOffsetX, buttonSizeUnit);
  const offsetY = toPx(buttonOffsetY, buttonSizeUnit);
  const previousOffsets = useRef({ x: offsetX, y: offsetY });
  const [marginHighlights, setMarginHighlights] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const xChanged = previousOffsets.current.x !== offsetX;
    const yChanged = previousOffsets.current.y !== offsetY;
    previousOffsets.current = { x: offsetX, y: offsetY };
    if (xChanged || yChanged) {
      setMarginHighlights((current) => ({
        x: current.x + Number(xChanged),
        y: current.y + Number(yChanged),
      }));
    }
  }, [offsetX, offsetY]);

  useEffect(() => {
    if (!isHovered) {
      setTooltipVisible(false);
      return;
    }
    const timer = setTimeout(() => setTooltipVisible(true), LAUNCHER_TOOLTIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isHovered]);

  // Same clamping as the real widget, with the preview box standing in for the browser window.
  useLayoutEffect(() => {
    const bounds = wrapperRef.current?.parentElement;
    if (!tooltipVisible || !bounds || !buttonRef.current || !tooltipRef.current) return;
    const boundsRect = bounds.getBoundingClientRect();
    const buttonRect = buttonRef.current.getBoundingClientRect();
    setTooltipShift(
      computeTooltipShift(
        buttonRect.left + buttonRect.width / 2,
        tooltipRef.current.offsetWidth,
        boundsRect.left,
        boundsRect.right
      )
    );
  }, [tooltipVisible, tooltipText, position, buttonOffsetX, buttonSizeUnit]);

  const isDarkMode = theme === 'dark';

  // The tooltip uses the base (non-hover) colors, matching the real widget.
  const colorVars = {
    '--launcher-bg': isDarkMode ? darkButtonColor : lightButtonColor,
    '--launcher-fg': isDarkMode ? darkTextColor : lightTextColor,
    '--launcher-bg-hover': isDarkMode ? darkButtonHoverColor : lightButtonHoverColor,
    '--launcher-fg-hover': isDarkMode ? darkTextHoverColor : lightTextHoverColor,
  } as CSSProperties;

  const iconSizePx = toPx(buttonIconSize, buttonSizeUnit);

  // Get the icon component
  const IconComponent = AVAILABLE_ICONS.find((i) => i.value === buttonIcon)?.icon;

  const tooltipBelow = position.startsWith('top');
  const { vertical, horizontal } = splitPosition(position);
  const previewOffsetX = Math.min(offsetX, MAX_PREVIEW_OFFSET_PX);
  const previewOffsetY = Math.min(offsetY, MAX_PREVIEW_OFFSET_PX);
  const positionStyle = {
    ...colorVars,
    top: vertical === 'top' ? `${previewOffsetY}px` : `calc(100% - ${previewOffsetY}px)`,
    left: horizontal === 'left' ? `${previewOffsetX}px` : `calc(100% - ${previewOffsetX}px)`,
    maxWidth: `calc(100% - ${previewOffsetX}px)`,
  };

  return (
    <>
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none text-xs font-medium leading-none',
          isDarkMode ? 'text-sky-300' : 'text-sky-800'
        )}
        data-preview-theme={isDarkMode ? 'dark' : 'light'}
        aria-hidden="true"
      >
        {marginHighlights.x > 0 && (
          <div
            key={`x-${marginHighlights.x}`}
            aria-hidden="true"
            data-testid="launcher-preview-margin-x"
            className="launcher-preview-margin absolute inset-y-0 flex items-center justify-center"
            style={{ [horizontal]: 0, width: Math.max(previewOffsetX, 2) }}
          >
            <span
              className="relative shrink-0 whitespace-nowrap -rotate-90"
              style={{ [horizontal]: Math.max(0, (16 - previewOffsetX) / 2) }}
            >
              {buttonOffsetX} {buttonSizeUnit}
            </span>
          </div>
        )}
        {marginHighlights.y > 0 && (
          <div
            key={`y-${marginHighlights.y}`}
            aria-hidden="true"
            data-testid="launcher-preview-margin-y"
            className="launcher-preview-margin absolute inset-x-0 flex items-center justify-center"
            style={{ [vertical]: 0, height: Math.max(previewOffsetY, 2) }}
          >
            <span
              className="relative shrink-0 whitespace-nowrap"
              style={{ [vertical]: Math.max(0, (16 - previewOffsetY) / 2) }}
            >
              {buttonOffsetY} {buttonSizeUnit}
            </span>
          </div>
        )}
      </div>
      <div
        ref={wrapperRef}
        data-testid="launcher-preview-wrapper"
        className={cn(
          'absolute inline-block w-max transition-[top,left,translate] duration-300 ease-in-out motion-reduce:transition-none',
          horizontal !== 'left' && '-translate-x-full',
          vertical !== 'top' && '-translate-y-full'
        )}
        style={positionStyle}
      >
        {/* Radii mirror the widget's own launcher, which does not use the Admin Console radius scale */}
        <button
          ref={buttonRef}
          type="button"
          className={cn(
            'inline-flex cursor-pointer items-center justify-center gap-2 border-none text-sm font-medium',
            'bg-(--launcher-bg) text-(--launcher-fg) shadow-[0_4px_12px_rgb(0_0_0/0.15)]',
            'hover:bg-(--launcher-bg-hover) hover:text-(--launcher-fg-hover)',
            'focus-visible:bg-(--launcher-bg-hover) focus-visible:text-(--launcher-fg-hover) focus-visible:focus-ring',
            'transition-[background-color,color,scale,box-shadow] duration-200',
            buttonShape === 'round'
              ? 'rounded-full p-(--launcher-padding)'
              : 'rounded-[8px] px-5 py-3',
            enableHoverScaleEffect &&
              'duration-300 hover:scale-110 hover:shadow-[0_8px_20px_rgb(0_0_0/0.25)]'
          )}
          style={{ '--launcher-padding': `${iconSizePx / 2}px` } as CSSProperties}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={(e) => e.preventDefault()}
        >
          {IconComponent && <IconComponent size={iconSizePx} strokeWidth={buttonIconStroke} />}
          {buttonText && <span>{buttonText}</span>}
        </button>

        {/* Tooltip */}
        {tooltipEnabled && tooltipText && tooltipVisible && (
          <div
            ref={tooltipRef}
            data-testid="launcher-preview-tooltip"
            className={cn(
              'pointer-events-none absolute left-1/2 whitespace-nowrap',
              'translate-x-[calc(-50%+var(--tooltip-shift))] opacity-0 animate-tooltip-in',
              'rounded-[4px] bg-(--launcher-bg) px-3 py-1.5 font-widget text-xs font-normal text-(--launcher-fg) shadow-md',
              tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'
            )}
            style={{ '--tooltip-shift': `${tooltipShift}px` } as CSSProperties}
          >
            {tooltipText}
          </div>
        )}
      </div>
    </>
  );
}

export function WidgetLauncherPreview({
  value,
  globalSettings,
  mode,
  locale = 'en',
}: {
  value: WidgetLauncherButtonSettings;
  globalSettings: LauncherGlobals;
  mode?: 'light' | 'dark';
  locale?: LocaleCode;
}) {
  const effective = resolveLauncherSettings(value, globalSettings);
  const globalButtonText = globalSettings?.widgetLauncherButton.buttonText ?? null;
  const globalTooltipText = globalSettings?.widgetLauncherButton.tooltipText ?? null;
  return (
    <LauncherPreview
      {...effective}
      theme={mode ?? effective.theme}
      buttonText={resolveForPreview(value.buttonText, globalButtonText, null, locale)}
      tooltipText={
        resolveForPreview(value.tooltipText, globalTooltipText, TOOLTIP_BUILTIN_PREVIEW, locale) ??
        TOOLTIP_BUILTIN_PREVIEW[locale]
      }
    />
  );
}
