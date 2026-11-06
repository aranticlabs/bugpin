import {
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  GripVertical,
  KeyRound,
  ListOrdered,
  MoreHorizontal,
  Pause,
  Pin,
  PinOff,
  Power,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { useAuth } from '../../contexts/AuthContext';
import { cn, formatDateTime } from '../../lib/utils';
import { sortableSensors } from '../../lib/sortable-sensors';
import { SortableTableHead, type SortDirection } from '../../components/SortableTableHead';
import { usePreference } from '../../hooks/useUserPreferences';
import { useElementHeight } from '../../hooks/useElementHeight';
import {
  DEFAULT_TABLE_PAGE_SIZE,
  TablePagination,
  pageCount,
} from '../../components/TablePagination';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Progress } from '../../components/ui/progress';
import { Spinner } from '../../components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { ApiKeyDialog, CreateProjectDialog } from '../../components/project/ProjectDialogs';
import {
  ProjectStatusBadge,
  projectStatus,
  type ProjectStatusKey,
} from '../../components/project/ProjectStatusBadge';
import {
  ACTIVE_REPORT_STATUSES,
  type IntegrationType,
  type PinnedProject,
  type Project,
  type ProjectSummary,
} from '@shared/types';

type ApiError = Error & { response?: { data?: { message?: string } } };

type SortKey = 'custom' | 'name' | 'status' | 'active' | 'total' | 'lastReport' | 'created';

interface Sort {
  key: SortKey;
  direction: SortDirection;
}

interface ApiKeyView {
  apiKey: string;
  projectName: string;
}

type StatusFilter = 'all' | ProjectStatusKey;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'read-only', label: 'Read-only' },
];

const SORT_KEYS: SortKey[] = [
  'custom',
  'name',
  'status',
  'active',
  'total',
  'lastReport',
  'created',
];

const INTEGRATION_NAMES: Record<IntegrationType, string> = {
  github: 'GitHub',
  jira: 'Jira',
  slack: 'Slack',
  linear: 'Linear',
  webhook: 'Webhook',
};

const DEFAULT_SORT: Sort = { key: 'custom', direction: 'asc' };

function timestamp(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function compareProjects(
  a: ProjectSummary,
  b: ProjectSummary,
  key: Exclude<SortKey, 'custom'>
): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    case 'status':
      return projectStatus(a).rank - projectStatus(b).rank;
    case 'active':
      return (a.activeReportsCount ?? 0) - (b.activeReportsCount ?? 0);
    case 'total':
      return (a.reportsCount ?? 0) - (b.reportsCount ?? 0);
    case 'lastReport':
      return timestamp(a.lastReportAt) - timestamp(b.lastReportAt);
    case 'created':
      return timestamp(a.createdAt) - timestamp(b.createdAt);
  }
}

function parseSort(params: URLSearchParams): Sort {
  const key = SORT_KEYS.find((candidate) => candidate === params.get('sort'));
  if (!key) return DEFAULT_SORT;
  return { key, direction: params.get('dir') === 'desc' ? 'desc' : 'asc' };
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseStatusFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.find((option) => option.value === value)?.value ?? 'all';
}

function errorMessage(error: ApiError, fallback: string): string {
  return error.response?.data?.message || fallback;
}

