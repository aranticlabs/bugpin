import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  type PaginatedResponse,
  type Report,
  type ReportBoardMove,
  type ReportBoardScope,
  type ReportPriority,
  type ReportStatus,
  type ReportSortKey,
} from '@shared/types';
import { ReporterActivityIndicator } from '../../components/report/ReporterActivityIndicator';
import { api, getApiErrorMessage } from '../../api/client';
import { usePreference } from '../../hooks/useUserPreferences';
import { useFillScrollParentHeight } from '../../hooks/useFillScrollParentHeight';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  ReportBoard,
  type BoardSelection,
  type ReportBoardColumnData,
} from '../../components/report-board/ReportBoard';
import {
  DraggableReportBoard,
  type BoardPlacement,
} from '../../components/report-board/DraggableReportBoard';
import {
  AssigneeDisplay,
  GitHubSyncIcon,
  formatRelativeDate,
} from '../../components/report/ReportFields';
import {
  REPORT_STATUS_LABELS,
  ReportPriorityIcon,
} from '../../components/report/ReportStatusPriority';

const BOARD_MIN_HEIGHT = 320;
const BOARD_PAGE_SIZE = 20;
const NO_COLLAPSED_COLUMNS: ReportStatus[] = [];

export interface ReportsBoardFilters {
  reporterActivity?: 'new' | '';
  reporterId?: string;
  priority: string;
  projectId: string;
  assignedTo: string;
  search: string;
  sortBy: ReportSortKey;
  sortOrder: 'asc' | 'desc';
}

type ReportPage = PaginatedResponse<Report>;
type ColumnData = InfiniteData<ReportPage, string | null>;

interface Neighbors {
  previousId: string | null;
  nextId: string | null;
}

function columnQueryKey(status: ReportStatus, filters: ReportsBoardFilters): QueryKey {
  return ['reports', 'board', status, filters];
}

function isReportPriority(value: string): value is ReportPriority {
  return (REPORT_PRIORITIES as readonly string[]).includes(value);
}

/** The reports the board shows, so a drop on a sorted board only reorders those */
function boardScope(
  filters: ReportsBoardFilters,
  statuses: readonly ReportStatus[]
): ReportBoardScope {
  const priority = filters.priority.split(',').filter(isReportPriority);
  return {
    projectId: filters.projectId || undefined,
    reporterId: filters.reporterId || undefined,
    reporterActivity: filters.reporterActivity || undefined,
    status: [...statuses],
    priority: priority.length > 0 ? priority : undefined,
    assignedTo: filters.assignedTo || undefined,
    search: filters.search || undefined,
  };
}

// A report that moved while pages were loading can come back on a later page; keep the first.
function uniqueReports(reports: Report[]): Report[] {
  const seen = new Set<string>();
  return reports.filter((report) => {
    if (seen.has(report.id)) return false;
    seen.add(report.id);
    return true;
  });
}

function useBoardColumn(
  status: ReportStatus,
  filters: ReportsBoardFilters,
  enabled: boolean
): ReportBoardColumnData<Report> {
  const query = useInfiniteQuery({
    queryKey: columnQueryKey(status, filters),
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = {
        status,
        limit: String(BOARD_PAGE_SIZE),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };
      if (pageParam) params.after = pageParam;
      if (filters.priority) params.priority = filters.priority;
      if (filters.projectId) params.projectId = filters.projectId;
      if (filters.assignedTo) params.assignedTo = filters.assignedTo;
      if (filters.reporterId) params.reporterId = filters.reporterId;
      if (filters.reporterActivity) params.reporterActivity = filters.reporterActivity;
      if (filters.search) params.search = filters.search;
      const response = await api.get<ReportPage>('/reports', { params });
      return response.data;
    },
    initialPageParam: null as string | null,
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });

  return {
    status,
    items: uniqueReports(query.data?.pages.flatMap((page) => page.data) ?? []),
    total: query.data?.pages[0]?.total ?? 0,
    loading: query.isPending && enabled,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    onLoadMore: () => void query.fetchNextPage(),
    error: query.isError,
    onRetry: () => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()),
  };
}

function neighborsIn(data: ColumnData | undefined, reportId: string): Neighbors | undefined {
  const ids = uniqueReports(data?.pages.flatMap((page) => page.data) ?? []).map(
    (report) => report.id
  );
  const index = ids.indexOf(reportId);
  if (index === -1) return undefined;
  return { previousId: ids[index - 1] ?? null, nextId: ids[index + 1] ?? null };
}

function removeFromColumn(data: ColumnData | undefined, reportId: string): ColumnData | undefined {
  if (!data) return data;
  const contains = data.pages.some((page) => page.data.some((report) => report.id === reportId));
  if (!contains) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      data: page.data.filter((report) => report.id !== reportId),
      total: Math.max(0, page.total - 1),
    })),
  };
}

