import { FunctionComponent } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon.js';
import { cn } from '../lib/utils';

interface WidgetLauncherButtonProps {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonText: string | null;
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
  tooltipText: string | null;
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
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [tooltipOffset, setTooltipOffset] = useState({
    left: '50%',
    transform: 'translateX(-50%)',
    arrowLeft: '50%',
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Detect theme on mount and when theme setting changes
  useEffect(() => {
    if (theme === 'dark') {
      setIsDarkMode(true);
      return;
    } else if (theme === 'light') {
      setIsDarkMode(false);
      return;
    }

    // Auto mode: detect from page
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    darkModeMediaQuery.addEventListener('change', handler);
    return () => darkModeMediaQuery.removeEventListener('change', handler);
  }, [theme]);

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
  }, [isHovered, tooltipText]);

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
  const ariaLabel = buttonText || 'Report Bug';

  // For round shape, padding scales with icon size (half the icon size)
  const padding = buttonShape === 'round' ? `${buttonIconSize / 2}px` : '12px 20px';

  return (
    <div class={cn('fixed z-[2147483647]', positionClasses[position])}>
      <button
        ref={buttonRef}
        class={cn(
          'relative flex items-center justify-center gap-2 border-none text-sm font-medium cursor-pointer shadow-lg transition-all duration-200',
          enableHoverScaleEffect && 'hover:scale-110 hover:shadow-xl active:scale-105',
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
        {buttonText && <span>{buttonText}</span>}
      </button>

      {tooltipEnabled && tooltipText && isHovered && (
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
          {tooltipText}
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