function formatRelativeTime(value: string): string {
  const diffMinutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatShortDate(value);
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function stopRowClick(event: MouseEvent) {
  event.stopPropagation();
}

function projectCount(count: number): string {
  return `${count} ${count === 1 ? 'project' : 'projects'}`;
}

function reportBulkResult(results: PromiseSettledResult<unknown>[], verb: string): void {
  const failed = results.filter((result) => result.status === 'rejected').length;
  const succeeded = results.length - failed;
  if (succeeded > 0) toast.success(`${projectCount(succeeded)} ${verb}`);
  if (failed > 0) toast.error(`${projectCount(failed)} could not be ${verb}`);
}

function WithTooltip({ tooltip, children }: { tooltip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper keeps the tooltip working while the control is disabled. */}
        <span className="inline-flex" onClick={stopRowClick}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// The label collapses to a tooltip-only icon button below the 2xl breakpoint.
function RowActionLabel({ children }: { children: ReactNode }) {
  return <span className="sr-only 2xl:not-sr-only 2xl:whitespace-nowrap">{children}</span>;
}

function CountCell({ count, to }: { count: number; to: string }) {
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <Link to={to} onClick={stopRowClick} className="hover:underline">
      {count}
    </Link>
  );
}

type HandleRef = (element: Element | null) => void;

type ProjectRowProps = {
  id: string;
  index: number;
  children: (handleRef?: HandleRef) => ReactNode;
} & Omit<HTMLAttributes<HTMLTableRowElement>, 'children'>;

// Always registers the handle: without one, dnd-kit turns the whole row into a button.
function SortableProjectRow({
  id,
  index,
  disabled,
  className,
  children,
  ...props
}: ProjectRowProps & { disabled: boolean }) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled });
  return (
    <TableRow ref={ref} className={cn(className, isDragging && 'opacity-60')} {...props}>
      {children(handleRef)}
    </TableRow>
  );
}

