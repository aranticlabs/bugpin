import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PortalReportDetail } from '@shared/portal-types';
import { MediaThumbnails } from '@shared-ui/components/MediaThumbnails';
import { Button } from '@shared-ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared-ui/components/ui/card';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { absoluteTime } from '../../lib/time';
import { PersonAvatar } from '../PersonAvatar';
import { PlainText } from '../PlainText';
import { usePortalMedia } from './media';

export function ReportCard({
  report,
  collapsible = false,
  defaultCollapsed = false,
}: {
  report: PortalReportDetail;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const { t, locale } = useI18n();
  const { reporter } = useAuth();
  const media = usePortalMedia();
  const [collapsedState, setCollapsed] = useState(defaultCollapsed);
  const collapsed = collapsible && collapsedState;
  const items = media.items(report.files);
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 border-b py-4">
        <PersonAvatar name={reporter?.displayName ?? ''} />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base" role="heading" aria-level={2}>
            {t(reporter ? 'yourReport' : 'teamReportTitle')}
          </CardTitle>
          <CardDescription>
            <time dateTime={report.createdAt}>
              {t('sentAt', { date: absoluteTime(report.createdAt, locale) })}
            </time>
          </CardDescription>
        </div>
        {collapsible && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
            {t(collapsed ? 'showFullReport' : 'showLess')}
          </Button>
        )}
      </CardHeader>
      {collapsed ? (
        <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center">
          {report.description && (
            <PlainText
              text={report.description}
              className="line-clamp-2 min-w-0 flex-1 text-sm text-muted-foreground"
            />
          )}
          <MediaThumbnails items={items} labels={media.labels} variant="strip" />
        </CardContent>
      ) : (
        <CardContent className="space-y-4 pt-5">
          {report.description && (
            <PlainText text={report.description} className="text-sm leading-relaxed" />
          )}
          {items.length > 0 && (
            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium">
                {items.length === 1 ? t('media') : t('mediaCount', { count: items.length })}
              </p>
              <MediaThumbnails items={items} labels={media.labels} />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
