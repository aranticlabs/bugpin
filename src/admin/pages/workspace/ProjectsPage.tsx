import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  KeyRound,
  Pause,
  Pin,
  PinOff,
  Power,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { licenseApi } from '../../api/license';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
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
  type PinnedProject,
  type Project,
  type ProjectSummary,
} from '@shared/types';

type ApiError = Error & { response?: { data?: { message?: string } } };

type SortKey = 'name' | 'status' | 'active' | 'total';

interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

interface ApiKeyView {
  apiKey: string;
  projectName: string;
}

type StatusFilter = 'all' | ProjectStatusKey;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'read-only', label: 'Read-only' },
];

function compareProjects(a: ProjectSummary, b: ProjectSummary, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    case 'status':
      return projectStatus(a).rank - projectStatus(b).rank;
    case 'active':
      return (a.activeReportsCount ?? 0) - (b.activeReportsCount ?? 0);
    case 'total':
      return (a.reportsCount ?? 0) - (b.reportsCount ?? 0);
  }
}

function errorMessage(error: ApiError, fallback: string): string {
  return error.response?.data?.message || fallback;
}

const ON_ICON = 'text-green-600 dark:text-green-400';
const PAUSED_ICON = 'text-amber-600 dark:text-amber-400';
// The status icon shows the current state and swaps to the action on hover or focus.
const SHOW_UNTIL_HOVER = 'group-hover/toggle:hidden group-focus-visible/toggle:hidden';
const SHOW_ON_HOVER = 'hidden group-hover/toggle:block group-focus-visible/toggle:block';

function stopRowClick(event: MouseEvent) {
  event.stopPropagation();
}

