import {
  CircleDot,
  CircleCheck,
  CircleDotDashed,
  CircleSlash2,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { ReportPriority, ReportStatus } from '@shared/types';
import { cn } from '../../lib/utils';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const REPORT_PRIORITY_LABELS: Record<ReportPriority, string> = {
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
};

// Status uses cool hues and priority warm ones, so the two never share a color.
// Only the three most urgent priorities are colored; Low and Lowest stay gray.
const STATUS_ICONS: Record<ReportStatus, { icon: LucideIcon; className: string }> = {
  open: { icon: CircleDot, className: 'text-sky-500' },
  in_progress: { icon: CircleDotDashed, className: 'text-indigo-500 dark:text-indigo-400' },
  resolved: { icon: CircleCheck, className: 'text-emerald-500' },
  closed: { icon: CircleSlash2, className: 'text-muted-foreground' },
};

const PRIORITY_ICONS: Record<
  ReportPriority,
  { icon: LucideIcon; className: string; barClassName: string }
> = {
  highest: { icon: TriangleAlert, className: 'text-red-500', barClassName: 'bg-red-500' },
  high: {
    icon: Signal,
    className: 'text-orange-600 dark:text-orange-500',
    barClassName: 'bg-orange-600 dark:bg-orange-500',
  },
  medium: {
    icon: SignalHigh,
    className: 'text-amber-600 dark:text-amber-500',
    barClassName: 'bg-amber-600 dark:bg-amber-500',
  },
  low: {
    icon: SignalMedium,
    className: 'text-muted-foreground',
    barClassName: 'bg-muted-foreground',
  },
  lowest: {
    icon: SignalLow,
    className: 'text-muted-foreground',
    barClassName: 'bg-muted-foreground/50',
  },
};

/** Fill color for a priority in charts and stacked bars. */
export function reportPriorityBarClass(priority: ReportPriority): string {
  return PRIORITY_ICONS[priority].barClassName;
}

function isStatus(value: string): value is ReportStatus {
  return value in STATUS_ICONS;
}

function isPriority(value: string): value is ReportPriority {
  return value in PRIORITY_ICONS;
}

export function ReportStatusIcon({
  status,
  className,
}: {
  status: ReportStatus;
  className?: string;
}) {
  const { icon: Icon, className: color } = STATUS_ICONS[status];
  return <Icon className={cn('size-4 shrink-0', color, className)} aria-hidden />;
}

export function ReportStatusLabel({ status, label }: { status: string; label?: string }) {
  if (!isStatus(status)) return <span className="text-sm">{label ?? status}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <ReportStatusIcon status={status} />
      {label ?? REPORT_STATUS_LABELS[status]}
    </span>
  );
}

export function ReportPriorityIcon({ priority }: { priority: string }) {
  if (!isPriority(priority)) return null;
  const { icon: Icon, className } = PRIORITY_ICONS[priority];
  const label = `${REPORT_PRIORITY_LABELS[priority]} priority`;
  return (
    <span className="inline-flex shrink-0" title={label}>
      <Icon className={cn('size-4', className)} role="img" aria-label={label} />
    </span>
  );
}

export function ReportPriorityLabel({ priority }: { priority: string }) {
  if (!isPriority(priority))
    return <span className="text-sm text-muted-foreground">{priority}</span>;
  const { icon: Icon, className } = PRIORITY_ICONS[priority];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
      <Icon className={cn('size-4 shrink-0', className)} aria-hidden />
      {REPORT_PRIORITY_LABELS[priority]}
    </span>
  );
}
