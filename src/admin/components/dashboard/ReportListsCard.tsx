import type { ReactNode } from 'react';
import { UserAvatar } from './UserAvatar';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, CircleCheck, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Spinner } from '../ui/spinner';
import { ReportPriorityLabel, ReportStatusLabel } from '../report/ReportStatusPriority';
import { DASHBOARD_ORIGIN } from './OverviewCards';
import { reportOriginState } from '../../lib/reportOrigin';
import { daysSince, formatTimeAgo } from '../../lib/dashboard';
import { useUpdateDashboardReport, type DashboardReportList } from '../../hooks/useDashboard';
import {
  ASSIGNED_TO_ME_FILTER,
  XP_BY_PRIORITY,
  type DashboardAttentionItem,
  type Report,
  type User,
} from '@shared/types';

function ReportRow({
  id,
  title,
  detail,
  priority,
  trailing,
}: {
  id: string;
  title: string;
  detail: string;
  priority: Report['priority'];
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-6 py-3 transition-colors hover:bg-primary-tint sm:flex-row sm:items-center sm:gap-3">
      <Link
        to={`/reports/${id}`}
        state={reportOriginState(DASHBOARD_ORIGIN)}
        className="min-w-0 flex-1 rounded-sm focus-visible:focus-ring"
      >
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </Link>
      <div className="flex shrink-0 items-center gap-4">
        <ReportPriorityLabel priority={priority} />
        {trailing}
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <CircleCheck className="size-8 text-success" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function attentionDetail(item: DashboardAttentionItem): string {
  switch (item.reason) {
    case 'reopened':
      return `Reopened ${formatTimeAgo(item.since)}`;
    case 'unassigned':
      return `Unassigned · received ${formatTimeAgo(item.since)}`;
    case 'stale':
      return `No update for ${daysSince(item.since)} days`;
  }
}

function AssignMenu({ reportId, currentUserId }: { reportId: string; currentUserId: string }) {
  const update = useUpdateDashboardReport();
  const { data: users = [] } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => (await api.get('/users/assignable')).data.users as User[],
  });
  const others = users.filter((user) => user.id !== currentUserId);
  const assign = (assignedTo: string) => update.mutate({ id: reportId, assignedTo });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7" disabled={update.isPending}>
          <UserPlus />
          Assign
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => assign(currentUserId)}>Assign to me</DropdownMenuItem>
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Team</DropdownMenuLabel>
            {others.map((user) => (
              <DropdownMenuItem key={user.id} onSelect={() => assign(user.id)}>
                {user.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NeedsAttentionList({
  items,
  canEdit,
  currentUserId,
}: {
  items: DashboardAttentionItem[];
  canEdit: boolean;
  currentUserId: string;
}) {
  if (items.length === 0) {
    return <EmptyState title="All clear" description="Nothing needs attention right now." />;
  }
  return (
    <div className="divide-y">
      {items.map((item) => (
        <ReportRow
          key={item.id}
          id={item.id}
          title={item.title}
          priority={item.priority}
          detail={`${item.projectName} · ${attentionDetail(item)}`}
          trailing={
            item.assignee ? (
              <UserAvatar name={item.assignee.name} avatarUrl={item.assignee.avatarUrl} showName />
            ) : canEdit ? (
              <AssignMenu reportId={item.id} currentUserId={currentUserId} />
            ) : (
              <span className="text-xs text-muted-foreground">Unassigned</span>
            )
          }
        />
      ))}
    </div>
  );
}

function AssignedList({ reports, showXp }: { reports: Report[] | undefined; showXp: boolean }) {
  const update = useUpdateDashboardReport();
  if (!reports) return <Spinner className="mx-auto my-10 text-primary" label="Loading" />;
  if (reports.length === 0) {
    return (
      <EmptyState title="Your queue is clear" description="Nothing assigned to you right now." />
    );
  }
  return (
    <div className="divide-y">
      {reports.map((report) => (
        <ReportRow
          key={report.id}
          id={report.id}
          title={report.title}
          priority={report.priority}
          detail={`${report.projectName ?? 'Project'} · received ${formatTimeAgo(report.createdAt)}`}
          trailing={
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: report.id, status: 'resolved' })}
            >
              <Check />
              Resolve
              {showXp && (
                <span className="text-xs text-muted-foreground">
                  +{XP_BY_PRIORITY[report.priority]} XP
                </span>
              )}
            </Button>
          }
        />
      ))}
    </div>
  );
}

function RecentReportsTable({ reports }: { reports: Report[] | undefined }) {
  if (!reports) return <Spinner className="mx-auto my-10 text-primary" label="Loading" />;
  if (reports.length === 0) {
    return (
      <EmptyState
        title="No reports yet"
        description="Reports appear here as soon as the widget sends the first one."
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">Report</TableHead>
          <TableHead className="hidden lg:table-cell">Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead className="hidden md:table-cell">Assignee</TableHead>
          <TableHead className="pr-6 text-right">Received</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="max-w-0 pl-6 sm:max-w-none">
              <Link
                to={`/reports/${report.id}`}
                state={reportOriginState(DASHBOARD_ORIGIN)}
                className="block"
              >
                <p className="truncate font-medium hover:underline">{report.title}</p>
                <p className="truncate text-xs text-muted-foreground">{report.metadata?.url}</p>
              </Link>
            </TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {report.projectName}
            </TableCell>
            <TableCell>
              <ReportStatusLabel status={report.status} />
            </TableCell>
            <TableCell>
              <ReportPriorityLabel priority={report.priority} />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              {report.assignee ? (
                <div className="flex items-center gap-2">
                  <UserAvatar
                    name={report.assignee.name}
                    avatarUrl={report.assignee.avatarUrl}
                    showName
                  />
                  <span className="text-sm">{report.assignee.name}</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              )}
            </TableCell>
            <TableCell className="pr-6 text-right text-muted-foreground">
              {formatTimeAgo(report.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function reportsUrl(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();
  return query ? `/reports?${query}` : '/reports';
}

function ListFooter({
  shown,
  total,
  to,
  label,
}: {
  shown: number;
  total: number;
  to: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
      <p className="text-xs text-muted-foreground">
        {total > shown ? `Showing ${shown} of ${total}` : ''}
      </p>
      <Button variant="ghost" size="sm" asChild>
        <Link to={to}>
          {label}
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

const ACTIVE_STATUSES = 'open,in_progress';

export function ReportListsCard({
  needsAttention,
  needsAttentionTotal,
  assigned,
  recent,
  projectId,
  canEdit,
  showXp,
  currentUserId,
}: {
  needsAttention: DashboardAttentionItem[];
  needsAttentionTotal: number;
  assigned: DashboardReportList | undefined;
  recent: DashboardReportList | undefined;
  projectId?: string;
  canEdit: boolean;
  showXp: boolean;
  currentUserId: string;
}) {
  return (
    <Card className="gap-0 pb-0">
      <Tabs defaultValue="attention" className="gap-0">
        <CardHeader className="border-b pb-4">
          <TabsList className="w-fit">
            <TabsTrigger value="attention">
              Needs attention
              <Badge variant="secondary" size="sm" className="ml-1">
                {needsAttentionTotal}
              </Badge>
            </TabsTrigger>
            {canEdit && (
              <TabsTrigger value="mine">
                Assigned to you
                <Badge variant="secondary" size="sm" className="ml-1">
                  {assigned?.total ?? 0}
                </Badge>
              </TabsTrigger>
            )}
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="p-0">
          <TabsContent value="attention" className="mt-0">
            <NeedsAttentionList
              items={needsAttention}
              canEdit={canEdit}
              currentUserId={currentUserId}
            />
            <ListFooter
              shown={needsAttention.length}
              total={needsAttentionTotal}
              to={reportsUrl({ status: ACTIVE_STATUSES, sort: 'priority', dir: 'desc', projectId })}
              label="View open reports"
            />
          </TabsContent>
          {canEdit && (
            <TabsContent value="mine" className="mt-0">
              <AssignedList reports={assigned?.reports} showXp={showXp} />
              <ListFooter
                shown={assigned?.reports.length ?? 0}
                total={assigned?.total ?? 0}
                to={reportsUrl({
                  assignedTo: ASSIGNED_TO_ME_FILTER,
                  status: ACTIVE_STATUSES,
                  projectId,
                })}
                label="View all assigned to you"
              />
            </TabsContent>
          )}
          <TabsContent value="recent" className="mt-0">
            <RecentReportsTable reports={recent?.reports} />
            <ListFooter
              shown={recent?.reports.length ?? 0}
              total={recent?.total ?? 0}
              to={reportsUrl({ projectId })}
              label="View all reports"
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
