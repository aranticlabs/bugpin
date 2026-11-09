import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@shared-ui/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@shared-ui/components/ui/collapsible';
import { ReportStatusLabel } from '@shared-ui/lib/status';
import { Button } from '@shared-ui/components/ui/button';
import { portalApi } from '../api/reports';
import { PortalApiError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { errorKey } from '../i18n/error-key';
import { useProjects } from '../hooks/useProjects';
import { FilePreview } from '../components/FilePreview';
import { PlainText } from '../components/PlainText';
import { Composer } from '../components/Composer';
import { QueryState } from '../components/QueryState';
import { AuthCard } from '../components/AuthCard';

export function ReportDetail() {
  const { id = '' } = useParams();
  const { t, locale } = useI18n();
  const projects = useProjects();
  const client = useQueryClient();
  const [writeError, setWriteError] = useState<unknown>(null);
  useEffect(() => setWriteError(null), [id]);
  const query = useQuery({
    queryKey: ['portal', 'report', id],
    queryFn: ({ signal }) => portalApi.detail(id, signal),
  });
  useEffect(() => {
    if (query.data) void client.invalidateQueries({ queryKey: ['portal', 'reports'] });
  }, [id, query.dataUpdatedAt, client]);
  if (query.isPending) return <QueryState loading />;
  if (query.isError)
    return query.error instanceof PortalApiError && query.error.status === 404 ? (
      <AuthCard title={t('notFound')}>
        <Link to="/reports">{t('myFeedback')}</Link>
      </AuthCard>
    ) : (
      <QueryState retry={() => void query.refetch()} />
    );
  const report = query.data;
  const allFiles = [...report.files, ...report.messages.flatMap((message) => message.files)];
  const date = (value: string) => new Date(value).toLocaleString(locale);
  const facts = (
    <div className="space-y-5 p-4">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt>{t('status')}</dt>
        <dd>
          <ReportStatusLabel status={report.status} label={t(report.status)} />
        </dd>
        <dt>{t('project')}</dt>
        <dd className="break-words">{report.project.name}</dd>
        <dt>{t('assignee')}</dt>
        <dd className="break-words">{report.assigneeName ?? t('unassigned')}</dd>
        <dt>{t('created')}</dt>
        <dd>
          <time dateTime={report.createdAt}>{date(report.createdAt)}</time>
        </dd>
        <dt>{t('updated')}</dt>
        <dd>
          <time dateTime={report.updatedAt}>{date(report.updatedAt)}</time>
        </dd>
      </dl>
      {allFiles.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">{t('files')}</h2>
          <FilePreview files={allFiles} />
        </div>
      )}
    </div>
  );
  return (
    <div className="min-w-0 space-y-5">
      <Button asChild variant="link" className="px-0">
        <Link to="/reports">← {t('myFeedback')}</Link>
      </Button>
      <h1 className="break-words text-2xl font-semibold [overflow-wrap:anywhere]">
        {report.title}
      </h1>
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Collapsible className="rounded-lg border lg:hidden">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                {t('reportDetails')} ▾
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>{facts}</CollapsibleContent>
          </Collapsible>
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                {t('originalReport')}
              </CardTitle>
              <time className="text-sm text-muted-foreground" dateTime={report.createdAt}>
                {date(report.createdAt)}
              </time>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.description && <PlainText text={report.description} />}
              <FilePreview files={report.files} />
            </CardContent>
          </Card>
          <ol className="space-y-4" aria-label={t('conversation')}>
            {report.messages.map((message) => (
              <li key={message.id}>
                <Card className={message.isOwn ? 'border-primary/30' : ''}>
                  <CardHeader>
                    <CardTitle role="heading" aria-level={2}>
                      {message.isPreviousReporter ? t('previousReporter') : message.authorName}
                    </CardTitle>
                    <time className="text-sm text-muted-foreground" dateTime={message.createdAt}>
                      {date(message.createdAt)}
                    </time>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <PlainText text={message.body} />
                    <FilePreview files={message.files} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
          {writeError !== null && (
            <p role="alert" className="text-destructive">
              {t(errorKey(writeError))}
            </p>
          )}
          {report.canReply ? (
            <Composer
              key={id}
              reportId={id}
              project={projects.data?.find((project) => project.id === report.project.id)}
              onRejected={setWriteError}
            />
          ) : (
            <Card className="space-y-3 p-4">
              <p>{t(report.status === 'closed' ? 'reportClosed' : 'messagingOff')}</p>
              {report.status === 'closed' && report.canSubmitNewFeedback && (
                <Button asChild>
                  <Link to={`/new?projectId=${encodeURIComponent(report.project.id)}`}>
                    {t('newFeedback')}
                  </Link>
                </Button>
              )}
            </Card>
          )}
          {projects.isError && <QueryState retry={() => void projects.refetch()} />}
        </div>
        <aside className="hidden min-w-0 lg:block">
          <Card>{facts}</Card>
        </aside>
      </div>
    </div>
  );
}
