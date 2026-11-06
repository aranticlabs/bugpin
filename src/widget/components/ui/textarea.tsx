import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';
import { FORM_CONTROL_CLASS, FORM_CONTROL_ERROR_CLASS } from './form-control';

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
        FORM_CONTROL_CLASS,
        'min-h-20 resize-y',
        error && FORM_CONTROL_ERROR_CLASS,
        className
      )}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  );
};
