import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';

export interface SelectProps extends JSX.HTMLAttributes<HTMLSelectElement> {
  class?: string;
  error?: boolean;
  value?: string;
  disabled?: boolean;
}

export const Select: FunctionComponent<SelectProps> = ({
  class: className,
  error,
  children,
  ...props
}) => {
  return (
    <select
      class={cn(
        'h-10 w-full px-3 py-2 border border-solid border-input rounded-sm text-sm font-sans text-foreground bg-transparent cursor-pointer transition-colors',
        'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20',
        error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
        className,
      )}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    >
      {children}
    </select>
  );
};
