import { ExternalLink } from 'lucide-react';
import type { PortalReportEnvironment } from '@shared/portal-types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared-ui/components/ui/card';
import { useI18n } from '../../i18n/I18nProvider';

function isWebAddress(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function CapturedDetailsCard({ environment }: { environment: PortalReportEnvironment }) {
  const { t } = useI18n();
  const { pageUrl, browser, os, viewport, timezone } = environment;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base" role="heading" aria-level={2}>
          {t('captured')}
        </CardTitle>
        <CardDescription className="text-xs">{t('capturedHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          {pageUrl && (
            <>
              <dt className="text-muted-foreground">{t('page')}</dt>
              <dd className="min-w-0">
                {isWebAddress(pageUrl) ? (
                  <a
                    href={pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 hover:underline"
                    title={pageUrl}
                  >
                    <span className="truncate">{pageUrl.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <span className="block truncate" title={pageUrl}>
                    {pageUrl}
                  </span>
                )}
              </dd>
            </>
          )}
          {browser && (
            <>
              <dt className="text-muted-foreground">{t('browser')}</dt>
              <dd className="break-words">{browser}</dd>
            </>
          )}
          {os && (
            <>
              <dt className="text-muted-foreground">{t('operatingSystem')}</dt>
              <dd className="break-words">{os}</dd>
            </>
          )}
          {viewport && (
            <>
              <dt className="text-muted-foreground">{t('screen')}</dt>
              <dd>
                {viewport.width} × {viewport.height}
              </dd>
            </>
          )}
          {timezone && (
            <>
              <dt className="text-muted-foreground">{t('timezone')}</dt>
              <dd className="break-words">{timezone}</dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
