import { ComponentChildren, FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../lib/utils';

export type TooltipSide = 'top' | 'bottom';

export interface TooltipProps {
  content: string;
  side?: TooltipSide;
  children: ComponentChildren;
}

export const Tooltip: FunctionComponent<TooltipProps> = ({ content, side = 'top', children }) => {
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
      <span
        role="tooltip"
        class={cn(
          'pointer-events-none invisible absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground group-hover/tooltip:visible',
          side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
          !pointerFocused && 'group-has-[:focus-visible]/tooltip:visible'
        )}
      >
        {content}
      </span>
    </div>
  );
};