function IconAction({
  label,
  tooltip,
  onClick,
  disabled = false,
  destructive = false,
  className,
  buttonClassName,
  children,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
  buttonClassName?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The wrapper keeps the tooltip working while the button is disabled. */}
        <span className={`inline-flex ${className ?? ''}`} onClick={stopRowClick}>
          <Button
            variant={destructive ? 'ghost-destructive' : 'ghost'}
            size="sm"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={buttonClassName}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
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

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  alignRight = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  alignRight?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={alignRight ? 'text-right' : undefined}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 font-medium ${alignRight ? '-mr-3' : '-ml-3'}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={active ? '' : 'text-muted-foreground/60'} />
      </Button>
    </TableHead>
  );
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>({ key: 'name', direction: 'asc' });
  const [showCreate, setShowCreate] = useState(false);
  const [apiKeyView, setApiKeyView] = useState<ApiKeyView | null>(null);
  const [regenerateProject, setRegenerateProject] = useState<ProjectSummary | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<ProjectSummary[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

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
  const capacityUsed =
    licenseStatus?.licensed &&
    typeof licenseStatus.projectLimit === 'number' &&
    (licenseStatus.selectionRequired ||
      (licenseStatus.usedProjects ?? 0) >= licenseStatus.projectLimit);
  const query = search.trim().toLowerCase();
  const visible = projects
    .filter((project) => project.name.toLowerCase().includes(query))
    .filter((project) => statusFilter === 'all' || projectStatus(project).filter === statusFilter)
    .sort((a, b) => {
      const order = compareProjects(a, b, sort.key);
      const directed = sort.direction === 'asc' ? order : -order;
      return directed || compareProjects(a, b, 'name');
    });
  const activeStatus = ACTIVE_REPORT_STATUSES.join(',');
  const selected = projects.filter((project) => selectedIds.has(project.id));
  const selectedLocked = selected.some((project) => project.licenseLocked === true);
  const selectedToPin = selected.filter((project) => !pinnedIds.has(project.id));
  const selectedToUnpin = selected.filter((project) => pinnedIds.has(project.id));
  const allVisibleSelected =
    visible.length > 0 && visible.every((project) => selectedIds.has(project.id));
  const columnCount = isAdmin ? 6 : 4;
  const bulkBusy = removeProjects.isPending || bulkSetActive.isPending || bulkPin.isPending;

  const toggleSelected = (projectId: string, checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  const toggleAllVisible = (checked: boolean) =>
    setSelectedIds(checked ? new Set(visible.map((project) => project.id)) : new Set());

  const onSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' || key === 'status' ? 'asc' : 'desc' }
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Open a project for its reports and settings. Pin projects to keep them in the sidebar.
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowCreate(true)}
            disabled={Boolean(capacityUsed)}
            className="sm:shrink-0"
          >
            Create Project
          </Button>
        )}
      </div>

      {isAdmin && licenseStatus?.licensed && typeof licenseStatus.projectLimit === 'number' && (
        <p className="text-sm text-muted-foreground">
          {licenseStatus.usedProjects ?? 0} of {licenseStatus.projectLimit} licensed projects used.{' '}
          <Link to="/settings/license" className="text-primary underline">
            Manage projects or sync your license
          </Link>
        </p>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search projects"
                placeholder="Search projects..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(
                  STATUS_FILTERS.find((option) => option.value === value)?.value ?? 'all'
                )
              }
            >
              <SelectTrigger className="w-[140px]" aria-label="Filter by status">
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
          </div>
        </CardContent>
      </Card>

      {isAdmin && selected.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {projectCount(selected.length)} selected
                </span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  <X className="h-4 w-4 mr-1" />
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
                  <Power className="h-4 w-4 mr-1" />
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
                  <Pause className="h-4 w-4 mr-1" />
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
                  <Pin className="h-4 w-4 mr-1" />
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
                  <PinOff className="h-4 w-4 mr-1" />
                  Unpin
                </Button>
                <Button
                  variant="outline-destructive"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => setDeleteTargets(selected)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <TooltipProvider delayDuration={300}>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <SortableHead label="Project" sortKey="name" sort={sort} onSort={onSort} />
                <SortableHead label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <SortableHead
                  label="Open reports"
                  sortKey="active"
                  sort={sort}
                  onSort={onSort}
                  alignRight
                />
                <SortableHead
                  label="Total reports"
                  sortKey="total"
                  sort={sort}
                  onSort={onSort}
                  alignRight
                />
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
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
                visible.map((project) => {
                  const isPinned = pinnedIds.has(project.id);
                  const locked = project.licenseLocked === true;
                  const isActive = project.isActive !== false;
                  const pinTooltip = isPinned ? 'Unpin from the sidebar' : 'Pin to the sidebar';
                  return (
                    <TableRow
                      key={project.id}
                      data-state={selectedIds.has(project.id) ? 'selected' : undefined}
                      className="group cursor-pointer"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
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
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/projects/${project.id}`}
                            onClick={stopRowClick}
                            className="font-medium hover:underline"
                          >
                            {project.name}
                          </Link>
                          <IconAction
                            label={isPinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
                            tooltip={pinTooltip}
                            onClick={() =>
                              togglePin.mutate({ projectId: project.id, pin: !isPinned })
                            }
                            disabled={togglePin.isPending}
                            className={
                              isPinned
                                ? undefined
                                : 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
                            }
                          >
                            <Pin className={isPinned ? 'fill-current text-primary' : undefined} />
                          </IconAction>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge project={project} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link
                          to={`/projects/${project.id}?${new URLSearchParams({ status: activeStatus })}`}
                          onClick={stopRowClick}
                          className="hover:underline"
                        >
                          {project.activeReportsCount ?? 0}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Link
                          to={`/projects/${project.id}`}
                          onClick={stopRowClick}
                          className="hover:underline"
                        >
                          {project.reportsCount ?? 0}
                        </Link>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <IconAction
                              label={
                                isActive ? `Pause ${project.name}` : `Activate ${project.name}`
                              }
                              tooltip={
                                locked
                                  ? 'Read-only at the license limit'
                                  : isActive
                                    ? 'Pause project'
                                    : 'Activate project'
                              }
                              onClick={() =>
                                toggleActive.mutate({ projectId: project.id, isActive: !isActive })
                              }
                              disabled={toggleActive.isPending || locked}
                              buttonClassName="group/toggle"
                            >
                              {isActive ? (
                                <>
                                  <Power className={`${ON_ICON} ${SHOW_UNTIL_HOVER}`} />
                                  <Pause className={`${PAUSED_ICON} ${SHOW_ON_HOVER}`} />
                                </>
                              ) : (
                                <>
                                  <Pause className={`${PAUSED_ICON} ${SHOW_UNTIL_HOVER}`} />
                                  <Power className={`${ON_ICON} ${SHOW_ON_HOVER}`} />
                                </>
                              )}
                            </IconAction>
                            <IconAction
                              label={`Show API key and snippet of ${project.name}`}
                              tooltip="API key and widget snippet"
                              onClick={() => showApiKey.mutate(project.id)}
                              disabled={showApiKey.isPending}
                            >
                              <KeyRound />
                            </IconAction>
                            <IconAction
                              label={`Regenerate the API key of ${project.name}`}
                              tooltip={
                                locked ? 'Read-only at the license limit' : 'Regenerate API key'
                              }
                              onClick={() => setRegenerateProject(project)}
                              disabled={locked}
                            >
                              <RefreshCw />
                            </IconAction>
                            <IconAction
                              label={`Delete ${project.name}`}
                              tooltip="Delete project"
                              onClick={() => setDeleteTargets([project])}
                              destructive
                            >
                              <Trash2 />
                            </IconAction>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
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
              Are you sure you want to regenerate the API key for "{regenerateProject?.name}"? This
              will invalidate the current key and any widgets using it will stop working until
              updated.
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
              {deleteTargets?.map((project) => `"${project.name}"`).join(', ')}? This action cannot
              be undone and all associated reports will be deleted.
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
  );
}
