import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ReportStatusLabel } from '@shared-ui/lib/status';
import { Button } from '@shared-ui/components/ui/button';
import { portalApi } from '../api/reports';
import { PortalApiError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { useProjects } from '../hooks/useProjects';
import { useIsWide } from '../hooks/useIsWide';
import { relativeTime } from '../lib/time';
import { Composer } from '../components/Composer';
import { QueryState } from '../components/QueryState';
import { AuthCard } from '../components/AuthCard';
import { ReportCard } from '../components/report/ReportCard';
import { DetailsCard } from '../components/report/DetailsCard';
import { CapturedDetailsCard } from '../components/report/CapturedDetailsCard';
import { NotificationsCard } from '../components/report/NotificationsCard';
import { Conversation } from '../components/report/Conversation';

export function ReportDetail() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const auth = useAuth();
  const projects = useProjects();
  const client = useQueryClient();
  const wide = useIsWide();
  const query = useQuery({
    queryKey: ['portal', 'report', id],
    queryFn: ({ signal }) => portalApi.detail(id, signal),
  });
  useEffect(() => {
    if (query.data) void client.invalidateQueries({ queryKey: ['portal', 'reports'] });
  }, [id, query.dataUpdatedAt, client]);
  const back = t(auth.operator ? 'teamReports' : 'myReports');
  if (query.isPending) return <QueryState loading />;
  if (query.isError)
    return query.error instanceof PortalApiError && query.error.status === 404 ? (
      <div role="status" className="flex flex-1 flex-col">
        <AuthCard title={t('notFound')}>
          <Link to="/reports" className="underline">
            {back}
          </Link>
        </AuthCard>
      </div>
    ) : (
      <QueryState retry={() => void query.refetch()} />
    );
  const report = query.data;
  const composer = (
    <Composer
      key={id}
      reportId={id}
      refreshedAt={query.dataUpdatedAt}
      project={projects.data?.find((project) => project.id === report.project.id)}
    />
  );
  const sideCards = (
    <>
      <DetailsCard report={report} />
      {report.environment && <CapturedDetailsCard environment={report.environment} />}
      <NotificationsCard />
      {projects.isError && <QueryState retry={() => void projects.refetch()} />}
    </>
  );
  return (
    <div className="min-w-0 space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/reports">
          <ArrowLeft />
          {back}
        </Link>
      </Button>
      <div className="space-y-2">
        <h1 className="break-words text-2xl font-bold [overflow-wrap:anywhere]">{report.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <ReportStatusLabel status={report.status} label={t(report.status)} />
          <span className="break-words">{report.project.name}</span>
          <span>{t('openedAgo', { time: relativeTime(report.createdAt, locale) })}</span>
        </p>
      </div>
      {/* One tree for every width keeps the reply draft when the layout changes */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-6">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ReportCard
            key={report.id}
            report={report}
            collapsible={!wide}
            defaultCollapsed={report.messages.length > 0}
          />
        </div>
        <div className="relative min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-[30rem]">
          <Conversation report={report} composer={composer} panel={wide} />
        </div>
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">{sideCards}</div>
      </div>
    </div>
  );
}
