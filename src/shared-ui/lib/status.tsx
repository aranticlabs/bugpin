import {
  CircleDot,
  CircleCheck,
  CircleDotDashed,
  CircleSlash2,
  type LucideIcon,
} from 'lucide-react';
import type { ReportStatus } from '@shared/types';
import { cn } from './utils';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_ICONS: Record<ReportStatus, { icon: LucideIcon; className: string }> = {
  open: { icon: CircleDot, className: 'text-sky-500' },
  in_progress: { icon: CircleDotDashed, className: 'text-indigo-500 dark:text-indigo-400' },
  resolved: { icon: CircleCheck, className: 'text-emerald-500' },
  closed: { icon: CircleSlash2, className: 'text-muted-foreground' },
};

function isStatus(value: string): value is ReportStatus {
  return value in STATUS_ICONS;
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
