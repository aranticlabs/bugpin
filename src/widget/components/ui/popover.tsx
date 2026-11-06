import { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '../../lib/utils';
import type { TooltipSide } from './tooltip';

export interface PopoverProps {
  open: boolean;
  side?: TooltipSide;
  sideOffset?: number;
  class?: string;
  children: ComponentChildren;
}

export const Popover: FunctionComponent<PopoverProps> = ({
  open,
  side = 'top',
  sideOffset = 4,
  class: className,
  children,
}) => {
  if (!open) return null;
  return (
    <div
      class={cn(
        'absolute left-1/2 z-10 w-max -translate-x-1/2 rounded-md border border-solid border-border bg-background p-4 text-foreground shadow-md',
        className
      )}
      style={
        side === 'top'
          ? { bottom: `calc(100% + ${sideOffset}px)` }
          : { top: `calc(100% + ${sideOffset}px)` }
      }
    >
      {children}
    </div>
  );
};
