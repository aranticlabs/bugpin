import { useEffect, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Inbox, MessageSquare, Paperclip, Search } from 'lucide-react';
import { REPORT_STATUSES, type ReportStatus } from '@shared/types';
import {
  PORTAL_REPORT_SORTS,
  type PortalReportSort,
  type PortalReportSummary,
} from '@shared/portal-types';
import { ReportBoard } from '@shared-ui/components/report-board/ReportBoard';
import { ReportViewSwitcher } from '@shared-ui/components/report-board/ReportViewSwitcher';
import { ReportStatusIcon, ReportStatusLabel } from '@shared-ui/lib/status';
import { cn } from '@shared-ui/lib/utils';
import { Badge } from '@shared-ui/components/ui/badge';
import { Button } from '@shared-ui/components/ui/button';
import { Card, CardContent } from '@shared-ui/components/ui/card';
import { Input } from '@shared-ui/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@shared-ui/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared-ui/components/ui/select';
import { portalApi } from '../api/reports';
import { useProjects } from '../hooks/useProjects';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/catalog';
import { useAuth } from '../auth/AuthProvider';
import { useBranding } from '../branding/BrandingProvider';
import { QueryState } from '../components/QueryState';
import { PersonAvatar } from '../components/PersonAvatar';
import { relativeTime } from '../lib/time';

const sortLabels: Record<PortalReportSort, MessageKey> = {
  updated: 'sortUpdated',
  newest: 'sortNewest',
  oldest: 'sortOldest',
};

interface Filters {
  projectId?: string;
  status?: ReportStatus;
  q?: string;
  sort: PortalReportSort;
}

function unique(reports: PortalReportSummary[]) {
  return [...new Map(reports.map((report) => [report.id, report])).values()];
}

function useReplyAuthor() {
  const { t } = useI18n();
  const { operator } = useAuth();
  return (reply: NonNullable<PortalReportSummary['latestReply']>) =>
    reply.isPreviousReporter
      ? t('previousReporter')
      : reply.isOwn && !operator
        ? t('you')
        : reply.authorName;
}

