import { Fragment, useId, useState, type FormEvent } from 'react';
import { ChevronDown, Download, MessageSquare, Paperclip, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Spinner } from '../ui/spinner';
import { FileDropzone } from '../FileDropzone';
import { ImageLightbox } from '../report/ImageLightbox';
import { usePreference } from '../../hooks/useUserPreferences';
import { PortalAccessConfirmation } from './PortalAccessConfirmation';
import { isApiError, getApiErrorMessage } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import type { useReporterMessages } from '../../hooks/useReporterMessages';

const ACCEPTED_MEDIA =
  'image/png,image/jpeg,image/jpg,image/gif,image/webp,video/mp4,video/webm,video/quicktime';

function MessageText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
      {text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
        if (index % 2 === 0) return part;
        let href = part.replace(/[.,!?;:]+$/, '');
        let excessClosing = (href.match(/\)/g)?.length ?? 0) - (href.match(/\(/g)?.length ?? 0);
        while (href.endsWith(')') && excessClosing > 0) {
          href = href.slice(0, -1).replace(/[.,!?;:]+$/, '');
          excessClosing--;
        }
        return (
          <Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline underline-offset-2"
            >
              {href}
            </a>
            {part.slice(href.length)}
          </Fragment>
        );
      })}
    </p>
  );
}

