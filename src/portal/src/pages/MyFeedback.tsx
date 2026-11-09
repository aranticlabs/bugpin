import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { REPORT_STATUSES, type ReportStatus } from '@shared/types';
import type { PortalReportSummary } from '@shared/portal-types';
import { ReportBoard } from '@shared-ui/components/report-board/ReportBoard';
import { ReportViewSwitcher } from '@shared-ui/components/report-board/ReportViewSwitcher';
import { ReportStatusLabel } from '@shared-ui/lib/status';
import { Button } from '@shared-ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared-ui/components/ui/select';
import { portalApi } from '../api/reports';
import { useProjects } from '../hooks/useProjects';
import { useI18n } from '../i18n/I18nProvider';
import { useBranding } from '../branding/BrandingProvider';
import { QueryState } from '../components/QueryState';

function unique(reports: PortalReportSummary[]) {
  return [...new Map(reports.map((report) => [report.id, report])).values()];
}

function ReportSummary({ report }: { report: PortalReportSummary }) {
  const { t, locale } = useI18n();
  const minutes = Math.round((Date.parse(report.updatedAt) - Date.now()) / 60000);
  const age = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return (
    <div className="min-w-0 space-y-2">
      <span className="flex min-w-0 items-start gap-2 font-medium">
        {report.unread && (
          <>
            <span className="mt-1 shrink-0 text-primary" aria-hidden="true">
              ●
            </span>
            <span className="sr-only">{t('unread')} </span>
          </>
        )}
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{report.title}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="break-words">{report.project.name}</span>
        <ReportStatusLabel status={report.status} label={t(report.status)} />
        <time dateTime={report.updatedAt} title={new Date(report.updatedAt).toLocaleString(locale)}>
          {Math.abs(minutes) < 60
            ? age.format(minutes, 'minute')
            : Math.abs(minutes) < 1440
              ? age.format(Math.round(minutes / 60), 'hour')
              : age.format(Math.round(minutes / 1440), 'day')}
        </time>
      </span>
    </div>
  );
}

function FeedbackList({
  projectId,
  status,
  onUnread,
}: {
  projectId?: string;
  status?: ReportStatus;
  onUnread: (count: number) => void;
}) {
  const { t } = useI18n();
  const query = useInfiniteQuery({
    queryKey: ['portal', 'reports', 'list', projectId, status],
    queryFn: ({ pageParam, signal }) =>
      portalApi.list({ projectId, status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  useEffect(() => {
    onUnread(query.data?.pages[0].unreadCount ?? 0);
  }, [query.data, onUnread]);
  if (query.isPending) return <QueryState loading />;
  if (query.isError && !query.data) return <QueryState retry={() => void query.refetch()} />;
  const reports = unique(query.data?.pages.flatMap((page) => page.reports) ?? []);
  return (
    <div className="space-y-4">
      {!reports.length && (
        <p className="rounded-lg border border-dashed p-6 text-center">{t('emptyFeedback')}</p>
      )}
      <ul className="divide-y rounded-lg border">
        {reports.map((report) => (
          <li key={report.id}>
            <Link
              to={`/reports/${encodeURIComponent(report.id)}`}
              className="block min-w-0 p-4 hover:bg-muted/50"
            >
              <ReportSummary report={report} />
            </Link>
          </li>
        ))}
      </ul>
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

function useColumn(status: ReportStatus, projectId?: string, filter?: ReportStatus) {
  return useInfiniteQuery({
    queryKey: ['portal', 'reports', 'board', projectId, filter, status],
    enabled: !filter || status === filter,
    queryFn: async ({ pageParam, signal }) => {
      const result = await portalApi.board({ projectId, status, cursor: pageParam }, signal);
      return { ...result.columns[status], unreadCount: result.unreadCount };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function FeedbackBoard({
  projectId,
  status,
  onUnread,
}: {
  projectId?: string;
  status?: ReportStatus;
  onUnread: (count: number) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<ReportStatus[]>([]);
  const queries = [
    useColumn('open', projectId, status),
    useColumn('in_progress', projectId, status),
    useColumn('resolved', projectId, status),
    useColumn('closed', projectId, status),
  ];
  const unread = queries.reduce(
    (count, query, index) =>
      count +
      (!status || status === REPORT_STATUSES[index] ? (query.data?.pages[0].unreadCount ?? 0) : 0),
    0
  );
  useEffect(() => {
    onUnread(unread);
  }, [unread, onUnread]);
  return (
    <ReportBoard
      columns={REPORT_STATUSES.map((column, index) => {
        const query = queries[index];
        const included = !status || column === status;
        return {
          status: column,
          items: included ? unique(query.data?.pages.flatMap((page) => page.reports) ?? []) : [],
          total: included ? (query.data?.pages[0].total ?? 0) : 0,
          loading: included && query.isPending,
          loadingMore: query.isFetchingNextPage,
          hasMore: included && query.hasNextPage,
          error: included && query.isError,
          onLoadMore: () => {
            void query.fetchNextPage();
          },
          onRetry: () => {
            void query.refetch();
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
      renderCard={(report) => <ReportSummary report={report} />}
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

export function MyFeedback() {
  const { t, locale } = useI18n();
  const branding = useBranding();
  const projects = useProjects();
  const [search, setSearch] = useSearchParams();
  const [unread, setUnread] = useState(0);
  const projectId = search.get('projectId') || undefined;
  const status = REPORT_STATUSES.find((value) => value === search.get('status'));
  const board = search.get('view') === 'board';
  useEffect(() => {
    document.title = `${unread ? `(${unread}) ` : ''}${t('myFeedback')} | ${branding?.appName ?? 'BugPin'}`;
    return () => {
      document.title = `${t('portalTitle')} | ${branding?.appName ?? 'BugPin'}`;
    };
  }, [unread, locale, branding?.appName]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setSearch(next);
  }
  return (
    <div className="min-w-0 space-y-6">
      <h1 className="text-2xl font-semibold">{t('myFeedback')}</h1>
      <div className="flex flex-wrap items-center gap-3">
        {projects.data && projects.data.length > 1 && (
          <Select value={projectId ?? 'all'} onValueChange={(value) => filter('projectId', value)}>
            <SelectTrigger className="w-full sm:w-48" aria-label={t('project')}>
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
        <Select value={status ?? 'all'} onValueChange={(value) => filter('status', value)}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t('status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            {REPORT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ReportViewSwitcher
          value={board ? 'board' : 'list'}
          onChange={(value) => filter('view', value)}
          labels={{ view: t('reportView'), list: t('list'), board: t('board') }}
        />
        {projects.data?.some((project) => project.allowNewFeedback) && (
          <Button asChild className="sm:ml-auto">
            <Link to="/new">{t('newFeedback')}</Link>
          </Button>
        )}
      </div>
      {projects.isError && <QueryState retry={() => void projects.refetch()} />}
      {board ? (
        <FeedbackBoard projectId={projectId} status={status} onUnread={setUnread} />
      ) : (
        <FeedbackList projectId={projectId} status={status} onUnread={setUnread} />
      )}
    </div>
  );
}