// Without neighbors the report goes to the top, where the server puts reports not placed by hand.
function addToColumn(
  data: ColumnData | undefined,
  report: Report,
  neighbors?: Neighbors
): ColumnData | undefined {
  if (!data) return data;
  const locate = (id: string | null) => {
    if (!id) return null;
    for (const [pageIndex, page] of data.pages.entries()) {
      const index = page.data.findIndex((candidate) => candidate.id === id);
      if (index !== -1) return { pageIndex, index };
    }
    return null;
  };
  const previous = locate(neighbors?.previousId ?? null);
  const next = locate(neighbors?.nextId ?? null);
  const lastPage = Math.max(0, data.pages.length - 1);
  const at = previous
    ? { pageIndex: previous.pageIndex, index: previous.index + 1 }
    : next
      ? next
      : neighbors?.previousId
        ? { pageIndex: lastPage, index: data.pages[lastPage]?.data.length ?? 0 }
        : { pageIndex: 0, index: 0 };

  return {
    ...data,
    pages: data.pages.map((page, pageIndex) => {
      const pageData = [...page.data];
      if (pageIndex === at.pageIndex) pageData.splice(at.index, 0, report);
      return { ...page, data: pageData, total: page.total + 1 };
    }),
  };
}

function BoardCardContent({ report, showProject }: { report: Report; showProject: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2 pr-7">
        <ReportPriorityIcon priority={report.priority} />
        {showProject && (
          <span className="truncate text-xs text-muted-foreground">
            {report.projectName || 'Unknown'}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug">
        <ReporterActivityIndicator active={report.hasNewReporterActivity} />
        {report.title}
      </p>
      {report.licenseLocked && (
        <p className="text-xs text-muted-foreground">Read-only · License limit</p>
      )}
      <p className="truncate text-xs text-muted-foreground">{report.metadata?.url || 'No URL'}</p>
      {report.reporterEmail && (
        <p className="truncate text-xs text-muted-foreground">
          {report.reporterName || report.reporterEmail}
        </p>
      )}
      <div className="mt-1 flex items-center gap-2 border-t pt-2">
        <div className="min-w-0 flex-1">
          <AssigneeDisplay user={report.assignee} compact />
        </div>
        <span className="pointer-events-auto flex">
          <GitHubSyncIcon report={report} />
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelativeDate(report.createdAt)}
        </span>
      </div>
    </div>
  );
}

function MoveToMenu({
  report,
  onMove,
  onOpen,
  selected,
  onToggleSelected,
}: {
  report: Report;
  onMove: (status: ReportStatus) => void;
  onOpen: () => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 bg-card"
          aria-label={`Actions for ${report.title}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Move to
        </DropdownMenuLabel>
        {REPORT_STATUSES.filter((status) => status !== report.status).map((status) => (
          <DropdownMenuItem key={status} onClick={() => onMove(status)}>
            {REPORT_STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleSelected}>
          {selected ? 'Deselect' : 'Select'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpen}>Open report</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Card selection on the board: modifier clicks, whole columns, and the drawn rectangle. Shift +
 * click selects from the last card picked with Cmd or Ctrl + click, within the same column.
 */
function useBoardSelection(
  columns: ReportBoardColumnData<Report>[],
  selectedIds: ReadonlySet<string>,
  onSelectionChange: (next: Set<string>) => void
): BoardSelection {
  const anchor = useRef<string | null>(null);
  return {
    selectedIds,
    onSelect: (id, mode) => {
      const next = new Set(selectedIds);
      const columnIds =
        columns
          .find((column) => column.items.some((item) => item.id === id))
          ?.items.map((item) => item.id) ?? [];
      const from = anchor.current ? columnIds.indexOf(anchor.current) : -1;
      if (mode === 'range' && from !== -1) {
        const to = columnIds.indexOf(id);
        for (const rangeId of columnIds.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          next.add(rangeId);
        }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        anchor.current = id;
      }
      onSelectionChange(next);
    },
    onSelectColumn: (status) => {
      const ids = columns.find((column) => column.status === status)?.items.map((item) => item.id);
      if (!ids) return;
      const next = new Set(selectedIds);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      onSelectionChange(next);
    },
    onChange: onSelectionChange,
    onClear: () => {
      anchor.current = null;
      onSelectionChange(new Set());
    },
  };
}

interface GroupMoveVariables {
  reports: Report[];
  placement: BoardPlacement;
  adoptSort?: ReportBoardMove['adoptSort'];
}

interface MoveVariables {
  report: Report;
  status: ReportStatus;
  neighbors?: Neighbors;
  adoptSort?: ReportBoardMove['adoptSort'];
  /** Where Undo puts the report back */
  undo?: { status: ReportStatus; neighbors?: Neighbors };
}

export function ReportsBoard({
  filters,
  visibleStatuses,
  canManageReports,
  showProject,
  onOpenReport,
  onManualOrder,
  selectedIds,
  onSelectionChange,
  onReportsChange,
}: {
  filters: ReportsBoardFilters;
  visibleStatuses: readonly ReportStatus[];
  canManageReports: boolean;
  showProject: boolean;
  onOpenReport: (reportId: string) => void;
  /** Switches the board's sort to Manual after a drop saved the sorted order as hand-made */
  onManualOrder: () => void;
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  /** The reports currently on the board, for actions on the selected ones */
  onReportsChange: (reports: Report[]) => void;
}) {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = usePreference('reportsBoardCollapsed', NO_COLLAPSED_COLUMNS);

  const columnsByStatus: Record<ReportStatus, ReportBoardColumnData<Report>> = {
    open: useBoardColumn('open', filters, visibleStatuses.includes('open')),
    in_progress: useBoardColumn('in_progress', filters, visibleStatuses.includes('in_progress')),
    resolved: useBoardColumn('resolved', filters, visibleStatuses.includes('resolved')),
    closed: useBoardColumn('closed', filters, visibleStatuses.includes('closed')),
  };
  const columns = visibleStatuses.map((status) => columnsByStatus[status]);
  const selection = useBoardSelection(columns, selectedIds, onSelectionChange);

  // Cards that leave the board, through filters or another column being hidden, leave the
  // selection too, so bulk actions only touch cards the user can see.
  const boardReports = columns.flatMap((column) => column.items);
  const boardSignature = boardReports.map((report) => `${report.id}:${report.status}`).join(',');
  const latest = useRef({ boardReports, selectedIds, onSelectionChange, onReportsChange });
  latest.current = { boardReports, selectedIds, onSelectionChange, onReportsChange };
  useEffect(() => {
    const current = latest.current;
    current.onReportsChange(current.boardReports);
    const onBoard = new Set(current.boardReports.map((report) => report.id));
    if ([...current.selectedIds].some((id) => !onBoard.has(id))) {
      current.onSelectionChange(new Set([...current.selectedIds].filter((id) => onBoard.has(id))));
    }
  }, [boardSignature]);

  const statusMutation = useMutation({
    mutationFn: async ({ report, status, neighbors, adoptSort }: MoveVariables) => {
      if (neighbors) {
        const move: ReportBoardMove = { status, ...neighbors, adoptSort };
        await api.patch(`/reports/${report.id}/board-position`, move);
      } else {
        await api.patch(`/reports/${report.id}`, { status });
      }
    },
    onMutate: async ({ report, status, neighbors }) => {
      await queryClient.cancelQueries({ queryKey: ['reports', 'board'] });
      const sourceKey = columnQueryKey(report.status, filters);
      const targetKey = columnQueryKey(status, filters);
      const origin = neighborsIn(queryClient.getQueryData<ColumnData>(sourceKey), report.id);
      queryClient.setQueryData<ColumnData>(sourceKey, (data) => removeFromColumn(data, report.id));
      queryClient.setQueryData<ColumnData>(targetKey, (data) =>
        addToColumn(data, { ...report, status }, neighbors)
      );
      return { sourceKey, targetKey, origin };
    },
    onError: (error, { report }, context) => {
      // Only this card goes back, so moves made while this one was saving keep their place.
      if (context) {
        queryClient.setQueryData<ColumnData>(context.targetKey, (data) =>
          removeFromColumn(data, report.id)
        );
        if (context.origin) {
          queryClient.setQueryData<ColumnData>(context.sourceKey, (data) =>
            addToColumn(data, report, context.origin)
          );
        }
      }
      toast.error(getApiErrorMessage(error, 'Failed to update the report status'));
    },
    onSuccess: (_data, { report, status, adoptSort, undo }) => {
      if (adoptSort) onManualOrder();
      const manualNote = adoptSort
        ? 'The board is now in Manual order, so cards stay where you drop them.'
        : undefined;
      if (report.status === status) {
        if (manualNote) toast.success('Switched the board to Manual order');
        return;
      }
      toast.success(`Moved "${report.title}" to ${REPORT_STATUS_LABELS[status]}`, {
        description: manualNote,
        action: undo
          ? {
              label: 'Undo',
              onClick: () =>
                moveReport(
                  { ...report, status },
                  { status: undo.status, neighbors: undo.neighbors }
                ),
            }
          : undefined,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const groupMutation = useMutation({
    mutationFn: async ({ reports, placement, adoptSort }: GroupMoveVariables) => {
      await api.post('/reports/bulk-board-position', {
        ids: reports.map((report) => report.id),
        status: placement.status,
        previousId: placement.previousId,
        nextId: placement.nextId,
        adoptSort,
      });
    },
    onMutate: async ({ reports, placement }) => {
      await queryClient.cancelQueries({ queryKey: ['reports', 'board'] });
      const origins = reports.map((report) => {
        const key = columnQueryKey(report.status, filters);
        return {
          report,
          key,
          neighbors: neighborsIn(queryClient.getQueryData<ColumnData>(key), report.id),
        };
      });
      for (const origin of origins) {
        queryClient.setQueryData<ColumnData>(origin.key, (data) =>
          removeFromColumn(data, origin.report.id)
        );
      }
      const targetKey = columnQueryKey(placement.status, filters);
      reports.forEach((report, index) => {
        const neighbors = {
          previousId: index === 0 ? placement.previousId : reports[index - 1].id,
          nextId: placement.nextId,
        };
        queryClient.setQueryData<ColumnData>(targetKey, (data) =>
          addToColumn(data, { ...report, status: placement.status }, neighbors)
        );
      });
      return { origins, targetKey };
    },
    onError: (error, { reports }, context) => {
      if (context) {
        for (const report of reports) {
          queryClient.setQueryData<ColumnData>(context.targetKey, (data) =>
            removeFromColumn(data, report.id)
          );
        }
        // In board order, so a card's upper neighbor from the same group is back before it is.
        for (const origin of context.origins) {
          if (!origin.neighbors) continue;
          queryClient.setQueryData<ColumnData>(origin.key, (data) =>
            addToColumn(data, origin.report, origin.neighbors)
          );
        }
      }
      toast.error(getApiErrorMessage(error, 'Failed to move the reports'));
    },
    onSuccess: (_data, { reports, placement, adoptSort }) => {
      if (adoptSort) onManualOrder();
      const manualNote = adoptSort
        ? 'The board is now in Manual order, so cards stay where you drop them.'
        : undefined;
      if (reports.every((report) => report.status === placement.status)) {
        if (manualNote) toast.success('Switched the board to Manual order');
        return;
      }
      toast.success(
        `Moved ${reports.length} reports to ${REPORT_STATUS_LABELS[placement.status]}`,
        {
          description: manualNote,
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const moveReport = (report: Report, move: Omit<MoveVariables, 'report'>) => {
    if (report.status === move.status && !move.neighbors) return;
    statusMutation.mutate({ report, ...move });
  };

  const changeStatus = (report: Report, status: ReportStatus) =>
    moveReport(report, {
      status,
      undo: {
        status: report.status,
        neighbors: neighborsIn(
          queryClient.getQueryData<ColumnData>(columnQueryKey(report.status, filters)),
          report.id
        ),
      },
    });

  const manualOrder = filters.sortBy === 'position';
  const adoptSort = manualOrder
    ? undefined
    : {
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        scope: boardScope(filters, visibleStatuses),
      };
  const canMove = (report: Report) => canManageReports && !report.licenseLocked;
  const [boardRef, boardHeight] = useFillScrollParentHeight<HTMLDivElement>(BOARD_MIN_HEIGHT);

  const boardProps = {
    columns,
    height: boardHeight,
    containerRef: boardRef,
    statusLabels: REPORT_STATUS_LABELS,
    collapsed,
    onToggleCollapsed: (status: ReportStatus) =>
      setCollapsed(
        collapsed.includes(status)
          ? collapsed.filter((candidate) => candidate !== status)
          : [...collapsed, status]
      ),
    getItemLabel: (report: Report) => report.title,
    renderCard: (report: Report) => <BoardCardContent report={report} showProject={showProject} />,
    onOpen: (report: Report) => onOpenReport(report.id),
    canMove,
    renderCardActions: (report: Report) =>
      canMove(report) ? (
        <MoveToMenu
          report={report}
          onMove={(status) => changeStatus(report, status)}
          onOpen={() => onOpenReport(report.id)}
          selected={selectedIds.has(report.id)}
          onToggleSelected={() => selection.onSelect(report.id, 'toggle')}
        />
      ) : undefined,
  };

  return canManageReports ? (
    <DraggableReportBoard
      {...boardProps}
      selection={selection}
      onReorderGroup={(reports, placement) =>
        groupMutation.mutate({ reports, placement, adoptSort })
      }
      onReorder={(report, placement, origin) =>
        moveReport(report, {
          status: placement.status,
          neighbors: { previousId: placement.previousId, nextId: placement.nextId },
          adoptSort,
          undo: {
            status: origin.status,
            neighbors: { previousId: origin.previousId, nextId: origin.nextId },
          },
        })
      }
    />
  ) : (
    <ReportBoard {...boardProps} />
  );
}
