import { Avatar, AvatarFallback } from '../ui/avatar';
import { Spinner } from '../ui/spinner';
import { formatDateTime } from '../../lib/utils';
import type { ReportHistoryEntry } from '@shared/types';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_LABELS: Record<string, string> = {
  lowest: 'Lowest',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  highest: 'Highest',
};

function formatHistoryMessage(entry: ReportHistoryEntry): string {
  const actor = entry.userName ?? 'System';

  switch (entry.action) {
    case 'created':
      return `${actor} created this report`;
    case 'status_changed':
      return `${actor} changed status from ${STATUS_LABELS[entry.oldValue ?? ''] ?? entry.oldValue} to ${STATUS_LABELS[entry.newValue ?? ''] ?? entry.newValue}`;
    case 'priority_changed':
      return `${actor} changed priority from ${PRIORITY_LABELS[entry.oldValue ?? ''] ?? entry.oldValue} to ${PRIORITY_LABELS[entry.newValue ?? ''] ?? entry.newValue}`;
    case 'assignee_changed': {
      const from = entry.oldDisplay ?? 'Unassigned';
      const to = entry.newDisplay ?? 'Unassigned';
      if (!entry.oldValue && entry.newValue) {
        return `${actor} assigned this to ${to}`;
      }
      if (entry.oldValue && !entry.newValue) {
        return `${actor} unassigned ${from}`;
      }
      return `${actor} reassigned from ${from} to ${to}`;
    }
    default:
      return `${actor} updated this report`;
  }
}

function actorInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ReportHistoryTimelineProps {
  entries: ReportHistoryEntry[];
  isLoading: boolean;
}

export function ReportHistoryTimeline({ entries, isLoading }: ReportHistoryTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" className="text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {[...entries].reverse().map((entry) => {
        const actor = entry.userName ?? 'System';
        return (
          <div key={entry.id} className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{actorInitials(actor)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">{formatHistoryMessage(entry)}</p>
              <p className="text-xs text-muted-foreground" title={formatDateTime(entry.createdAt)}>
                {formatDateTime(entry.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
