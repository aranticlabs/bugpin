import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PortalProject } from '@shared/portal-types';
import { Button } from '@shared-ui/components/ui/button';
import { Textarea } from '@shared-ui/components/ui/textarea';
import { Label } from '@shared-ui/components/ui/label';
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
    if (mutation.isError && failedRevision.current !== refreshedAt) mutation.reset();
  }, [refreshedAt, mutation.isError, mutation.reset]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!mutation.isPending && (body.trim() || files.length)) mutation.mutate();
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <Label htmlFor="message-body">{t('message')}</Label>
      <Textarea
        id="message-body"
        maxLength={5000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={mutation.isPending}
      />
      <FilePicker
        files={files}
        onChange={setFiles}
        project={project}
        disabled={mutation.isPending}
      />
      {mutation.isError && (
        <p role="alert" className="text-destructive">
          {t(errorKey(mutation.error))}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t('messageHint')}</p>
      <Button disabled={mutation.isPending || (!body.trim() && !files.length)}>
        {t(mutation.isPending ? 'loading' : 'send')}
      </Button>
    </form>
  );
}
