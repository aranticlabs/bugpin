import { FunctionComponent } from 'preact';
import { cn } from '../../lib/utils';

export interface SeparatorProps {
  class?: string;
  orientation?: 'horizontal' | 'vertical';
}

export const Separator: FunctionComponent<SeparatorProps> = ({
  class: className,
  orientation = 'horizontal',
}) => {
  return (
    <span
      aria-hidden="true"
      class={cn(
        'block shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
    />
  );
};
