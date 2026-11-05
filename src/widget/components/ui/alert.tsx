import { FunctionComponent, JSX } from 'preact';
import { cn } from '../../lib/utils';

export interface AlertProps extends JSX.HTMLAttributes<HTMLDivElement> {
  class?: string;
}

export const Alert: FunctionComponent<AlertProps> = ({
  class: className,
  role = 'alert',
  ...props
}) => {
  return (
    <div
      role={role}
      class={cn(
        'w-full rounded-lg border border-solid border-border bg-background px-4 py-3 text-sm text-foreground',
        className
      )}
      {...props}
    />
  );
};