function ProjectRow({
  sortable,
  disabled,
  ...props
}: ProjectRowProps & { sortable: boolean; disabled: boolean }) {
  if (sortable) return <SortableProjectRow disabled={disabled} {...props} />;
  const { id: _id, index: _index, children, ...rowProps } = props;
  return <TableRow {...rowProps}>{children()}</TableRow>;
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const pinnedOnly = searchParams.get('pinned') === '1';
  const sort = parseSort(searchParams);
  const requestedPage = parsePage(searchParams.get('page'));
  const [pageSize, setPageSize] = usePreference('projectsPageSize', DEFAULT_TABLE_PAGE_SIZE);
  const [showCreate, setShowCreate] = useState(false);
  const [apiKeyView, setApiKeyView] = useState<ApiKeyView | null>(null);
  const [regenerateProject, setRegenerateProject] = useState<ProjectSummary | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<ProjectSummary[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [bulkBarRef, bulkBarHeight] = useElementHeight<HTMLDivElement>();

  const updateParams = (updates: Record<string, string | null>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        // Any change to search, filters, or sort starts again on the first page.
        if (!('page' in updates)) next.delete('page');
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () =>
      (await api.get<{ projects: ProjectSummary[] }>('/projects/summaries')).data.projects,
    staleTime: 0,
  });
  const { data: pinned = [] } = useQuery({
    queryKey: ['pinned-projects'],
    queryFn: async () =>
      (await api.get<{ projects: PinnedProject[] }>('/projects/pinned')).data.projects,
  });
  const { data: licenseStatus } = useQuery({
    queryKey: ['license-status'],
    queryFn: licenseApi.getStatus,
    enabled: isAdmin,
  });

  const refreshProjects = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project-summaries'] });
    queryClient.invalidateQueries({ queryKey: ['pinned-projects'] });
  };
  const refreshLicense = () => {
    queryClient.invalidateQueries({ queryKey: ['license-status'] });
    queryClient.invalidateQueries({ queryKey: ['license-projects'] });
  };

  const togglePin = useMutation({
    mutationFn: async ({ projectId, pin }: { projectId: string; pin: boolean }) =>
      pin ? api.put(`/projects/${projectId}/pin`) : api.delete(`/projects/${projectId}/pin`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }),
    onError: (error: ApiError) =>
      toast.error(errorMessage(error, 'Failed to update pinned projects')),
  });
  const createProject = useMutation({
    mutationFn: async (name: string) =>
      (await api.post<{ project: Project }>('/projects', { name })).data.project,
    onSuccess: (project) => {
      refreshProjects();
      refreshLicense();
      setShowCreate(false);
      setApiKeyView({ apiKey: project.apiKey, projectName: project.name });
      toast.success('Project created successfully');
    },
    onError: (error: ApiError) => toast.error(errorMessage(error, 'Failed to create project')),
  });
  const toggleActive = useMutation({
    mutationFn: async ({ projectId, isActive }: { projectId: string; isActive: boolean }) =>
      api.patch(`/projects/${projectId}`, { isActive }),
    onSuccess: (_, variables) => {
      refreshProjects();
      toast.success(variables.isActive ? 'Project activated' : 'Project paused');
    },
    onError: (error: ApiError) => toast.error(errorMessage(error, 'Failed to update project')),
  });
  const showApiKey = useMutation({
    mutationFn: async (projectId: string) =>
      (await api.get<{ project: Project }>(`/projects/${projectId}`)).data.project,
    onSuccess: (project) => setApiKeyView({ apiKey: project.apiKey, projectName: project.name }),
    onError: (error: ApiError) => toast.error(errorMessage(error, 'Failed to load the API key')),
  });
  const regenerateKey = useMutation({
    mutationFn: async (projectId: string) =>
      (await api.post<{ project: Project }>(`/projects/${projectId}/regenerate-key`)).data.project,
    onSuccess: (project) => {
      refreshProjects();
      setRegenerateProject(null);
      setApiKeyView({ apiKey: project.apiKey, projectName: project.name });
      toast.success('API key regenerated successfully');
    },
    onError: (error: ApiError) => toast.error(errorMessage(error, 'Failed to regenerate API key')),
  });
  const reorderProjects = useMutation({
    mutationFn: (projectIds: string[]) => api.put('/projects/reorder', { projectIds }),
    onError: (error: ApiError) => toast.error(errorMessage(error, 'Failed to save the order')),
    onSettled: () => refreshProjects(),
  });
  const removeProjects = useMutation({
    mutationFn: async (projectIds: string[]) =>
      Promise.allSettled(projectIds.map((projectId) => api.delete(`/projects/${projectId}`))),
    onSuccess: (results) => {
      refreshProjects();
      refreshLicense();
      setDeleteTargets(null);
      setDeleteConfirmation('');
      setSelectedIds(new Set());
      reportBulkResult(results, 'deleted');
    },
  });
  const bulkSetActive = useMutation({
    mutationFn: async ({ projectIds, isActive }: { projectIds: string[]; isActive: boolean }) =>
      Promise.allSettled(
        projectIds.map((projectId) => api.patch(`/projects/${projectId}`, { isActive }))
      ),
    onSuccess: (results, { isActive }) => {
      refreshProjects();
      setSelectedIds(new Set());
      reportBulkResult(results, isActive ? 'activated' : 'paused');
    },
  });
  const bulkPin = useMutation({
    mutationFn: async ({ projectIds, pin }: { projectIds: string[]; pin: boolean }) =>
      Promise.allSettled(
        projectIds.map((projectId) =>
          pin ? api.put(`/projects/${projectId}/pin`) : api.delete(`/projects/${projectId}/pin`)
        )
      ),
    onSuccess: (results, { pin }) => {
      queryClient.invalidateQueries({ queryKey: ['pinned-projects'] });
      setSelectedIds(new Set());
      reportBulkResult(results, pin ? 'pinned' : 'unpinned');
    },
  });

  const pinnedIds = new Set(pinned.map((project) => project.id));
  const projectLimit =
    isAdmin && licenseStatus?.licensed && typeof licenseStatus.projectLimit === 'number'
      ? licenseStatus.projectLimit
      : null;
  const usedProjects = licenseStatus?.usedProjects ?? 0;
  const selectionRequired = Boolean(licenseStatus?.selectionRequired);
  const capacityUsed = projectLimit !== null && (selectionRequired || usedProjects >= projectLimit);
  const query = search.trim().toLowerCase();
  const filtersActive = query !== '' || statusFilter !== 'all' || pinnedOnly;
  const matching = projects
    .filter((project) => project.name.toLowerCase().includes(query))
    .filter((project) => statusFilter === 'all' || projectStatus(project).filter === statusFilter)
    .filter((project) => !pinnedOnly || pinnedIds.has(project.id));
  if (sort.key !== 'custom') {
    const key = sort.key;
    matching.sort((a, b) => {
      const order = compareProjects(a, b, key);
      const directed = sort.direction === 'asc' ? order : -order;
      return directed || compareProjects(a, b, 'name');
    });
  }
  const totalPages = pageCount(matching.length, pageSize);
  const currentPage = Math.min(requestedPage, totalPages);
  const pageOffset = (currentPage - 1) * pageSize;
  const visible = matching.slice(pageOffset, pageOffset + pageSize);
  const showDragHandles = isAdmin && sort.key === 'custom';
  const canReorder = showDragHandles && !filtersActive && !reorderProjects.isPending;
  const activeStatus = ACTIVE_REPORT_STATUSES.join(',');
  const selected = projects.filter((project) => selectedIds.has(project.id));
  const selectedLocked = selected.some((project) => project.licenseLocked === true);
  const selectedToPin = selected.filter((project) => !pinnedIds.has(project.id));
  const selectedToUnpin = selected.filter((project) => pinnedIds.has(project.id));
  const allVisibleSelected =
    visible.length > 0 && visible.every((project) => selectedIds.has(project.id));
  const columnCount = (isAdmin ? 9 : 7) + (showDragHandles ? 1 : 0);
  const bulkBusy = removeProjects.isPending || bulkSetActive.isPending || bulkPin.isPending;
  const createDisabledReason = selectionRequired
    ? 'Choose which projects stay licensed in the license settings before creating another.'
    : `All ${projectLimit} licensed projects are in use. Delete a project or upgrade your license to create another.`;

  const toggleSelected = (projectId: string, checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  const toggleAllVisible = (checked: boolean) =>
    setSelectedIds(checked ? new Set(visible.map((project) => project.id)) : new Set());

  const onSort = (key: Exclude<SortKey, 'custom'>) => {
    const direction: SortDirection =
      sort.key === key
        ? sort.direction === 'asc'
          ? 'desc'
          : 'asc'
        : key === 'name' || key === 'status'
          ? 'asc'
          : 'desc';
    updateParams({ sort: key, dir: direction });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!isSortable(source)) return;
    const { initialIndex, index } = source;
    if (initialIndex === index) return;

    const next = [...projects];
    const [moved] = next.splice(pageOffset + initialIndex, 1);
    if (!moved) return;
    next.splice(pageOffset + index, 0, moved);

    void queryClient.cancelQueries({ queryKey: ['project-summaries'] });
    queryClient.setQueryData(['project-summaries'], next);
    reorderProjects.mutate(next.map((project) => project.id));
  };

  const projectUrl = (projectId: string, params?: Record<string, string>) =>
    `/projects/${projectId}${params ? `?${new URLSearchParams(params)}` : ''}`;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Open a project for its reports and settings. Pin projects to keep them in the sidebar.
          </p>
        </div>

        {projectLimit !== null && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Licensed projects</span>
            <Progress
              value={projectLimit > 0 ? Math.min(100, (usedProjects / projectLimit) * 100) : 100}
              className="h-1.5 w-32"
              aria-label="Licensed projects used"
            />
            <span className="tabular-nums text-foreground">
              {usedProjects} of {projectLimit} used
            </span>
            <Link to="/settings/license" className="text-primary underline">
              Manage projects or sync your license
            </Link>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search projects"
              placeholder="Search projects..."
              value={search}
              onChange={(event) => updateParams({ q: event.target.value })}
              className="pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              updateParams({ status: value === 'all' ? null : parseStatusFilter(value) })
            }
          >
            <SelectTrigger className="w-[150px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={pinnedOnly ? 'secondary' : 'outline'}
            aria-pressed={pinnedOnly}
            onClick={() => updateParams({ pinned: pinnedOnly ? null : '1' })}
          >
            <Pin />
            Pinned
          </Button>
          <Button
            variant={sort.key === 'custom' ? 'secondary' : 'outline'}
            aria-pressed={sort.key === 'custom'}
            onClick={() => updateParams({ sort: null, dir: null })}
          >
            <ListOrdered />
            Custom order
          </Button>
          {isAdmin && (
            <div className="ml-auto">
              {capacityUsed ? (
                <WithTooltip tooltip={createDisabledReason}>
                  <Button disabled>Create Project</Button>
                </WithTooltip>
              ) : (
                <Button onClick={() => setShowCreate(true)}>Create Project</Button>
              )}
            </div>
          )}
        </div>

        {isAdmin && selected.length > 0 && (
          <div ref={bulkBarRef} className="sticky top-0 z-20 -mt-2 bg-background pt-2">
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {projectCount(selected.length)} selected
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                      <X className="mr-1 h-4 w-4" />
                      Clear
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bulkBusy || selectedLocked}
                      onClick={() =>
                        bulkSetActive.mutate({
                          projectIds: selected.map((project) => project.id),
                          isActive: true,
                        })
                      }
                    >
                      <Power className="mr-1 h-4 w-4" />
                      Activate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bulkBusy || selectedLocked}
                      onClick={() =>
                        bulkSetActive.mutate({
                          projectIds: selected.map((project) => project.id),
                          isActive: false,
                        })
                      }
                    >
                      <Pause className="mr-1 h-4 w-4" />
                      Pause
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bulkBusy || selectedToPin.length === 0}
                      onClick={() =>
                        bulkPin.mutate({
                          projectIds: selectedToPin.map((project) => project.id),
                          pin: true,
                        })
                      }
                    >
                      <Pin className="mr-1 h-4 w-4" />
                      Pin
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bulkBusy || selectedToUnpin.length === 0}
                      onClick={() =>
                        bulkPin.mutate({
                          projectIds: selectedToUnpin.map((project) => project.id),
                          pin: false,
                        })
                      }
                    >
                      <PinOff className="mr-1 h-4 w-4" />
                      Unpin
                    </Button>
                    <Button
                      variant="outline-destructive"
                      size="sm"
                      disabled={bulkBusy}
                      onClick={() => setDeleteTargets(selected)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card style={{ '--table-sticky-top': `${bulkBarHeight}px` } as CSSProperties}>
          <DragDropProvider sensors={sortableSensors} onDragEnd={handleDragEnd}>
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                        aria-label="Select all"
                      />
                    </TableHead>
                  )}
                  {showDragHandles && (
                    <TableHead className="w-8">
                      <span className="sr-only">Reorder</span>
                    </TableHead>
                  )}
                  <SortableTableHead
                    label="Project"
                    sortKey="name"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={onSort}
                  />
                  <SortableTableHead
                    label="Status"
                    sortKey="status"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={onSort}
                    className="w-36"
                  />
                  <SortableTableHead
                    label="Open reports"
                    sortKey="active"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={onSort}
                    alignRight
                    className="w-28"
                  />
                  <SortableTableHead
                    label="Total reports"
                    sortKey="total"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={onSort}
                    alignRight
                    className="w-28"
                  />
                  <SortableTableHead
                    label="Last report"
                    sortKey="lastReport"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={onSort}
                    className="hidden w-32 lg:table-cell"
                  />
                  <TableHead className="hidden w-40 2xl:table-cell">Integrations</TableHead>
                  <SortableTableHead
                    label="Created"
                    sortKey="created"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={onSort}
                    className="hidden w-32 2xl:table-cell"
                  />
                  {isAdmin && <TableHead className="w-px text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="py-12">
                      <Spinner className="mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columnCount}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {projects.length === 0
                        ? isAdmin
                          ? 'No projects yet. Create one to get started.'
                          : 'No projects yet.'
                        : 'No projects match your filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((project, index) => {
                    const isPinned = pinnedIds.has(project.id);
                    const locked = project.licenseLocked === true;
                    const isActive = project.isActive !== false;
                    const integrations = (project.integrationTypes ?? []).map(
                      (type) => INTEGRATION_NAMES[type]
                    );
                    return (
                      <ProjectRow
                        key={project.id}
                        id={project.id}
                        index={index}
                        sortable={showDragHandles}
                        disabled={!canReorder}
                        data-state={selectedIds.has(project.id) ? 'selected' : undefined}
                        className="group cursor-pointer"
                        onClick={() => navigate(projectUrl(project.id))}
                      >
                        {(handleRef) => (
                          <>
                            {isAdmin && (
                              <TableCell onClick={stopRowClick}>
                                <Checkbox
                                  checked={selectedIds.has(project.id)}
                                  onCheckedChange={(checked) =>
                                    toggleSelected(project.id, checked === true)
                                  }
                                  aria-label={`Select ${project.name}`}
                                />
                              </TableCell>
                            )}
                            {showDragHandles && (
                              <TableCell className="px-0" onClick={stopRowClick}>
                                <WithTooltip
                                  tooltip={
                                    canReorder
                                      ? 'Drag to reorder'
                                      : 'Clear search and filters to reorder'
                                  }
                                >
                                  <Button
                                    ref={handleRef}
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canReorder}
                                    aria-label={`Reorder ${project.name}`}
                                    className="h-7 w-7 cursor-grab p-0 text-muted-foreground active:cursor-grabbing"
                                  >
                                    <GripVertical />
                                  </Button>
                                </WithTooltip>
                              </TableCell>
                            )}
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Link
                                  to={projectUrl(project.id)}
                                  onClick={stopRowClick}
                                  className="truncate font-medium hover:underline"
                                >
                                  {project.name}
                                </Link>
                                <WithTooltip
                                  tooltip={
                                    isPinned ? 'Unpin from the sidebar' : 'Pin to the sidebar'
                                  }
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      togglePin.mutate({ projectId: project.id, pin: !isPinned })
                                    }
                                    disabled={togglePin.isPending}
                                    aria-label={
                                      isPinned ? `Unpin ${project.name}` : `Pin ${project.name}`
                                    }
                                    aria-pressed={isPinned}
                                    className={cn(
                                      'h-6 w-6 p-0',
                                      !isPinned &&
                                        'text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
                                    )}
                                  >
                                    <Pin
                                      className={isPinned ? 'fill-current text-primary' : undefined}
                                    />
                                  </Button>
                                </WithTooltip>
                              </div>
                              {project.apiKeyPrefix && (
                                <div className="font-mono text-xs text-muted-foreground">
                                  {project.apiKeyPrefix}…
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <ProjectStatusBadge project={project} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <CountCell
                                count={project.activeReportsCount ?? 0}
                                to={projectUrl(project.id, { status: activeStatus })}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <CountCell
                                count={project.reportsCount ?? 0}
                                to={projectUrl(project.id)}
                              />
                            </TableCell>
                            <TableCell className="hidden whitespace-nowrap lg:table-cell">
                              {project.lastReportAt ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{formatRelativeTime(project.lastReportAt)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {formatDateTime(project.lastReportAt)}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">Never</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden max-w-40 truncate 2xl:table-cell">
                              {integrations.length > 0 ? (
                                integrations.join(', ')
                              ) : (
                                <span className="text-muted-foreground">None</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden whitespace-nowrap text-muted-foreground 2xl:table-cell">
                              {project.createdAt ? formatShortDate(project.createdAt) : null}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div
                                  className="flex items-center justify-end gap-1.5"
                                  onClick={stopRowClick}
                                >
                                  <WithTooltip
                                    tooltip={
                                      locked
                                        ? 'Read-only at the license limit'
                                        : isActive
                                          ? 'Stop accepting reports'
                                          : 'Resume accepting reports'
                                    }
                                  >
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        toggleActive.mutate({
                                          projectId: project.id,
                                          isActive: !isActive,
                                        })
                                      }
                                      disabled={toggleActive.isPending || locked}
                                      aria-label={`${isActive ? 'Pause' : 'Activate'} ${project.name}`}
                                    >
                                      {isActive ? <Pause /> : <Power />}
                                      <RowActionLabel>
                                        {isActive ? 'Pause' : 'Activate'}
                                      </RowActionLabel>
                                    </Button>
                                  </WithTooltip>
                                  <WithTooltip tooltip="Project settings">
                                    <Button variant="outline" size="sm" asChild>
                                      <Link
                                        to={projectUrl(project.id, { tab: 'general' })}
                                        aria-label={`Settings of ${project.name}`}
                                      >
                                        <Settings />
                                        <RowActionLabel>Settings</RowActionLabel>
                                      </Link>
                                    </Button>
                                  </WithTooltip>
                                  <WithTooltip tooltip="API key and widget snippet">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => showApiKey.mutate(project.id)}
                                      disabled={showApiKey.isPending}
                                      aria-label={`API key of ${project.name}`}
                                    >
                                      <KeyRound />
                                      <RowActionLabel>API key</RowActionLabel>
                                    </Button>
                                  </WithTooltip>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        aria-label={`More actions for ${project.name}`}
                                      >
                                        <MoreHorizontal />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={stopRowClick}>
                                      <DropdownMenuItem
                                        disabled={locked}
                                        onSelect={() => setRegenerateProject(project)}
                                      >
                                        <RefreshCw />
                                        Regenerate API key
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() => setDeleteTargets([project])}
                                      >
                                        <Trash2 />
                                        Delete project
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            )}
                          </>
                        )}
                      </ProjectRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </DragDropProvider>
          {!isLoading && (
            <TablePagination
              className="border-t px-4 py-3"
              total={matching.length}
              page={currentPage}
              pageSize={pageSize}
              onPageChange={(page) => updateParams({ page: page > 1 ? String(page) : null })}
              onPageSizeChange={(size) => {
                setPageSize(size);
                updateParams({ page: null });
              }}
              itemLabel={{ singular: 'project', plural: 'projects' }}
            />
          )}
        </Card>

        <CreateProjectDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreate={(name) => createProject.mutate(name)}
          isLoading={createProject.isPending}
        />

        {apiKeyView && (
          <ApiKeyDialog
            apiKey={apiKeyView.apiKey}
            projectName={apiKeyView.projectName}
            open
            onOpenChange={() => setApiKeyView(null)}
          />
        )}

        <AlertDialog open={!!regenerateProject} onOpenChange={() => setRegenerateProject(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate API Key</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to regenerate the API key for "{regenerateProject?.name}"?
                This will invalidate the current key and any widgets using it will stop working
                until updated.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => regenerateProject && regenerateKey.mutate(regenerateProject.id)}
              >
                Regenerate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!deleteTargets}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTargets(null);
              setDeleteConfirmation('');
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteTargets && deleteTargets.length > 1
                  ? `Delete ${projectCount(deleteTargets.length)}`
                  : 'Delete Project'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{' '}
                {deleteTargets?.map((project) => `"${project.name}"`).join(', ')}? This action
                cannot be undone and all associated reports will be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Label htmlFor="delete-confirmation" className="text-sm text-muted-foreground">
                Type <span className="font-mono font-semibold text-foreground">DELETE</span> to
                confirm
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                className="mt-2"
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="outline-destructive"
                disabled={deleteConfirmation !== 'DELETE'}
                onClick={() =>
                  deleteTargets && removeProjects.mutate(deleteTargets.map((project) => project.id))
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
