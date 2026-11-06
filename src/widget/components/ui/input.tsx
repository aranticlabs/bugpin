import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';
import { FORM_CONTROL_CLASS, FORM_CONTROL_ERROR_CLASS } from './form-control';

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
      class={cn(FORM_CONTROL_CLASS, 'h-10', error && FORM_CONTROL_ERROR_CLASS, className)}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    />
  );
};
