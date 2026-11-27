import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Info, Send } from 'lucide-react';
import type { PortalMessage, PortalReportDetail, PortalStatusEvent } from '@shared/portal-types';
import { MediaThumbnails, type MediaItem } from '@shared-ui/components/MediaThumbnails';
import { ReportStatusIcon } from '@shared-ui/lib/status';
import { cn } from '@shared-ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@shared-ui/components/ui/alert';
import { Badge } from '@shared-ui/components/ui/badge';
import { Button } from '@shared-ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared-ui/components/ui/card';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { absoluteTime, relativeTime } from '../../lib/time';
import { PersonAvatar } from '../PersonAvatar';
import { PlainText } from '../PlainText';
import { RichText } from '../RichText';
import { mediaCounter, usePortalMedia } from './media';

type Item =
  | { kind: 'message'; at: number; message: PortalMessage }
  | { kind: 'status'; at: number; event: PortalStatusEvent };

function timeline(report: PortalReportDetail): Item[] {
  return [
    ...report.messages.map((message): Item => ({
      kind: 'message',
      at: Date.parse(message.createdAt),
      message,
    })),
    ...report.statusEvents.map((event): Item => ({
      kind: 'status',
      at: Date.parse(event.createdAt),
      event,
    })),
  ].sort((a, b) => a.at - b.at);
}

/** Keeps a scrollable panel at its newest entry when it opens and when entries arrive */
function useScrollToLatest(enabled: boolean, count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enabled && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [enabled, count]);
  return ref;
}

function Timestamp({ value }: { value: string }) {
  const { locale } = useI18n();
  return (
    <time dateTime={value} title={absoluteTime(value, locale)}>
      {relativeTime(value, locale)}
    </time>
  );
}

function MessageBubble({ message, files }: { message: PortalMessage; files: MediaItem[] }) {
  const { t } = useI18n();
  const { operator } = useAuth();
  const media = usePortalMedia();
  const own = message.isOwn && !operator;
  const team = message.authorKind === 'staff';
  const name = message.isPreviousReporter
    ? t('previousReporter')
    : own
      ? t('you')
      : message.authorName;
  return (
    <li className={cn('flex gap-3', own && 'flex-row-reverse')}>
      <PersonAvatar name={message.isPreviousReporter ? '' : message.authorName} team={team} />
      <div className={cn('min-w-0 max-w-[75%] space-y-1', own && 'items-end text-right')}>
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
            own && 'justify-end'
          )}
        >
          <span className="font-medium text-foreground">{name}</span>
          {team && (
            <Badge variant="secondary" size="sm">
              {t('teamRole')}
            </Badge>
          )}
          <Timestamp value={message.createdAt} />
        </div>
        <div
          className={cn(
            'space-y-3 rounded-2xl px-4 py-2.5 text-left text-sm',
            own
              ? 'rounded-tr-sm bg-primary text-primary-foreground'
              : 'rounded-tl-sm border bg-background'
          )}
        >
          {message.body && <PlainText text={message.body} />}
          <MediaThumbnails items={files} labels={media.labels} variant="compact" />
        </div>
      </div>
    </li>
  );
}

function StatusChange({ event }: { event: PortalStatusEvent }) {
  const { t } = useI18n();
  return (
    <li className="text-center text-xs text-muted-foreground">
      <RichText
        template={t('statusChanged')}
        values={{
          name: (
            <span className="font-medium text-foreground">{event.actorName ?? t('theTeam')}</span>
          ),
          from: <span className="font-medium text-foreground">{t(event.from)}</span>,
          to: (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <ReportStatusIcon status={event.to} className="size-3.5" />
              {t(event.to)}
            </span>
          ),
        }}
      />{' '}
      · <Timestamp value={event.createdAt} />
    </li>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Alert role="status" className="w-full">
      {icon}
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="space-y-3">{children}</AlertDescription>
    </Alert>
  );
}

export function Conversation({
  report,
  composer,
  panel = false,
}: {
  report: PortalReportDetail;
  composer: ReactNode;
  panel?: boolean;
}) {
  const { t } = useI18n();
  const { reporter, operator } = useAuth();
  const media = usePortalMedia();
  const items = timeline(report);
  const counter = mediaCounter();
  media.items(report.files, counter);
  const filesByMessage = new Map(
    items.flatMap((item) =>
      item.kind === 'message' ? [[item.message.id, media.items(item.message.files, counter)]] : []
    )
  );
  const scrollRef = useScrollToLatest(panel, items.length);
  let footer = composer;
  if (operator) {
    footer = (
      <Notice icon={<Eye className="size-4" />} title={t('teamReadOnlyTitle')}>
        {t('teamReadOnlyReply')}
      </Notice>
    );
  } else if (!report.canReply && report.status === 'closed') {
    footer = (
      <Notice icon={<ReportStatusIcon status="closed" />} title={t('reportClosed')}>
        <p>{t('reportClosedHint')}</p>
        {report.canSubmitNewReport && (
          <Button asChild size="sm">
            <Link to={`/new?projectId=${encodeURIComponent(report.project.id)}`}>
              {t('newReport')}
            </Link>
          </Button>
        )}
      </Notice>
    );
  } else if (!report.canReply) {
    footer = <Notice icon={<Info className="size-4" />}>{t('messagingOff')}</Notice>;
  }
  return (
    <Card className={cn('overflow-hidden', panel && 'flex flex-col lg:absolute lg:inset-0')}>
      <CardHeader className="shrink-0 border-b">
        <CardTitle className="text-base" role="heading" aria-level={2}>
          {t('conversation')}
        </CardTitle>
        <CardDescription>
          {t(operator ? 'teamConversationHint' : 'conversationHint')}
        </CardDescription>
      </CardHeader>
      <CardContent
        ref={scrollRef}
        className={cn('space-y-5 bg-muted/20 py-6', panel && 'min-h-0 flex-1 overflow-y-auto')}
      >
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Send className="size-3.5" aria-hidden />
          <span className="font-medium text-foreground">
            {t(operator ? 'reporterSentReport' : 'youSentReport')}
          </span>
          · <Timestamp value={report.createdAt} />
        </p>
        {items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {t('noReplies')}
            {reporter?.emailUpdates && ` ${t('noRepliesEmail')}`}
          </p>
        )}
        {items.length > 0 && (
          <ol className="space-y-5" aria-label={t('conversation')}>
            {items.map((item) =>
              item.kind === 'message' ? (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  files={filesByMessage.get(item.message.id) ?? []}
                />
              ) : (
                <StatusChange key={item.event.id} event={item.event} />
              )
            )}
          </ol>
        )}
      </CardContent>
      <CardFooter className="shrink-0 border-t p-4">{footer}</CardFooter>
    </Card>
  );
}
