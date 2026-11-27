import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import { Badge } from '@shared-ui/components/ui/badge';
import { Button } from '@shared-ui/components/ui/button';
import { FileDropzone } from '@shared-ui/components/FileDropzone';
import { normalizeMimeType } from '@shared/mime';
import type { PortalProject } from '@shared/portal-types';
import { useI18n } from '../i18n/I18nProvider';

const types = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export function FilePicker({
  files,
  onChange,
  project,
  disabled,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  project?: PortalProject;
  disabled?: boolean;
  /** Renders an Attach button and file chips for a message toolbar */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
  }, [project?.id]);
  useEffect(() => {
    if (files.length === 0) setError(false);
  }, [files.length]);
  const hint = project
    ? t('fileHint', {
        images: project.maxImageMb,
        videos: project.maxVideoMb,
      })
    : undefined;
  function select(event: ChangeEvent<HTMLInputElement>) {
    const next = [...files, ...Array.from(event.target.files ?? [])];
    event.target.value = '';
    apply(next);
  }
  function apply(next: File[]) {
    const invalid =
      next.length > 5 ||
      next.some((file) => {
        const mimeType = normalizeMimeType(file.type);
        return (
          !types.includes(mimeType) ||
          file.size >
            1024 *
              1024 *
              (mimeType.startsWith('image/')
                ? (project?.maxImageMb ?? 0)
                : (project?.maxVideoMb ?? 0))
        );
      });
    setError(invalid);
    if (!invalid) onChange(next);
  }
  function remove(index: number) {
    onChange(files.filter((_, position) => position !== index));
    setError(false);
  }
  const fileInput = (
    <Input
      ref={input}
      id={`${id}-files`}
      type="file"
      multiple
      accept={types.join(',')}
      disabled={disabled || !project}
      aria-describedby={hint ? `${id}-hint` : undefined}
      onChange={select}
      tabIndex={compact ? -1 : undefined}
      aria-hidden={compact || undefined}
    />
  );
  const errorMessage = error && (
    <p role="alert" className={compact ? 'w-full text-xs text-destructive' : 'text-destructive'}>
      {t('invalidFiles')}
    </p>
  );

  if (compact)
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="sr-only">
          <Label htmlFor={`${id}-files`}>{t('files')}</Label>
          {fileInput}
          {hint && <p id={`${id}-hint`}>{hint}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={hint}
          aria-describedby={hint ? `${id}-hint` : undefined}
          disabled={disabled || !project}
          onClick={() => input.current?.click()}
        >
          <Paperclip />
          {t('attach')}
        </Button>
        {files.map((file, index) => (
          <Badge key={index} variant="secondary" className="max-w-48 gap-1 font-normal">
            <span className="min-w-0 truncate">{file.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-4 rounded-sm opacity-70 hover:bg-transparent hover:opacity-100 [&_svg]:size-3"
              disabled={disabled}
              aria-label={t('removeFile', { name: file.name })}
              onClick={() => remove(index)}
            >
              <X aria-hidden />
            </Button>
          </Badge>
        ))}
        {errorMessage}
      </div>
    );

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-files`}>{t('files')}</Label>
      <FileDropzone
        id={`${id}-files`}
        files={files}
        onChange={apply}
        onReject={() => setError(true)}
        accept={types.join(',')}
        helperText={hint}
        disabled={disabled || !project}
        labels={{
          title: t('dropFiles'),
          subtitle: t('dropFilesBrowse'),
          addMore: t('addMoreFiles'),
          selectedFiles: t('selectedFiles'),
          remove: (name) => t('removeFile', { name }),
          rejected: () => t('invalidFiles'),
        }}
      />
      {errorMessage}
    </div>
  );
}