function ReportRow({ report }: { report: PortalReportSummary }) {
  const { t, locale } = useI18n();
  const replyAuthor = useReplyAuthor();
  const reply = report.latestReply;
  const waiting = report.status === 'open' || report.status === 'in_progress';
  return (
    <li>
      <Link
        to={`/reports/${encodeURIComponent(report.id)}`}
        className="flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-primary-tint"
      >
        <ReportStatusIcon status={report.status} className="mt-1" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn('min-w-0 truncate', report.unread ? 'font-semibold' : 'font-medium')}
            >
              {report.title}
            </span>
            {report.unread && <Badge size="sm">{t('newReply')}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {report.project.name} · {t(report.status)} ·{' '}
            {t('openedAgo', { time: relativeTime(report.createdAt, locale) })}
          </p>
          {reply ? (
            <div className="flex min-w-0 items-center gap-2 pt-1 text-sm">
              <PersonAvatar
                name={reply.isPreviousReporter ? '' : reply.authorName}
                team={reply.authorKind === 'staff'}
                className="h-5 w-5 [&>span]:text-[9px]"
              />
              <span className="shrink-0 font-medium">{replyAuthor(reply)}:</span>
              {reply.body.trim() ? (
                <span className="truncate text-muted-foreground">{reply.body}</span>
              ) : (
                reply.fileCount > 0 && (
                  <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                    <Paperclip className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{t('fileCount', { count: reply.fileCount })}</span>
                  </span>
                )
              )}
            </div>
          ) : (
            waiting && <p className="pt-1 text-sm text-muted-foreground">{t('waitingForTeam')}</p>
          )}
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-2 text-xs text-muted-foreground sm:flex">
          <time
            dateTime={report.updatedAt}
            title={new Date(report.updatedAt).toLocaleString(locale)}
          >
            {relativeTime(report.updatedAt, locale)}
          </time>
          {report.replyCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden />
              <span aria-hidden>{report.replyCount}</span>
              <span className="sr-only">{t('replies', { count: report.replyCount })}</span>
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function BoardCard({ report }: { report: PortalReportSummary }) {
  const { t, locale } = useI18n();
  return (
    <div className="min-w-0 space-y-2">
      <span className="flex min-w-0 items-start gap-2 font-medium">
        {report.unread && (
          <>
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="sr-only">{t('unread')} </span>
          </>
        )}
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{report.title}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="break-words">{report.project.name}</span>
        <ReportStatusLabel status={report.status} label={t(report.status)} />
        {report.replyCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden />
            <span aria-hidden>{report.replyCount}</span>
            <span className="sr-only">{t('replies', { count: report.replyCount })}</span>
          </span>
        )}
        <time dateTime={report.updatedAt} title={new Date(report.updatedAt).toLocaleString(locale)}>
          {relativeTime(report.updatedAt, locale)}
        </time>
      </span>
    </div>
  );
}

function useReportList(filters: Filters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['portal', 'reports', 'list', filters],
    enabled,
    queryFn: ({ pageParam, signal }) => portalApi.list({ ...filters, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function ReportList({ query }: { query: ReturnType<typeof useReportList> }) {
  const { t } = useI18n();
  if (query.isPending) return <QueryState loading />;
  if (query.isError && !query.data) return <QueryState retry={() => void query.refetch()} />;
  const reports = unique(query.data?.pages.flatMap((page) => page.reports) ?? []);
  return (
    <div className="space-y-4">
      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="size-6" aria-hidden />
            </div>
            <p className="font-medium">{t('emptyReports')}</p>
            <p className="text-sm text-muted-foreground">{t('emptyReportsHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {reports.map((report) => (
              <ReportRow key={report.id} report={report} />
            ))}
          </ul>
        </Card>
      )}
      {query.isError && (
        <QueryState
          retry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
        />
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t(query.isFetchingNextPage ? 'loading' : 'loadMore')}
        </Button>
      )}
    </div>
  );
}

/** Reports per status for the current project and search, shared by the list and the board */
function useStatusCounts(filters: Pick<Filters, 'projectId' | 'q'>) {
  return useQuery({
    queryKey: ['portal', 'reports', 'counts', filters],
    queryFn: ({ signal }) => portalApi.list({ ...filters, limit: 1 }, signal),
    select: (list) => list.statusCounts,
    placeholderData: keepPreviousData,
  }).data;
}

function useColumn(status: ReportStatus, filters: Omit<Filters, 'status'>, filter?: ReportStatus) {
  return useInfiniteQuery({
    queryKey: ['portal', 'reports', 'board', filters, status],
    enabled: !filter || status === filter,
    queryFn: async ({ pageParam, signal }) => {
      const result = await portalApi.board({ ...filters, status, cursor: pageParam }, signal);
      return result.columns[status];
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function ReportsBoard({
  filters,
  status,
}: {
  filters: Omit<Filters, 'status'>;
  status?: ReportStatus;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<ReportStatus[]>([]);
  const queries = [
    useColumn('open', filters, status),
    useColumn('in_progress', filters, status),
    useColumn('resolved', filters, status),
    useColumn('closed', filters, status),
  ];
  return (
    <ReportBoard
      columns={REPORT_STATUSES.map((column, index) => {
        const query = queries[index];
        const included = !status || column === status;
        return {
          status: column,
          items: included ? unique(query.data?.pages.flatMap((page) => page.reports) ?? []) : [],
          total: included ? (query.data?.pages[0]?.total ?? 0) : 0,
          loading: included && query.isPending,
          loadingMore: query.isFetchingNextPage,
          hasMore: included && query.hasNextPage,
          error: included && query.isError,
          onLoadMore: () => {
            void query.fetchNextPage();
          },
          onRetry: () => {
            void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
          },
        };
      })}
      statusLabels={{
        open: t('open'),
        in_progress: t('in_progress'),
        resolved: t('resolved'),
        closed: t('closed'),
      }}
      collapsed={collapsed}
      onToggleCollapsed={(column) =>
        setCollapsed((current) =>
          current.includes(column)
            ? current.filter((value) => value !== column)
            : [...current, column]
        )
      }
      getItemLabel={(report) => report.title}
      renderCard={(report) => <BoardCard report={report} />}
      onOpen={(report) => navigate(`/reports/${encodeURIComponent(report.id)}`)}
      emptyColumnText={t('emptyColumn')}
      labels={{
        columnSummary: (label, total, collapsed) =>
          t(collapsed ? 'columnCollapsed' : 'columnSummary', { label, total }),
        collapseColumn: (label) => t('collapseColumn', { label }),
        expandColumn: (label) => t('expandColumn', { label }),
        openCard: (label) => t('openCard', { label }),
        loadMore: () => t('loadMore'),
        loadError: t('requestFailed'),
        retry: t('retry'),
      }}
    />
  );
}

export function MyReports() {
  const { t, locale } = useI18n();
  const heading = useAuth().operator ? 'teamReports' : 'myReports';
  const branding = useBranding();
  const projects = useProjects();
  const unread = useUnreadCount();
  const [search, setSearch] = useSearchParams();
  const rawProjectId = search.get('projectId') || undefined;
  const staleProjectId = Boolean(
    rawProjectId && projects.data && !projects.data.some((project) => project.id === rawProjectId)
  );
  const projectId = staleProjectId ? undefined : rawProjectId;
  const status = REPORT_STATUSES.find((value) => value === search.get('status'));
  const sort = PORTAL_REPORT_SORTS.find((value) => value === search.get('sort')) ?? 'updated';
  const q = search.get('q')?.trim() || undefined;
  const board = search.get('view') === 'board';
  const [term, setTerm] = useState(q ?? '');
  const list = useReportList({ projectId, status, q, sort }, !board);
  const counts = useStatusCounts({ projectId, q });

  useEffect(() => {
    if (staleProjectId) filter('projectId', undefined, true);
  }, [staleProjectId]);

  useEffect(() => {
    document.title = `${unread ? `(${unread}) ` : ''}${t(heading)} | ${branding?.appName ?? 'BugPin'}`;
    return () => {
      document.title = `${t('portalTitle')} | ${branding?.appName ?? 'BugPin'}`;
    };
  }, [unread, locale, branding?.appName, heading]);
  useEffect(() => {
    setTerm((current) => (current.trim() === (q ?? '') ? current : (q ?? '')));
  }, [q]);
  useEffect(() => {
    const next = term.trim();
    if (next === (q ?? '')) return;
    const timer = setTimeout(() => filter('q', next || undefined, true), 300);
    return () => clearTimeout(timer);
  }, [term, q, search]);

  function filter(key: string, value: string | undefined, replace = false) {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === undefined) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace }
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <h1 className="text-2xl font-bold">{t(heading)}</h1>
      <Tabs
        value={status ?? 'all'}
        onValueChange={(value) => filter('status', value === 'all' ? undefined : value)}
      >
        <TabsList variant="line" aria-label={t('statusFilter')}>
          <TabsTrigger value="all" className="gap-2">
            {t('allStatuses')}
            {counts && (
              <Badge variant="secondary" size="sm">
                {REPORT_STATUSES.reduce((total, value) => total + counts[value], 0)}
              </Badge>
            )}
          </TabsTrigger>
          {REPORT_STATUSES.map((value) => (
            <TabsTrigger key={value} value={value} className="gap-2">
              {t(value)}
              {counts && (
                <Badge variant="secondary" size="sm">
                  {counts[value]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={term}
            maxLength={200}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="pl-8"
          />
        </div>
        {projects.data && projects.data.length > 1 && (
          <Select
            value={projectId ?? 'all'}
            onValueChange={(value) => filter('projectId', value === 'all' ? undefined : value)}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label={t('project')}>
              <SelectValue placeholder={t('allProjects')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allProjects')}</SelectItem>
              {projects.data.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={sort}
          onValueChange={(value) => filter('sort', value === 'updated' ? undefined : value)}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label={t('sort')}>
            <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PORTAL_REPORT_SORTS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(sortLabels[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="sm:ml-auto">
          <ReportViewSwitcher
            value={board ? 'board' : 'list'}
            onChange={(value) => filter('view', value)}
            labels={{ view: t('reportView'), list: t('list'), board: t('board') }}
          />
        </div>
      </div>
      {projects.isError && <QueryState retry={() => void projects.refetch()} />}
      {board ? (
        <ReportsBoard filters={{ projectId, q, sort }} status={status} />
      ) : (
        <ReportList query={list} />
      )}
    </div>
  );
}
