import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';

export interface InputProps extends JSX.HTMLAttributes<HTMLInputElement> {
  class?: string;
  error?: boolean;
  type?: string;
  placeholder?: string;
  value?: string | number;
  maxLength?: number;
  disabled?: boolean;
}

export const Input: FunctionComponent<InputProps> = ({
  class: className,
  error,
  type = 'text',
  ...props
}) => {
  return (
    <input
      type={type}
      class={cn(
        'h-10 w-full px-3 py-2 border border-solid border-input rounded-sm text-sm font-sans text-foreground bg-transparent transition-colors',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20',
        error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
        className,
      )}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  );
};
