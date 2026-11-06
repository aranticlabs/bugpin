import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import {
  type LucideIcon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  ClipboardList,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePreference } from '../../hooks/useUserPreferences';
import { api } from '../../api/client';
import { sortableSensors } from '../../lib/sortable-sensors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '../ui/sidebar';
import {
  ACTIVE_REPORT_STATUSES,
  ASSIGNED_TO_ME_FILTER,
  UNASSIGNED_FILTER,
  type PinnedProject,
  type ProjectSummary,
  type RecentReport,
  type ReportViewCounts,
} from '@shared/types';

interface WorkspaceReportStats {
  total: number;
}

interface ReportView {
  key: keyof ReportViewCounts;
  title: string;
  icon: LucideIcon;
  params: Record<string, string>;
}

const ACTIVE_STATUS_PARAM = ACTIVE_REPORT_STATUSES.join(',');

const REPORT_VIEWS: ReportView[] = [
  {
    key: 'assignedToMe',
    title: 'Assigned to me',
    icon: UserCheck,
    params: { assignedTo: ASSIGNED_TO_ME_FILTER, status: ACTIVE_STATUS_PARAM },
  },
  {
    key: 'unassigned',
    title: 'Unassigned',
    icon: Inbox,
    params: { assignedTo: UNASSIGNED_FILTER, status: ACTIVE_STATUS_PARAM },
  },
  { key: 'active', title: 'Open', icon: CircleDot, params: { status: ACTIVE_STATUS_PARAM } },
];

// The server keeps the last 20 opened reports per user.
const RECENT_LIMIT = 20;
const RECENT_PAGE_SIZE = 5;
const parseLegacyBoolean = (raw: string) => raw !== 'false';

function usePinnedProjectsOpen(): [boolean, (open: boolean) => void] {
  return usePreference('pinnedProjectsOpen', true, {
    legacyKey: 'bugpin-pinned-projects-open',
    parseLegacy: parseLegacyBoolean,
  });
}

function reportsUrl(params: Record<string, string>): string {
  return `/reports?${new URLSearchParams(params).toString()}`;
}

function sameParams(search: string, params: Record<string, string>): boolean {
  const current = new URLSearchParams(search);
  current.delete('page');
  const keys = [...current.keys()];
  return (
    keys.length === Object.keys(params).length &&
    keys.every((key) => current.get(key) === params[key])
  );
}

function CountBadge({ count, className }: { count?: number; className?: string }) {
  if (count === undefined) return null;
  return (
    <SidebarMenuBadge className={`text-muted-foreground ${className ?? ''}`}>
      {count}
    </SidebarMenuBadge>
  );
}

function labelWithCount(title: string, count?: number): string {
  return count === undefined ? title : `${title} (${count})`;
}

