import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Label } from './label';

interface SettingRowProps {
  label: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  controlClassName?: string;
}

export function SettingRow({
  label,
  htmlFor,
  description,
  children,
  className,
  controlClassName,
}: SettingRowProps) {
  return (
    <div className={cn('@container py-3', className)}>
      <div className="flex flex-col gap-3 @sm:flex-row @sm:items-center @sm:justify-between @sm:gap-6">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={cn('flex shrink-0 flex-col gap-1 @sm:items-end', controlClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function SettingRowPair({ children }: { children: ReactNode }) {
  return <div className="grid @2xl:grid-cols-2 @2xl:gap-x-8">{children}</div>;
}

export function SettingRows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('@container divide-y', className)}>{children}</div>;
}
