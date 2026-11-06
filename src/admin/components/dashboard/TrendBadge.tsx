import type { ReactNode } from 'react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';

export function TrendBadge({
  good,
  children,
  className,
}: {
  good: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-0.5 border-transparent',
        good ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
        className
      )}
    >
      {children}
    </Badge>
  );
}
