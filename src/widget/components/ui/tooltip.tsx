import { ComponentChildren, FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../lib/utils';

export type TooltipSide = 'top' | 'bottom';
export type TooltipAlign = 'center' | 'end';

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
            align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
            side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
            // Visibility switches at the end of its transition delay, so hover waits before
            // showing while hiding and keyboard focus stay immediate.
            '[transition:visibility_0s] group-hover/tooltip:[transition-delay:500ms]',
            !pointerFocused && 'group-has-[:focus-visible]/tooltip:visible'
          )}
        >
          {content}
        </span>
      )}
    </div>
  );
};
