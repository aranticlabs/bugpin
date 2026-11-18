import { ComponentChildren, FunctionComponent, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../lib/utils';

export type TooltipSide = 'top' | 'bottom';
export type TooltipAlign = 'center' | 'end';

export function sideStyle(
  side: TooltipSide,
  offset: number,
  align: TooltipAlign = 'center'
): JSX.CSSProperties {
  return {
    // Tailwind's translate utilities rely on @property defaults, which do not apply in a shadow root.
    ...(align === 'end' ? { right: '0' } : { left: '50%', transform: 'translateX(-50%)' }),
    ...(side === 'top'
      ? { bottom: `calc(100% + ${offset}px)` }
      : { top: `calc(100% + ${offset}px)` }),
  };
}

export interface TooltipProps {
  content: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  /** Hides the tooltip without remounting the trigger, so the trigger keeps focus. */
  disabled?: boolean;
  children: ComponentChildren;
}

export const Tooltip: FunctionComponent<TooltipProps> = ({
  content,
  side = 'top',
  align = 'center',
  disabled = false,
  children,
}) => {
  // Browsers start matching :focus-visible on a clicked control once any key is
  // pressed, so focus that began with a pointer only shows the tooltip on hover.
  const [pointerFocused, setPointerFocused] = useState(false);

  return (
    <div
      class="group/tooltip relative inline-flex"
      onPointerDown={() => setPointerFocused(true)}
      onFocusOut={() => setPointerFocused(false)}
    >
      {children}
      {!disabled && (
        <span
          role="tooltip"
          class={cn(
            'pointer-events-none invisible absolute z-20 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground group-hover/tooltip:visible',
            // Visibility switches at the end of its transition delay, so hover waits before
            // showing while hiding and keyboard focus stay immediate.
            '[transition:visibility_0s] group-hover/tooltip:[transition-delay:500ms]',
            !pointerFocused && 'group-has-[:focus-visible]/tooltip:visible'
          )}
          style={sideStyle(side, 6, align)}
        >
          {content}
        </span>
      )}
    </div>
  );
};
