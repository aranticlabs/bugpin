import { ChevronDown, Share2, Trash2, X } from 'lucide-react';
import type { User } from '@shared/types';
import type { ReportShareFormat } from '../../lib/reportsShareExport';
import { Button } from '../ui/button';
import { FloatingBar } from '../FloatingBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { AssigneeDisplay } from './ReportFields';

interface ReportsBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  updating: boolean;
  deleting: boolean;
  /** Some selected reports are read-only, so changes are disabled */
  readOnly: boolean;
  canAssign: boolean;
  assignableUsers: User[];
  onStatusChange: (status: string) => void;
  onPriorityChange: (priority: string) => void;
  onAssigneeChange: (assigneeId: string | null) => void;
  onShare: (format: ReportShareFormat) => void;
  onDelete: () => void;
}

/** Actions for the selected reports, floating over the bottom of the page */
export function ReportsBulkActionBar({
  selectedCount,
  onClear,
  updating,
  deleting,
  readOnly,
  canAssign,
  assignableUsers,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onShare,
  onDelete,
}: ReportsBulkActionBarProps) {
  return (
    <FloatingBar label="Selected reports">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">
          {selectedCount} {selectedCount === 1 ? 'report' : 'reports'} selected
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Status dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={updating || readOnly}>
              Set Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onStatusChange('open')}>Open</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange('in_progress')}>
              In Progress
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange('resolved')}>Resolved</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange('closed')}>Closed</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Priority dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={updating || readOnly}>
              Set Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onPriorityChange('highest')}>Highest</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('high')}>High</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('medium')}>Medium</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('low')}>Low</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPriorityChange('lowest')}>Lowest</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {canAssign && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={updating || readOnly}>
                Assign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onAssigneeChange(null)}>Unassign</DropdownMenuItem>
              {assignableUsers.map((assignee) => (
                <DropdownMenuItem key={assignee.id} onClick={() => onAssigneeChange(assignee.id)}>
                  <AssigneeDisplay user={assignee} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Share2 className="h-4 w-4 mr-1" />
              Share
              <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onShare('excel')}>
              Download Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onShare('csv')}>Download CSV (.csv)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete button */}
        <Button
          variant="outline-destructive"
          size="sm"
          onClick={onDelete}
          disabled={deleting || readOnly}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>
    </FloatingBar>
  );
}
