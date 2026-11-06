import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';
import { FORM_CONTROL_CLASS, FORM_CONTROL_ERROR_CLASS } from './form-control';

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
        FORM_CONTROL_CLASS,
        'h-10 cursor-pointer',
        error && FORM_CONTROL_ERROR_CLASS,
        className
      )}
      aria-invalid={error ? 'true' : undefined}
      {...props}
    >
      {children}
    </select>
  );
};
