import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';

export interface TextareaProps extends JSX.HTMLAttributes<HTMLTextAreaElement> {
  class?: string;
  error?: boolean;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
}

export const Textarea: FunctionComponent<TextareaProps> = ({
  class: className,
  error,
  ...props
}) => {
  return (
    <textarea
      class={cn(
        'min-h-20 w-full px-3 py-2 border border-solid border-input rounded-sm text-sm font-sans text-foreground bg-transparent resize-y transition-colors',
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
