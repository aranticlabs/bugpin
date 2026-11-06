import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  REPORT_STATUSES,
  type PaginatedResponse,
  type Report,
  type ReportSortKey,
  type ReportStatus,
} from '@shared/types';
import { api, getApiErrorMessage } from '../../api/client';
import { usePreference } from '../../hooks/useUserPreferences';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { ReportBoard, type ReportBoardColumnData } from '../../components/report-board/ReportBoard';
import { DraggableReportBoard } from '../../components/report-board/DraggableReportBoard';
import {
  AssigneeDisplay,
  GitHubSyncIcon,
  PriorityBadge,
  formatRelativeDate,
} from '../../components/report/ReportFields';

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const BOARD_PAGE_SIZE = 20;
const NO_COLLAPSED_COLUMNS: ReportStatus[] = [];

export interface ReportsBoardFilters {
  priority: string;
  projectId: string;
  assignedTo: string;
  search: string;
  sortBy: ReportSortKey;
  sortOrder: 'asc' | 'desc';
}

type ReportPage = PaginatedResponse<Report>;
type ColumnData = InfiniteData<ReportPage, number>;

function columnQueryKey(status: ReportStatus, filters: ReportsBoardFilters): QueryKey {
  return ['reports', 'board', status, filters];
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
        page: String(pageParam),
        limit: String(BOARD_PAGE_SIZE),
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };
      if (filters.priority) params.priority = filters.priority;
      if (filters.projectId) params.projectId = filters.projectId;
      if (filters.assignedTo) params.assignedTo = filters.assignedTo;
      if (filters.search) params.search = filters.search;
      const response = await api.get<ReportPage>('/reports', { params });
      return response.data;
    },
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled,
  });

  return {
    status,
    items: query.data?.pages.flatMap((page) => page.data) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
    loading: query.isPending && enabled,
    loadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    onLoadMore: () => void query.fetchNextPage(),
  };
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
  neighbors?: { previousId: string | null; nextId: string | null }
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
        <PriorityBadge priority={report.priority} />
        {showProject && (
          <span className="truncate text-xs text-muted-foreground">
            {report.projectName || 'Unknown'}
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug">{report.title}</p>
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
}: {
  report: Report;
  onMove: (status: ReportStatus) => void;
  onOpen: () => void;
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
        <DropdownMenuItem onClick={onOpen}>Open report</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface Neighbors {
  previousId: string | null;
  nextId: string | null;
}

interface MoveVariables {
  report: Report;
  status: ReportStatus;
  neighbors?: Neighbors;
  adoptSort?: { sortBy: ReportSortKey; sortOrder: 'asc' | 'desc' };
}

interface MoveOptions extends Omit<MoveVariables, 'report'> {
  undo?: { status: ReportStatus; neighbors?: Neighbors };
}

export function ReportsBoard({
  filters,
  visibleStatuses,
  canManageReports,
  showProject,
  onOpenReport,
  onManualOrder,
}: {
  filters: ReportsBoardFilters;
  visibleStatuses: readonly ReportStatus[];
  canManageReports: boolean;
  showProject: boolean;
  onOpenReport: (reportId: string) => void;
  /** Switches the board's sort to Manual after a drop saved the sorted order as hand-made */
  onManualOrder: () => void;
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

  const statusMutation = useMutation({
    mutationFn: async ({ report, status, neighbors, adoptSort }: MoveVariables) => {
      if (neighbors) {
        await api.patch(`/reports/${report.id}/board-position`, {
          status,
          ...neighbors,
          adoptSort,
        });
      } else {
        await api.patch(`/reports/${report.id}`, { status });
      }
    },
    onMutate: async ({ report, status, neighbors }) => {
      await queryClient.cancelQueries({ queryKey: ['reports', 'board'] });
      const sourceKey = columnQueryKey(report.status, filters);
      const targetKey = columnQueryKey(status, filters);
      const previousSource = queryClient.getQueryData<ColumnData>(sourceKey);
      const previousTarget = queryClient.getQueryData<ColumnData>(targetKey);
      queryClient.setQueryData<ColumnData>(sourceKey, (data) => removeFromColumn(data, report.id));
      queryClient.setQueryData<ColumnData>(targetKey, (data) =>
        addToColumn(data, { ...report, status }, neighbors)
      );
      return { sourceKey, targetKey, previousSource, previousTarget };
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.sourceKey, context.previousSource);
        queryClient.setQueryData(context.targetKey, context.previousTarget);
      }
      toast.error(getApiErrorMessage(error, 'Failed to update the report status'));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const moveReport = (report: Report, { status, neighbors, adoptSort, undo }: MoveOptions) => {
    if (report.status === status && !neighbors) return;
    statusMutation.mutate(
      { report, status, neighbors, adoptSort },
      {
        onSuccess: () => {
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
                      {
                        status: undo.status,
                        neighbors: undo.neighbors,
                      }
                    ),
                }
              : undefined,
          });
        },
      }
    );
  };

  const changeStatus = (report: Report, status: ReportStatus) =>
    moveReport(report, { status, undo: { status: report.status } });

  const manualOrder = filters.sortBy === 'position';
  const canMove = (report: Report) => canManageReports && !report.licenseLocked;

  const boardProps = {
    columns,
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
        />
      ) : undefined,
  };

  return canManageReports ? (
    <DraggableReportBoard
      {...boardProps}
      onReorder={(report, placement, origin) =>
        moveReport(report, {
          status: placement.status,
          neighbors: { previousId: placement.previousId, nextId: placement.nextId },
          adoptSort: manualOrder
            ? undefined
            : { sortBy: filters.sortBy, sortOrder: filters.sortOrder },
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