function SortablePinnedProject({
  project,
  index,
  isActive,
  onNavigate,
}: {
  project: PinnedProject;
  index: number;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: project.id, index });

  return (
    <SidebarMenuSubItem ref={ref} className={isDragging ? 'opacity-60' : undefined}>
      <SidebarMenuSubButton asChild isActive={isActive}>
        <Link
          ref={handleRef}
          to={`/projects/${project.id}`}
          draggable={false}
          onClick={onNavigate}
          title={labelWithCount(project.name, project.activeReportsCount)}
        >
          <span className="truncate">{project.name}</span>
          <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">
            {project.activeReportsCount}
          </span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

export function NavMain() {
  const { canLoadData } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const onReports = location.pathname === '/reports';
  const [pinnedOpen, setPinnedOpen] = usePinnedProjectsOpen();
  const [recentShown, setRecentShown] = useState(RECENT_PAGE_SIZE);

  const { data: reportStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; stats: WorkspaceReportStats }>(
        '/reports/stats/overview'
      );
      return response.data.stats;
    },
    enabled: canLoadData,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const { data: viewCounts } = useQuery({
    queryKey: ['report-view-counts'],
    queryFn: async () =>
      (await api.get<{ counts: ReportViewCounts }>('/reports/views/counts')).data.counts,
    enabled: canLoadData,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const { data: projects } = useQuery({
    queryKey: ['project-summaries'],
    queryFn: async () =>
      (await api.get<{ projects: ProjectSummary[] }>('/projects/summaries')).data.projects,
    enabled: canLoadData,
  });

  const { data: pinnedProjects = [] } = useQuery({
    queryKey: ['pinned-projects'],
    queryFn: async () =>
      (await api.get<{ projects: PinnedProject[] }>('/projects/pinned')).data.projects,
    enabled: canLoadData,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const { data: recentReports = [] } = useQuery({
    queryKey: ['viewed-reports'],
    queryFn: async () =>
      (await api.get<{ reports: RecentReport[] }>(`/reports/recent?limit=${RECENT_LIMIT}`)).data
        .reports,
    enabled: canLoadData,
  });

  const reorderPinned = useMutation({
    mutationFn: (projectIds: string[]) => api.put('/projects/pinned/order', { projectIds }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pinned-projects'] }),
  });

  const handlePinnedDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;
    const { source } = event.operation;
    if (!isSortable(source)) return;
    const { initialIndex, index } = source;
    if (initialIndex === index) return;

    const next = [...pinnedProjects];
    const [moved] = next.splice(initialIndex, 1);
    if (!moved) return;
    next.splice(index, 0, moved);

    void queryClient.cancelQueries({ queryKey: ['pinned-projects'] });
    queryClient.setQueryData(['pinned-projects'], next);
    reorderPinned.mutate(next.map((project) => project.id));
  };

  const closeSidebarOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const activeViewKey = onReports
    ? REPORT_VIEWS.find((view) => sameParams(location.search, view.params))?.key
    : undefined;
  const activePinnedId = pinnedProjects.find(
    (project) =>
      location.pathname === `/projects/${project.id}` ||
      location.pathname.startsWith(`/projects/${project.id}/`)
  )?.id;
  const visibleRecentReports = recentReports.slice(0, recentShown);
  const hasMoreRecent = recentReports.length > recentShown;
  const canShowLessRecent = !hasMoreRecent && recentShown > RECENT_PAGE_SIZE;
  const activeRecentId = visibleRecentReports.find(
    (report) => location.pathname === `/reports/${report.id}`
  )?.id;
  const reportsActive =
    location.pathname.startsWith('/reports') && !activeViewKey && !activeRecentId;

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === '/'} tooltip="Dashboard">
              <Link to="/" onClick={closeSidebarOnMobile}>
                <LayoutDashboard />
                <span>Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={reportsActive}
              tooltip={labelWithCount('Reports', reportStats?.total)}
            >
              <Link to="/reports" onClick={closeSidebarOnMobile}>
                <ClipboardList />
                <span>Reports</span>
              </Link>
            </SidebarMenuButton>
            <CountBadge count={reportStats?.total} />
          </SidebarMenuItem>
          <Collapsible asChild open={pinnedOpen} onOpenChange={setPinnedOpen}>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={
                  location.pathname.startsWith('/projects') && (!activePinnedId || !pinnedOpen)
                }
                tooltip={labelWithCount('Projects', projects?.length)}
              >
                <Link to="/projects" onClick={closeSidebarOnMobile}>
                  <FolderKanban />
                  <span>Projects</span>
                </Link>
              </SidebarMenuButton>
              <CountBadge
                count={projects?.length}
                className={pinnedProjects.length > 0 ? 'right-8' : undefined}
              />
              {pinnedProjects.length > 0 && (
                <>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction
                      className="data-[state=open]:rotate-90"
                      aria-label={pinnedOpen ? 'Hide pinned projects' : 'Show pinned projects'}
                    >
                      <ChevronRight />
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <DragDropProvider sensors={sortableSensors} onDragEnd={handlePinnedDragEnd}>
                      <SidebarMenuSub aria-label="Pinned projects">
                        {pinnedProjects.map((project, index) => (
                          <SortablePinnedProject
                            key={project.id}
                            project={project}
                            index={index}
                            isActive={activePinnedId === project.id}
                            onNavigate={closeSidebarOnMobile}
                          />
                        ))}
                      </SidebarMenuSub>
                    </DragDropProvider>
                  </CollapsibleContent>
                </>
              )}
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Views</SidebarGroupLabel>
        <SidebarMenu>
          {REPORT_VIEWS.map((view) => (
            <SidebarMenuItem key={view.key}>
              <SidebarMenuButton
                asChild
                isActive={activeViewKey === view.key}
                tooltip={labelWithCount(view.title, viewCounts?.[view.key])}
              >
                <Link to={reportsUrl(view.params)} onClick={closeSidebarOnMobile}>
                  <view.icon />
                  <span>{view.title}</span>
                </Link>
              </SidebarMenuButton>
              <CountBadge count={viewCounts?.[view.key]} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      {recentReports.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarMenu>
            {visibleRecentReports.map((report) => (
              <SidebarMenuItem key={report.id}>
                <SidebarMenuButton
                  asChild
                  isActive={activeRecentId === report.id}
                  tooltip={report.title}
                >
                  <Link to={`/reports/${report.id}`} onClick={closeSidebarOnMobile}>
                    <FileText />
                    <span className="truncate">{report.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {(hasMoreRecent || canShowLessRecent) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  tooltip={hasMoreRecent ? 'Show more' : 'Show less'}
                  onClick={() =>
                    setRecentShown(
                      hasMoreRecent ? recentShown + RECENT_PAGE_SIZE : RECENT_PAGE_SIZE
                    )
                  }
                >
                  {hasMoreRecent ? <ChevronDown /> : <ChevronUp />}
                  <span>{hasMoreRecent ? 'Show more' : 'Show less'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </>
  );
}
