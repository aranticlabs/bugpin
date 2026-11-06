import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { reportOriginState } from '../../lib/reportOrigin';
import { toast } from 'sonner';
import { api, getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { RefreshCw } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { downloadReportsShare, type ReportShareFormat } from '../../lib/reportsShareExport';
import {
  REPORT_SORT_KEYS,
  REPORT_STATUSES,
  REPORT_VIEWS,
  type ReportSortKey,
  type TablePageSize,
} from '@shared/types';
import { usePreference } from '../../hooks/useUserPreferences';
import { DEFAULT_TABLE_PAGE_SIZE, TablePagination } from '../../components/TablePagination';
import { SortableTableHead, type SortDirection } from '../../components/SortableTableHead';
import { FileDropzone } from '../../components/FileDropzone';
import {
  AssigneeDisplay,
  GitHubSyncIcon,
  formatRelativeDate,
} from '../../components/report/ReportFields';
import {
  ReportPriorityLabel,
  ReportStatusLabel,
} from '../../components/report/ReportStatusPriority';
import { ReportsToolbar, type ReportsFilterKey } from '../../components/report/ReportsToolbar';
import { ReportsBulkActionBar } from '../../components/report/ReportsBulkActionBar';
import { ReportsBoard } from './ReportsBoard';
import type {
  ManualReportChannel,
  ProjectSummary,
  Report,
  ReportStatus,
  ReportView,
  User,
} from '@shared/types';

const PROJECT_DEFAULT_ASSIGNEE = '__project_default__';
const UNASSIGNED_ASSIGNEE = '__unassigned__';
const NO_CHANNEL = '__none__';

interface CreateReportFormState {
  projectId: string;
  title: string;
  description: string;
  priority: string;
  assignedTo: string;
  reporterName: string;
  reporterEmail: string;
  url: string;
  channel: string;
  files: File[];
}

function buildCreateReportForm(defaultProjectId?: string): CreateReportFormState {
  return {
    projectId: defaultProjectId ?? '',
    title: '',
    description: '',
    priority: 'medium',
    assignedTo: PROJECT_DEFAULT_ASSIGNEE,
    reporterName: '',
    reporterEmail: '',
    url: '',
    channel: NO_CHANNEL,
    files: [],
  };
}

function normalizeManualReportUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed}`;
}

const REPORT_LABEL = { singular: 'report', plural: 'reports' };

const DEFAULT_REPORT_SORT: { key: ReportSortKey; direction: SortDirection } = {
  key: 'createdAt',
  direction: 'desc',
};

// Text columns start A to Z; dates and priority start with the newest or most urgent.
const ASCENDING_FIRST: ReportSortKey[] = ['title', 'project', 'status', 'assignee'];

function parseReportSort(params: URLSearchParams): {
  key: ReportSortKey;
  direction: SortDirection;
} {
  const key = REPORT_SORT_KEYS.find((candidate) => candidate === params.get('sort'));
  if (!key) return DEFAULT_REPORT_SORT;
  return { key, direction: params.get('dir') === 'asc' ? 'asc' : 'desc' };
}

const MANUAL_SORT: { key: ReportSortKey; direction: SortDirection } = {
  key: 'position',
  direction: 'asc',
};

function parseStatusFilter(value: string): ReportStatus[] {
  const statuses = REPORT_STATUSES.filter((status) => value.split(',').includes(status));
  return statuses.length > 0 ? statuses : [...REPORT_STATUSES];
}

// Rows also open on click for pointer users; the title link is the keyboard and screen reader path.
function ReportTitleLink({
  reportId,
  title,
  state,
}: {
  reportId: string;
  title: string;
  state: ReturnType<typeof reportOriginState>;
}) {
  return (
    <Link
      to={`/reports/${reportId}`}
      state={state}
      onClick={(event) => event.stopPropagation()}
      className="block rounded-sm font-medium hover:underline focus-visible:focus-ring"
    >
      {title}
    </Link>
  );
}

export function Reports({
  projectId: fixedProjectId,
  headerStart,
}: { projectId?: string; headerStart?: ReactNode } = {}) {
  const { user } = useAuth();
  const canManageReports = user?.role === 'admin' || user?.role === 'editor';
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<CreateReportFormState>(() =>
    buildCreateReportForm(fixedProjectId ?? (searchParams.get('projectId') || undefined))
  );
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const page = parseInt(searchParams.get('page') || '1');
  const [pageSize, setPageSize] = usePreference('reportsPageSize', DEFAULT_TABLE_PAGE_SIZE);
  const [preferredView, setPreferredView] = usePreference('reportsView', 'list', {
    cache: true,
  });
  // A view in the URL wins, so shared links open the view they were copied from.
  const view =
    REPORT_VIEWS.find((candidate) => candidate === searchParams.get('view')) ?? preferredView;
  const status = searchParams.get('status') || '';
  const priority = searchParams.get('priority') || '';
  const projectId = fixedProjectId ?? (searchParams.get('projectId') || '');
  const assignedTo = searchParams.get('assignedTo') || '';
  const requestedSort = parseReportSort(searchParams);
  // Manual order exists only on the board; the list falls back to its default sort.
  const sort = requestedSort.key === 'position' ? DEFAULT_REPORT_SORT : requestedSort;
  const boardSort = searchParams.has('sort') ? requestedSort : MANUAL_SORT;

  // Fetch projects for filter
  const { data: projectsData } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () => {
      const response = await api.get('/projects/summaries');
      return response.data.projects as ProjectSummary[];
    },
  });

  const fixedProjectName = fixedProjectId
    ? projectsData?.find((project) => project.id === fixedProjectId)?.name
    : undefined;
  const reportOrigin = reportOriginState({
    path: location.pathname + location.search,
    label: fixedProjectId ? (fixedProjectName ?? 'Project') : 'Reports',
  });
  const openReport = (reportId: string) =>
    navigate(`/reports/${reportId}`, { state: reportOrigin });

  const { data: assignableUsers = [] } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const response = await api.get('/users/assignable');
      return response.data.users as User[];
    },
    enabled: canManageReports,
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      'reports',
      {
        page,
        pageSize,
        status,
        priority,
        projectId,
        assignedTo,
        sort,
        search: searchParams.get('search'),
      },
    ],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), limit: String(pageSize) };
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (projectId) params.projectId = projectId;
      if (assignedTo) params.assignedTo = assignedTo;
      params.sortBy = sort.key;
      params.sortOrder = sort.direction;
      if (searchParams.get('search')) params.search = searchParams.get('search')!;

      const response = await api.get('/reports', { params });
      return response.data;
    },
    enabled: view === 'list',
  });

  const [boardReports, setBoardReports] = useState<Report[]>([]);
  const shownReports: Report[] = view === 'board' ? boardReports : (data?.data ?? []);
  const selectedReadOnly = shownReports.some(
    (report) => report.licenseLocked && selectedIds.has(report.id)
  );

  const createReportMutation = useMutation({
    mutationFn: async (form: CreateReportFormState) => {
      const formData = new FormData();
      const payload = {
        projectId: form.projectId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        assignedTo:
          form.assignedTo === PROJECT_DEFAULT_ASSIGNEE
            ? undefined
            : form.assignedTo === UNASSIGNED_ASSIGNEE
              ? null
              : form.assignedTo,
        reporterName: form.reporterName.trim() || undefined,
        reporterEmail: form.reporterEmail.trim() || undefined,
        url: normalizeManualReportUrl(form.url) || undefined,
        channel: form.channel === NO_CHANNEL ? undefined : (form.channel as ManualReportChannel),
      };

      formData.append('data', JSON.stringify(payload));
      for (const file of form.files) {
        formData.append('files', file);
      }

      const response = await api.post('/reports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data.report as Report;
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['recent-reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowCreateDialog(false);
      setCreateForm(buildCreateReportForm(report.projectId));
      toast.success('Report created successfully');
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Failed to create report'));
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({
      ids,
      updates,
    }: {
      ids: string[];
      updates: { status?: string; priority?: string; assignedTo?: string | null };
    }) => {
      const response = await api.post('/reports/bulk-update', { ids, updates });
      return { data: response.data, count: ids.length, updates };
    },
    onSuccess: ({ count, updates }) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setSelectedIds(new Set());

      // Show appropriate toast message
      const reportText = count === 1 ? 'report' : 'reports';
      if (updates.status) {
        const statusLabel = updates.status.replace('_', ' ');
        toast.success(`Updated status to "${statusLabel}" for ${count} ${reportText}`);
      } else if (updates.priority) {
        toast.success(`Updated priority to "${updates.priority}" for ${count} ${reportText}`);
      } else if (updates.assignedTo !== undefined) {
        const assigneeName =
          updates.assignedTo === null
            ? 'unassigned'
            : assignableUsers.find((assignee) => assignee.id === updates.assignedTo)?.name ||
              'updated assignee';
        toast.success(
          updates.assignedTo === null
            ? `Unassigned ${count} ${reportText}`
            : `Assigned ${count} ${reportText} to ${assigneeName}`
        );
      }
    },
    onError: () => {
      toast.error('Failed to update reports');
    },
  });

  // Bulk delete mutation (delete each report individually)
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.delete(`/reports/${id}`)));
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);

      const reportText = count === 1 ? 'report' : 'reports';
      toast.success(`Deleted ${count} ${reportText}`);
    },
    onError: () => {
      toast.error('Failed to delete reports');
    },
  });

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.data) {
      setSelectedIds(new Set(data.data.map((r: Report) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const openCreateDialog = () => {
    const available = projectsData?.filter(
      (project) => !project.licenseLocked && project.isActive !== false
    );
    setCreateForm(
      buildCreateReportForm(
        available?.find((project) => project.id === projectId)?.id || available?.[0]?.id
      )
    );
    setShowCreateDialog(true);
  };

  const updateCreateForm = <K extends keyof CreateReportFormState>(
    key: K,
    value: CreateReportFormState[K]
  ) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
  };

  // Bulk action handlers
  const handleBulkStatusUpdate = (newStatus: string) => {
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      updates: { status: newStatus },
    });
  };

  const handleBulkPriorityUpdate = (newPriority: string) => {
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      updates: { priority: newPriority },
    });
  };

  const handleBulkAssigneeUpdate = (assigneeId: string | null) => {
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      updates: { assignedTo: assigneeId },
    });
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const handleBulkShare = (format: ReportShareFormat) => {
    const selectedReports = shownReports.filter((report) => selectedIds.has(report.id));

    if (selectedReports.length === 0) {
      toast.error('No reports selected to share');
      return;
    }

    try {
      downloadReportsShare(selectedReports, format);
      const label = format === 'excel' ? 'Excel' : 'CSV';
      toast.success(`Shared ${selectedReports.length} reports as ${label}`);
    } catch {
      toast.error('Failed to share reports');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (search) {
      params.set('search', search);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleFilterChange = (key: ReportsFilterKey, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(nextPage));
    setSearchParams(params);
  };

  const handleSort = (key: ReportSortKey) => {
    const direction: SortDirection =
      sort.key === key
        ? sort.direction === 'asc'
          ? 'desc'
          : 'asc'
        : ASCENDING_FIRST.includes(key)
          ? 'asc'
          : 'desc';
    const params = new URLSearchParams(searchParams);
    if (key === DEFAULT_REPORT_SORT.key && direction === DEFAULT_REPORT_SORT.direction) {
      params.delete('sort');
      params.delete('dir');
    } else {
      params.set('sort', key);
      params.set('dir', direction);
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleBoardSort = (key: ReportSortKey) => {
    const direction: SortDirection = ASCENDING_FIRST.includes(key) ? 'asc' : 'desc';
    // Reads the latest params, since a drop can switch to Manual after other changes.
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (key === MANUAL_SORT.key) {
        params.delete('sort');
        params.delete('dir');
      } else {
        params.set('sort', key);
        params.set('dir', direction);
      }
      return params;
    });
  };

  const handleViewChange = (nextView: ReportView) => {
    setSelectedIds(new Set());
    setPreferredView(nextView);
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      params.set('view', nextView);
      params.delete('page');
      return params;
    });
  };

  const handlePageSizeChange = (nextPageSize: TablePageSize) => {
    setPageSize(nextPageSize);
    handlePageChange(1);
  };

  const handleCreateReport = (e: React.FormEvent) => {
    e.preventDefault();
    createReportMutation.mutate(createForm);
  };

  return (
    <div className="space-y-6">
      {(!fixedProjectId || headerStart) && (
        <div>
          {fixedProjectId ? (
            headerStart
          ) : (
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Reports</h1>
              <p className="text-muted-foreground">
                Track and triage bug reports from all projects. Open a report to see its captures,
                logs, and activity.
              </p>
            </div>
          )}
        </div>
      )}

      <ReportsToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={handleSearch}
        filters={{ status, priority, projectId, assignedTo }}
        onFilterChange={handleFilterChange}
        projects={projectsData}
        showProjectFilter={!fixedProjectId}
        assignableUsers={assignableUsers}
        showAssigneeFilter={canManageReports}
        view={view}
        onViewChange={handleViewChange}
        boardSort={boardSort.key}
        onBoardSortChange={handleBoardSort}
        canCreate={canManageReports}
        onCreate={openCreateDialog}
      />

      {selectedIds.size > 0 && (
        <ReportsBulkActionBar
          selectedCount={selectedIds.size}
          onClear={clearSelection}
          updating={bulkUpdateMutation.isPending}
          deleting={bulkDeleteMutation.isPending}
          readOnly={selectedReadOnly}
          canAssign={canManageReports}
          assignableUsers={assignableUsers}
          onStatusChange={handleBulkStatusUpdate}
          onPriorityChange={handleBulkPriorityUpdate}
          onAssigneeChange={handleBulkAssigneeUpdate}
          onShare={handleBulkShare}
          onDelete={() => setShowDeleteConfirm(true)}
        />
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Report</DialogTitle>
            <DialogDescription>
              Create a manual report for issues that did not come from the widget.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateReport} className="flex min-h-0 flex-1 flex-col gap-4">
            <DialogBody className="flex-1" contentClassName="space-y-4 py-1">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-report-project">Project</Label>
                  <Select
                    value={createForm.projectId}
                    onValueChange={(value) => updateCreateForm('projectId', value)}
                  >
                    <SelectTrigger id="create-report-project">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectsData?.map((project) => (
                        <SelectItem
                          key={project.id}
                          value={project.id}
                          disabled={project.licenseLocked || project.isActive === false}
                        >
                          {project.name}
                          {project.licenseLocked ? ' (read-only)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-report-priority">Priority</Label>
                  <Select
                    value={createForm.priority}
                    onValueChange={(value) => updateCreateForm('priority', value)}
                  >
                    <SelectTrigger id="create-report-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lowest">Lowest</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="highest">Highest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-report-title">Title</Label>
                <Input
                  id="create-report-title"
                  value={createForm.title}
                  onChange={(e) => updateCreateForm('title', e.target.value)}
                  placeholder="What needs attention?"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-report-description">Description</Label>
                <Textarea
                  id="create-report-description"
                  value={createForm.description}
                  onChange={(e) => updateCreateForm('description', e.target.value)}
                  placeholder="Add context, reproduction notes, or customer details"
                  rows={4}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-report-assignee">Assignee</Label>
                  <Select
                    value={createForm.assignedTo}
                    onValueChange={(value) => updateCreateForm('assignedTo', value)}
                  >
                    <SelectTrigger id="create-report-assignee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PROJECT_DEFAULT_ASSIGNEE}>Use project default</SelectItem>
                      <SelectItem value={UNASSIGNED_ASSIGNEE}>Unassigned</SelectItem>
                      {assignableUsers.map((assignee) => (
                        <SelectItem key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-report-channel">Channel</Label>
                  <Select
                    value={createForm.channel}
                    onValueChange={(value) => updateCreateForm('channel', value)}
                  >
                    <SelectTrigger id="create-report-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CHANNEL}>No channel</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="chat">Chat</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="qa">QA</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-report-reporter-name">Reporter Name</Label>
                  <Input
                    id="create-report-reporter-name"
                    value={createForm.reporterName}
                    onChange={(e) => updateCreateForm('reporterName', e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-report-reporter-email">Reporter Email</Label>
                  <Input
                    id="create-report-reporter-email"
                    type="email"
                    value={createForm.reporterEmail}
                    onChange={(e) => updateCreateForm('reporterEmail', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-report-url">URL</Label>
                <Input
                  id="create-report-url"
                  type="text"
                  inputMode="url"
                  value={createForm.url}
                  onChange={(e) => updateCreateForm('url', e.target.value)}
                  onBlur={(e) => updateCreateForm('url', normalizeManualReportUrl(e.target.value))}
                  placeholder="https://example.com/page"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-report-files">Files</Label>
                <FileDropzone
                  id="create-report-files"
                  files={createForm.files}
                  onChange={(files) => updateCreateForm('files', files)}
                  accept="image/*,video/*,application/pdf,text/plain,application/json,.json,.txt,.pdf"
                  helperText="Supported: images, videos, PDF, text, and JSON files"
                  disabled={createReportMutation.isPending}
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={createReportMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createReportMutation.isPending ||
                  !createForm.projectId ||
                  Boolean(
                    projectsData?.find((project) => project.id === createForm.projectId)
                      ?.licenseLocked
                  )
                }
              >
                {createReportMutation.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Report'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} reports?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected reports and all their associated files will
              be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending || selectedReadOnly}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline-destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending || selectedReadOnly}
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {view === 'board' ? (
        <ReportsBoard
          filters={{
            priority,
            projectId,
            assignedTo,
            search: searchParams.get('search') || '',
            sortBy: boardSort.key,
            sortOrder: boardSort.direction,
          }}
          visibleStatuses={parseStatusFilter(status)}
          canManageReports={canManageReports}
          showProject={!fixedProjectId}
          onOpenReport={openReport}
          onManualOrder={() => handleBoardSort(MANUAL_SORT.key)}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onReportsChange={setBoardReports}
        />
      ) : (
        <>
          {/* Reports: mobile card list */}
          <div className="md:hidden space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner className="text-primary" />
              </div>
            ) : data?.data?.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  No reports found
                </CardContent>
              </Card>
            ) : (
              data?.data?.map((report: Report) => (
                <Card
                  key={report.id}
                  className={cn(
                    'cursor-pointer hover:bg-primary-tint',
                    selectedIds.has(report.id) ? 'bg-muted/30' : ''
                  )}
                  onClick={() => openReport(report.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div onClick={(e) => e.stopPropagation()} className="mt-0.5">
                        <Checkbox
                          checked={selectedIds.has(report.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(report.id, checked as boolean)
                          }
                          aria-label={`Select ${report.title}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <ReportTitleLink
                          reportId={report.id}
                          title={report.title}
                          state={reportOrigin}
                        />
                        {report.licenseLocked && (
                          <p className="text-xs text-muted-foreground">Read-only · License limit</p>
                        )}
                        <p className="text-sm text-muted-foreground truncate">
                          {report.metadata?.url || 'No URL'}
                        </p>
                        {report.reporterEmail && (
                          <p className="text-xs text-muted-foreground">
                            {report.reporterName || report.reporterEmail}
                          </p>
                        )}
                        <div className="mt-2">
                          <AssigneeDisplay user={report.assignee} compact />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <ReportStatusLabel status={report.status} />
                          <ReportPriorityLabel priority={report.priority} />
                          <span className="text-xs text-muted-foreground">
                            {report.projectName || 'Unknown'}
                          </span>
                          <GitHubSyncIcon report={report} />
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatRelativeDate(report.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
            {data && data.total > 0 && (
              <TablePagination
                total={data.total}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                itemLabel={REPORT_LABEL}
              />
            )}
          </div>

          {/* Reports table */}
          <Card className="@container hidden md:block">
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12.5">
                    <Checkbox
                      checked={
                        data?.data?.length > 0 &&
                        data.data.every((r: Report) => selectedIds.has(r.id))
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <SortableTableHead
                    label="Report"
                    sortKey="title"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Project"
                    sortKey="project"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Status"
                    sortKey="status"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Priority"
                    sortKey="priority"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Assignee"
                    sortKey="assignee"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={handleSort}
                  />
                  <TableHead className="w-12.5">
                    <RefreshCw className="h-4 w-4" />
                  </TableHead>
                  <SortableTableHead
                    label="Created"
                    sortKey="createdAt"
                    activeKey={sort.key}
                    direction={sort.direction}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Spinner className="mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : data?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No reports found
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data?.map((report: Report) => (
                    <TableRow
                      key={report.id}
                      className={cn(
                        'cursor-pointer hover:bg-primary-tint',
                        selectedIds.has(report.id) ? 'bg-muted/30' : ''
                      )}
                      onClick={() => openReport(report.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(report.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(report.id, checked as boolean)
                          }
                          aria-label={`Select ${report.title}`}
                        />
                      </TableCell>
                      <TableCell className="w-[45%] min-w-48 max-w-0">
                        <ReportTitleLink
                          reportId={report.id}
                          title={report.title}
                          state={reportOrigin}
                        />
                        {report.licenseLocked && (
                          <p className="text-xs text-muted-foreground">Read-only · License limit</p>
                        )}
                        <p className="truncate text-sm text-muted-foreground">
                          {report.metadata?.url || 'No URL'}
                        </p>
                        {report.reporterEmail && (
                          <p className="text-xs text-muted-foreground">
                            {report.reporterName || report.reporterEmail}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="@6xl:whitespace-nowrap">
                        <span className="text-sm text-muted-foreground @6xl:block @6xl:max-w-60 @6xl:truncate">
                          {report.projectName || 'Unknown'}
                        </span>
                      </TableCell>
                      <TableCell className="@6xl:whitespace-nowrap">
                        <ReportStatusLabel status={report.status} />
                      </TableCell>
                      <TableCell className="@6xl:whitespace-nowrap">
                        <ReportPriorityLabel priority={report.priority} />
                      </TableCell>
                      <TableCell className="@6xl:whitespace-nowrap">
                        <AssigneeDisplay user={report.assignee} compact />
                      </TableCell>
                      <TableCell>
                        <GitHubSyncIcon report={report} />
                      </TableCell>
                      <TableCell className="text-muted-foreground @6xl:whitespace-nowrap">
                        {formatRelativeDate(report.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {data && (
              <TablePagination
                className="border-t px-4 py-3"
                total={data.total}
                page={page}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                itemLabel={REPORT_LABEL}
              />
            )}
          </Card>
        </>
      )}
      {/* Room at the end of the list, so the floating selection bar never hides the last rows. */}
      {view === 'list' && selectedIds.size > 0 && <div aria-hidden="true" className="h-16" />}
    </div>
  );
}
