import type { FormEvent } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import {
  ACTIVE_REPORT_STATUSES,
  ASSIGNED_TO_ME_FILTER,
  UNASSIGNED_FILTER,
  type ProjectSummary,
  type ReportSortKey,
  type ReportView,
  type User,
} from '@shared/types';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ReportViewSwitcher } from '../report-board/ReportViewSwitcher';
import { AssigneeDisplay } from './ReportFields';

export type ReportsFilterKey =
  'status' | 'priority' | 'projectId' | 'assignedTo' | 'reporterActivity';

const BOARD_SORT_OPTIONS: { key: ReportSortKey; label: string }[] = [
  { key: 'position', label: 'Manual' },
  { key: 'createdAt', label: 'Newest' },
  { key: 'updatedAt', label: 'Last updated' },
  { key: 'priority', label: 'Priority' },
  { key: 'title', label: 'Title' },
  { key: 'project', label: 'Project' },
  { key: 'assignee', label: 'Assignee' },
];

interface ReportsToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent) => void;
  filters: Record<ReportsFilterKey, string>;
  onFilterChange: (key: ReportsFilterKey, value: string) => void;
  projects?: ProjectSummary[];
  showProjectFilter: boolean;
  assignableUsers: User[];
  showAssigneeFilter: boolean;
  view: ReportView;
  onViewChange: (view: ReportView) => void;
  boardSort: ReportSortKey;
  onBoardSortChange: (key: ReportSortKey) => void;
  canCreate: boolean;
  onCreate: () => void;
}

/** Search, filters, board sort, view switcher, and the create button above the reports */
export function ReportsToolbar({
  search,
  onSearchChange,
  onSearchSubmit,
  filters,
  onFilterChange,
  projects,
  showProjectFilter,
  assignableUsers,
  showAssigneeFilter,
  view,
  onViewChange,
  boardSort,
  onBoardSortChange,
  canCreate,
  onCreate,
}: ReportsToolbarProps) {
  const { status, priority, projectId, assignedTo } = filters;

  // Below xl the filters wrap onto their own row under search and the create button; from xl up
  // the wrapper dissolves so everything shares one row.
  return (
    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
      <form
        onSubmit={onSearchSubmit}
        className="relative min-w-40 flex-1 xl:min-w-32 xl:max-w-72 xl:flex-[2_1_0%]"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          aria-label="Search reports"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search reports..."
          className="pl-10"
        />
      </form>

      <div className="order-last flex w-full flex-wrap items-center gap-2 xl:contents">
        <Select value={status || 'all'} onValueChange={(value) => onFilterChange('status', value)}>
          <SelectTrigger
            className="min-w-32 flex-1 xl:min-w-20 xl:max-w-42.5"
            aria-label="Filter by status"
          >
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value={ACTIVE_REPORT_STATUSES.join(',')}>Open + In Progress</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={priority || 'all'}
          onValueChange={(value) => onFilterChange('priority', value)}
        >
          <SelectTrigger
            className="min-w-32 flex-1 xl:min-w-20 xl:max-w-37.5"
            aria-label="Filter by priority"
          >
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="highest">Highest</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="lowest">Lowest</SelectItem>
          </SelectContent>
        </Select>

        {showProjectFilter && (
          <Select
            value={projectId || 'all'}
            onValueChange={(value) => onFilterChange('projectId', value)}
          >
            <SelectTrigger
              className="min-w-32 flex-1 xl:min-w-20 xl:max-w-45"
              aria-label="Filter by project"
            >
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects?.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {showAssigneeFilter && (
          <Select
            value={assignedTo || 'all'}
            onValueChange={(value) => onFilterChange('assignedTo', value)}
          >
            <SelectTrigger
              className="min-w-32 flex-1 xl:min-w-20 xl:max-w-45"
              aria-label="Filter by assignee"
            >
              <SelectValue placeholder="All assignees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              <SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>
              <SelectItem value={ASSIGNED_TO_ME_FILTER}>Assigned to me</SelectItem>
              {assignableUsers.map((assignee) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  <AssigneeDisplay user={assignee} compact />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filters.reporterActivity || 'all'}
          onValueChange={(value) => onFilterChange('reporterActivity', value)}
        >
          <SelectTrigger
            className="min-w-32 flex-1 xl:min-w-20 xl:max-w-45"
            aria-label="Filter by reporter activity"
          >
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="new">New reporter activity</SelectItem>
          </SelectContent>
        </Select>

        {view === 'board' && (
          <TooltipProvider>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Sort cards"
                    >
                      <ArrowUpDown />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  Sort:{' '}
                  {BOARD_SORT_OPTIONS.find((option) => option.key === boardSort)?.label ?? 'Custom'}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Sort cards by
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={boardSort}
                  onValueChange={(value) => {
                    const option = BOARD_SORT_OPTIONS.find((candidate) => candidate.key === value);
                    if (option) onBoardSortChange(option.key);
                  }}
                >
                  {BOARD_SORT_OPTIONS.filter(
                    (option) => showProjectFilter || option.key !== 'project'
                  ).map((option) => (
                    <DropdownMenuRadioItem key={option.key} value={option.key}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ReportViewSwitcher value={view} onChange={onViewChange} />
        {canCreate && (
          <Button onClick={onCreate} className="shrink-0">
            Create Report
          </Button>
        )}
      </div>
    </div>
  );
}
