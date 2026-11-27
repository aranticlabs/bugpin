import type { PortalReportDetail } from '@shared/portal-types';
import { ReportStatusLabel } from '@shared-ui/lib/status';
import { Card, CardContent, CardHeader, CardTitle } from '@shared-ui/components/ui/card';
import { useI18n } from '../../i18n/I18nProvider';
import { absoluteTime } from '../../lib/time';
import { PersonAvatar } from '../PersonAvatar';

export function DetailsCard({ report }: { report: PortalReportDetail }) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base" role="heading" aria-level={2}>
          {t('details')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">{t('status')}</dt>
          <dd>
            <ReportStatusLabel status={report.status} label={t(report.status)} />
          </dd>
          <dt className="text-muted-foreground">{t('project')}</dt>
          <dd className="break-words">{report.project.name}</dd>
          <dt className="text-muted-foreground">{t('assignee')}</dt>
          <dd className="min-w-0">
            {report.assigneeName ? (
              <span className="inline-flex max-w-full items-center gap-2">
                <PersonAvatar
                  name={report.assigneeName}
                  team
                  className="h-5 w-5 [&>span]:text-[9px]"
                />
                <span className="break-words">{report.assigneeName}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t('unassigned')}</span>
            )}
          </dd>
          <dt className="text-muted-foreground">{t('created')}</dt>
          <dd>
            <time dateTime={report.createdAt}>{absoluteTime(report.createdAt, locale)}</time>
          </dd>
          <dt className="text-muted-foreground">{t('updated')}</dt>
          <dd>
            <time dateTime={report.updatedAt}>{absoluteTime(report.updatedAt, locale)}</time>
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
