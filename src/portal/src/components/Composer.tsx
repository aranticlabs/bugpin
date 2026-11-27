import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import type { PortalProject } from '@shared/portal-types';
import { Button } from '@shared-ui/components/ui/button';
import { Textarea } from '@shared-ui/components/ui/textarea';
import { FilePicker } from './FilePicker';
import { portalFetch, PortalApiError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { errorKey } from '../i18n/error-key';

export function Composer({
  reportId,
  project,
  refreshedAt,
}: {
  reportId: string;
  project?: PortalProject;
  refreshedAt: number;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const failedRevision = useRef(refreshedAt);
  const mutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.set('body', body);
      files.forEach((file) => form.append('files[]', file));
      return portalFetch(`/reports/${encodeURIComponent(reportId)}/messages`, {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: async () => {
      setBody('');
      setFiles([]);
      await client.invalidateQueries({ queryKey: ['portal'] });
    },
    onError: (error) => {
      failedRevision.current = refreshedAt;
      if (error instanceof PortalApiError && [403, 404, 409].includes(error.status)) {
        void client.invalidateQueries({ queryKey: ['portal'] });
      }
    },
  });
  useEffect(() => {
    if (
      mutation.isError &&
      failedRevision.current !== refreshedAt &&
      mutation.error instanceof PortalApiError &&
      [403, 404, 409].includes(mutation.error.status)
    )
      mutation.reset();
  }, [refreshedAt, mutation.isError, mutation.error, mutation.reset]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!mutation.isPending && (body.trim() || files.length)) mutation.mutate();
  }
  return (
    <form
      onSubmit={submit}
      className="w-full overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring"
    >
      <Textarea
        aria-label={t('message')}
        placeholder={t('replyPlaceholder')}
        maxLength={5000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={mutation.isPending}
        className="min-h-24 resize-none border-0 shadow-none focus-visible:ring-0"
      />
      {mutation.isError && (
        <p role="alert" className="px-3 pb-2 text-sm text-destructive">
          {t(errorKey(mutation.error))}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
        <FilePicker
          compact
          files={files}
          onChange={setFiles}
          project={project}
          disabled={mutation.isPending}
        />
        <span className="hidden min-w-0 flex-1 text-xs text-muted-foreground sm:inline">
          {t('messageHint')}
        </span>
        <Button
          size="sm"
          className="ml-auto"
          disabled={mutation.isPending || (!body.trim() && !files.length)}
        >
          {!mutation.isPending && <Send />}
          {t(mutation.isPending ? 'loading' : 'send')}
        </Button>
      </div>
    </form>
  );
}