export function ConversationCard({
  reportId,
  conversation,
  canEdit,
  messagingEnabled,
  hasRecipient,
  portalEnabled,
  projectActive,
  hasOwner,
  hasNewReporterActivity,
  onMarkSeen,
  isMarkingSeen = false,
  maxImageMb = 10,
  maxVideoMb = 50,
}: {
  reportId: string;
  conversation: ReturnType<typeof useReporterMessages>;
  canEdit: boolean;
  messagingEnabled: boolean;
  hasRecipient: boolean;
  portalEnabled?: boolean;
  projectActive?: boolean;
  hasOwner: boolean;
  hasNewReporterActivity?: boolean;
  onMarkSeen?: () => void;
  isMarkingSeen?: boolean;
  maxImageMb?: number;
  maxVideoMb?: number;
}) {
  const inputId = useId();
  const [open, setOpen] = usePreference('reportMessagesOpen', true, {
    legacyKey: 'bugpin.report-detail.reporter-messages-open',
    parseLegacy: (raw) => raw === 'true',
  });
  const [message, setMessage] = useState('');
  const [ccSender, setCcSender] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [fileError, setFileError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [image, setImage] = useState<{ url: string; filename: string } | null>(null);

  function changeFiles(next: File[]) {
    if (next.length > 5) {
      setFileError('Attach up to 5 files.');
      return;
    }
    const oversized = next.find(
      (file) => file.size > (file.type.startsWith('video/') ? maxVideoMb : maxImageMb) * 1024 * 1024
    );
    if (oversized) {
      setFileError(
        `${oversized.name} exceeds the ${oversized.type.startsWith('video/') ? maxVideoMb : maxImageMb} MB limit.`
      );
      return;
    }
    setFileError('');
    setFiles(next);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (conversation.isSending || (!message.trim() && files.length === 0)) return;
    if (conversation.portal?.requiresPortalAccessConfirmation) {
      setConfirming(true);
      return;
    }
    await submit(false);
  }

  async function submit(confirmPortalAccess: boolean) {
    if (conversation.isSending) return;
    try {
      await conversation.sendMessageAsync({
        message: message.trim(),
        ccSender,
        files,
        confirmPortalAccess: confirmPortalAccess || undefined,
      });
    } catch (error) {
      if (isApiError(error) && error.response?.data?.error === 'CONFIRMATION_REQUIRED')
        setConfirming(true);
      else setConfirming(false);
      return;
    }
    setConfirming(false);
    setMessage('');
    setCcSender(false);
    setFiles([]);
    setFileError('');
    setAttachmentsOpen(false);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card role="region" aria-label="Conversation" className="min-w-0">
        <CardHeader className="p-0">
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between rounded-t-xl p-6 text-left outline-none hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <MessageSquare className="size-4 shrink-0" aria-hidden />
              Conversation<Badge variant="secondary">{conversation.messages.length}</Badge>
            </CardTitle>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          {hasNewReporterActivity && (
            <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
              <Badge variant="secondary">New reporter activity</Badge>
              {canEdit && onMarkSeen && (
                <Button variant="outline" size="sm" disabled={isMarkingSeen} onClick={onMarkSeen}>
                  Mark as seen
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            {portalEnabled !== undefined && (
              <p className="text-sm text-muted-foreground">
                {projectActive === false
                  ? 'Project inactive. The conversation is not visible in the portal.'
                  : !portalEnabled
                    ? 'Portal disabled for this project'
                    : hasOwner
                      ? 'Visible to the reporter in the portal'
                      : 'No reporter currently has portal access to this report'}
              </p>
            )}
            {conversation.portal?.ownerLastLoginAt && (
              <p className="text-sm text-muted-foreground">
                Last reporter login {formatDateTime(conversation.portal.ownerLastLoginAt)}
              </p>
            )}
            {conversation.portal?.emailSuppressed && (
              <p className="text-sm text-muted-foreground">
                Reporter opted out of update emails. Messages remain in the conversation.
              </p>
            )}
            {conversation.isLoading ? (
              <div
                role="status"
                className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
              >
                <Spinner size="sm" />
                Loading conversation...
              </div>
            ) : conversation.error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Could not load the conversation.{' '}
                  <Button type="button" variant="link" onClick={() => void conversation.refetch()}>
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : conversation.messages.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              <ol aria-label="Messages" className="space-y-3">
                {conversation.messages.map((entry) => (
                  <li key={entry.id}>
                    <article
                      aria-label={`${entry.authorKind === 'reporter' ? 'Reporter' : 'Staff'} message from ${entry.authorName}`}
                      className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">
                          {entry.authorName}
                        </span>
                        <Badge variant={entry.authorKind === 'reporter' ? 'secondary' : 'outline'}>
                          {entry.authorKind === 'reporter' ? 'Reporter' : 'Staff'}
                        </Badge>
                        <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                        {entry.hiddenAt && <Badge variant="outline">Hidden from reporter</Badge>}
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-auto min-h-11 sm:min-h-8"
                            disabled={conversation.isModerating}
                            aria-label={`${entry.hiddenAt ? 'Unhide' : 'Hide'} message from ${entry.authorName}`}
                            onClick={() => {
                              void conversation
                                .setHidden({ messageId: entry.id, hidden: !entry.hiddenAt })
                                .catch(() => undefined);
                            }}
                          >
                            {conversation.moderatingMessageId === entry.id && (
                              <Spinner size="sm" className="mr-1" />
                            )}
                            {entry.hiddenAt ? 'Unhide' : 'Hide'}
                          </Button>
                        )}
                      </div>
                      {entry.message && <MessageText text={entry.message} />}
                      {entry.files.length > 0 && (
                        <ul
                          aria-label={`Attachments from ${entry.authorName}`}
                          className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
                        >
                          {entry.files.map((file) => {
                            const url = `/api/reports/${reportId}/files/${file.id}`;
                            return (
                              <li key={file.id} className="min-w-0 space-y-2">
                                {file.mimeType.startsWith('video/') ? (
                                  <video
                                    src={url}
                                    aria-label={file.filename}
                                    controls
                                    preload="metadata"
                                    className="max-h-48 w-full rounded-md border bg-black object-contain"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`View ${file.filename}`}
                                    onClick={() => setImage({ url, filename: file.filename })}
                                    className="block w-full cursor-zoom-in rounded-md focus-visible:focus-ring"
                                  >
                                    <img
                                      src={url}
                                      alt={file.filename}
                                      loading="lazy"
                                      className="max-h-48 w-full rounded-md border bg-muted object-contain"
                                    />
                                  </button>
                                )}
                                <a
                                  href={url}
                                  download={file.filename}
                                  className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm text-sm text-primary underline-offset-2 hover:underline focus-visible:focus-ring"
                                  aria-label={`Download ${file.filename}`}
                                >
                                  <Download className="size-4 shrink-0" aria-hidden />
                                  <span className="truncate" title={file.filename}>
                                    {file.filename}
                                  </span>
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            )}
            {conversation.moderationError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {getApiErrorMessage(
                    conversation.moderationError,
                    'Failed to change message visibility'
                  )}
                </AlertDescription>
              </Alert>
            )}
            {!messagingEnabled && (
              <p className="text-sm text-muted-foreground">
                Messaging is disabled for this project. Existing messages remain available.
              </p>
            )}
            {messagingEnabled && !hasRecipient && (
              <p className="text-sm text-muted-foreground">
                This report has no reporter or contact email.
              </p>
            )}
            {canEdit && messagingEnabled && hasRecipient && (
              <form onSubmit={send} className="space-y-3 border-t pt-4">
                <Label htmlFor={inputId}>Message to reporter</Label>
                <Textarea
                  id={inputId}
                  aria-describedby={`${inputId}-hint`}
                  placeholder="Write a message to the reporter..."
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={5000}
                  rows={3}
                  disabled={conversation.isSending}
                />
                <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
                  Messages cannot be edited. Attach up to 5 images or videos.
                </p>
                {attachmentsOpen && (
                  <FileDropzone
                    files={files}
                    onChange={changeFiles}
                    accept={ACCEPTED_MEDIA}
                    helperText={`Images up to ${maxImageMb} MB. Videos up to ${maxVideoMb} MB.`}
                    disabled={conversation.isSending}
                  />
                )}
                {fileError && (
                  <p role="alert" className="text-sm text-destructive">
                    {fileError}
                  </p>
                )}
                {conversation.sendError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {getApiErrorMessage(conversation.sendError, 'Failed to send message')}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    aria-expanded={attachmentsOpen}
                    onClick={() => setAttachmentsOpen(!attachmentsOpen)}
                    disabled={conversation.isSending}
                  >
                    <Paperclip className="mr-2 size-4" aria-hidden />
                    Attach files{files.length > 0 ? ` (${files.length})` : ''}
                  </Button>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={ccSender}
                      onCheckedChange={(checked) => setCcSender(checked === true)}
                      disabled={conversation.isSending}
                    />
                    Send me a copy
                  </label>
                  <Button
                    type="submit"
                    className="min-h-11 sm:ml-auto"
                    disabled={conversation.isSending || (!message.trim() && files.length === 0)}
                  >
                    {conversation.isSending ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Send className="mr-2 size-4" aria-hidden />
                    )}
                    {conversation.isSending ? 'Sending...' : 'Send Message'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </CollapsibleContent>
        <PortalAccessConfirmation
          open={confirming}
          busy={conversation.isSending}
          onOpenChange={setConfirming}
          onConfirm={() => void submit(true)}
        />
        <ImageLightbox image={image} onClose={() => setImage(null)} />
      </Card>
    </Collapsible>
  );
}
