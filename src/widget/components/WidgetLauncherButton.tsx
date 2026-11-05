import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.js';
import { cn } from '../lib/utils';
import { useEffectiveTheme } from '../hooks/use-effective-theme.js';
import { useLocale } from '../hooks/use-locale.js';
import { getLocale, t } from '../i18n/index.js';
import { resolveLauncherText } from '../i18n/resolve-launcher-text.js';
import type { LauncherTextBundle } from '../config.js';
import { computeTooltipShift } from '@shared/tooltip-position.js';

interface WidgetLauncherButtonProps {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: LauncherTextBundle;
  buttonShape: 'round' | 'rectangle';
  buttonIcon: string | null;
  buttonIconSize: number;
  buttonIconStroke: number;
  buttonOffsetX: number;
  buttonOffsetY: number;
  buttonSizeUnit: 'px' | 'rem';
  theme: 'auto' | 'light' | 'dark';
  lightButtonColor: string;
  lightTextColor: string;
  lightButtonHoverColor: string;
  lightTextHoverColor: string;
  darkButtonColor: string;
  darkTextColor: string;
  darkButtonHoverColor: string;
  darkTextHoverColor: string;
  enableHoverScaleEffect: boolean;
  tooltipEnabled: boolean;
  tooltipText: LauncherTextBundle;
  hasPendingRecording?: boolean;
  onClick: () => void;
}

// rem resolves against the host page's root font size, even inside the Shadow DOM.
// The safe-area inset is 0 unless the host page opts in with viewport-fit=cover.
function getPositionStyle(
  position: WidgetLauncherButtonProps['position'],
  offsetX: number,
  offsetY: number,
  unit: WidgetLauncherButtonProps['buttonSizeUnit']
): Record<string, string> {
  const [vertical, horizontal] = position.split('-');
  return {
    [vertical]: `calc(${offsetY}${unit} + env(safe-area-inset-${vertical}, 0px))`,
    [horizontal]: `calc(${offsetX}${unit} + env(safe-area-inset-${horizontal}, 0px))`,
  };
}

export const WidgetLauncherButton: FunctionComponent<WidgetLauncherButtonProps> = ({
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
  hasPendingRecording = false,
  onClick,
}) => {
  useLocale();
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipShift, setTooltipShift] = useState(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const effectiveTheme = useEffectiveTheme(theme);
  const isDarkMode = effectiveTheme === 'dark';
  const activeLocale = getLocale();
  const resolvedButtonText = resolveLauncherText(
    buttonText.project,
    buttonText.global,
    activeLocale,
    buttonText.builtin?.[activeLocale] ?? null
  );
  const tooltipBuiltinForActive = tooltipText.builtin?.[activeLocale] ?? null;
  const resolvedTooltipText =
    resolveLauncherText(
      tooltipText.project,
      tooltipText.global,
      activeLocale,
      tooltipBuiltinForActive
    ) ?? t('tooltip.launcher');

  // Shift the tooltip sideways so it stays inside the window.
  useEffect(() => {
    if (isHovered && tooltipRef.current && buttonRef.current) {
      const tooltip = tooltipRef.current;
      const button = buttonRef.current;

      // Wait a frame so the tooltip has been laid out before measuring it
      requestAnimationFrame(() => {
        const buttonRect = button.getBoundingClientRect();
        setTooltipShift(
          computeTooltipShift(
            buttonRect.left + buttonRect.width / 2,
            tooltip.getBoundingClientRect().width,
            0,
            window.innerWidth
          )
        );
      });
    }
  }, [isHovered, resolvedTooltipText]);

  // Select colors based on theme and hover state
  const buttonColor = isDarkMode
    ? isHovered
      ? darkButtonHoverColor
      : darkButtonColor
    : isHovered
      ? lightButtonHoverColor
      : lightButtonColor;

  const textColor = isDarkMode
    ? isHovered
      ? darkTextHoverColor
      : darkTextColor
    : isHovered
      ? lightTextHoverColor
      : lightTextColor;

  // Base colors for tooltip (always use non-hover colors)
  const tooltipBgColor = isDarkMode ? darkButtonColor : lightButtonColor;
  const tooltipTextColor = isDarkMode ? darkTextColor : lightTextColor;

  const borderRadius = buttonShape === 'round' ? '50%' : '8px';
  const ariaLabel = resolvedButtonText || t('aria.launcher');
  const tooltipBelow = position.startsWith('top');

  // For round shape, padding scales with icon size (half the icon size)
  const padding = buttonShape === 'round' ? `${buttonIconSize / 2}${buttonSizeUnit}` : '12px 20px';

  return (
    <div
      class="fixed z-[2147483647]"
      style={getPositionStyle(position, buttonOffsetX, buttonOffsetY, buttonSizeUnit)}
    >
      <button
        ref={buttonRef}
        class={cn(
          'relative flex items-center justify-center gap-2 border-none text-sm font-medium cursor-pointer shadow-lg transition-all duration-200',
          enableHoverScaleEffect && 'hover:scale-110 hover:shadow-xl active:scale-105'
        )}
        style={{
          backgroundColor: buttonColor,
          color: textColor,
          borderRadius: borderRadius,
          padding: padding,
        }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={ariaLabel}
      >
        {buttonIcon && (
          <Icon
            name={buttonIcon}
            size={`${buttonIconSize}${buttonSizeUnit}`}
            strokeWidth={buttonIconStroke}
          />
        )}
        {resolvedButtonText && <span>{resolvedButtonText}</span>}
        {hasPendingRecording && (
          <span
            data-testid="bugpin-pending-recording"
            class="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 border-2 border-solid border-white"
            aria-hidden="true"
          />
        )}
      </button>

      {tooltipEnabled && resolvedTooltipText && isHovered && (
        <div
          ref={tooltipRef}
          class={cn(
            'absolute px-3 py-1.5 text-xs rounded whitespace-nowrap pointer-events-none z-[2147483647] animate-[bugpin-tooltip-fade-in_0.2s_ease-in-out_forwards] shadow-md',
            tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'
          )}
          style={{
            backgroundColor: tooltipBgColor,
            color: tooltipTextColor,
            opacity: 0,
            left: '50%',
            transform: `translateX(-50%) translateX(${tooltipShift}px)`,
          }}
        >
          {resolvedTooltipText}
        </div>
      )}
    </div>
  );
};
