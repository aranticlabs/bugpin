import { ComponentChildren, FunctionComponent } from 'preact';
import { cn } from '../../lib/utils';
import { sideStyle, type TooltipSide } from './tooltip';

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
        'absolute z-10 w-max rounded-md border border-solid border-border bg-background p-4 text-foreground shadow-md',
        className
      )}
      style={sideStyle(side, sideOffset)}
    >
      {children}
    </div>
  );
};
