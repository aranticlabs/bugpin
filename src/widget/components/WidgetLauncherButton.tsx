import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.js';
import { cn } from '../lib/utils';
import { useEffectiveTheme } from '../hooks/use-effective-theme.js';
import { useLocale } from '../hooks/use-locale.js';
import { getLocale, t } from '../i18n/index.js';
import { resolveLauncherText } from '../i18n/resolve-launcher-text.js';
import type { LauncherTextBundle } from '../config.js';

interface WidgetLauncherButtonProps {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: LauncherTextBundle;
  buttonShape: 'round' | 'rectangle';
  buttonIcon: string | null;
  buttonIconSize: number;
  buttonIconStroke: number;
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

const positionClasses: Record<string, string> = {
  'bottom-right': 'bottom-5 right-5',
  'bottom-left': 'bottom-5 left-5',
  'top-right': 'top-5 right-5',
  'top-left': 'top-5 left-5',
};

export const WidgetLauncherButton: FunctionComponent<WidgetLauncherButtonProps> = ({
  position,
  buttonText,
  buttonShape,
  buttonIcon,
  buttonIconSize,
  buttonIconStroke,
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
  const [tooltipOffset, setTooltipOffset] = useState({
    left: '50%',
    transform: 'translateX(-50%)',
    arrowLeft: '50%',
  });
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

  // Calculate tooltip position to ensure 4px margin from window edges
  useEffect(() => {
    if (isHovered && tooltipRef.current && buttonRef.current) {
      const tooltip = tooltipRef.current;
      const button = buttonRef.current;

      // Small delay to ensure tooltip is rendered
      requestAnimationFrame(() => {
        const tooltipRect = tooltip.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const margin = 4;

        // Calculate button center in viewport coordinates
        const buttonCenter = buttonRect.left + buttonRect.width / 2;
        const tooltipHalfWidth = tooltipRect.width / 2;

        // Calculate how much to shift from centered position
        let shift = 0;
        const centeredLeft = buttonCenter - tooltipHalfWidth;

        // Check if tooltip would go off-screen on the left
        if (centeredLeft < margin) {
          shift = margin - centeredLeft;
        }
        // Check if tooltip would go off-screen on the right
        else if (centeredLeft + tooltipRect.width > windowWidth - margin) {
          shift = windowWidth - margin - (centeredLeft + tooltipRect.width);
        }

        setTooltipOffset({
          left: '50%',
          transform: `translateX(-50%) translateX(${shift}px)`,
          arrowLeft: '50%',
        });
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

  // For round shape, padding scales with icon size (half the icon size)
  const padding = buttonShape === 'round' ? `${buttonIconSize / 2}px` : '12px 20px';

  return (
    <div class={cn('fixed z-[2147483647]', positionClasses[position])}>
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
          <Icon name={buttonIcon} size={buttonIconSize} strokeWidth={buttonIconStroke} />
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
          class="absolute bottom-full mb-2 px-3 py-1.5 text-xs rounded whitespace-nowrap pointer-events-none z-[2147483647] animate-[bugpin-tooltip-fade-in_0.2s_ease-in-out_forwards] shadow-md"
          style={{
            backgroundColor: tooltipBgColor,
            color: tooltipTextColor,
            opacity: 0,
            left: tooltipOffset.left,
            transform: tooltipOffset.transform,
          }}
        >
          {resolvedTooltipText}
          <div
            class="absolute top-full border-4 border-solid border-transparent"
            style={{
              left: tooltipOffset.arrowLeft,
              transform: 'translateX(-50%)',
              marginTop: '-4px',
              borderTopColor: tooltipBgColor,
            }}
          />
        </div>
      )}
    </div>
  );
};
