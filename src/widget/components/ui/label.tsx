import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';

export interface LabelProps extends JSX.HTMLAttributes<HTMLLabelElement> {
  class?: string;
  required?: boolean;
  for?: string;
}

export const Label: FunctionComponent<LabelProps> = ({
  class: className,
  required,
  children,
  for: htmlFor,
  ...props
}) => {
  return (
    <label for={htmlFor} class={cn('text-sm font-medium text-foreground', className)} {...props}>
      {children}
      {required && <span class="text-destructive ml-0.5">*</span>}
    </label>
  );
};
