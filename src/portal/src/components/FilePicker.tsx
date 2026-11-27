import { useId, useRef, useState, type ChangeEvent } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import { Badge } from '@shared-ui/components/ui/badge';
import { Button } from '@shared-ui/components/ui/button';
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
  const hint = t('fileHint', {
    images: project?.maxImageMb ?? 0,
    videos: project?.maxVideoMb ?? 0,
  });
  function select(event: ChangeEvent<HTMLInputElement>) {
    const next = [...files, ...Array.from(event.target.files ?? [])];
    event.target.value = '';
    const invalid =
      next.length > 5 ||
      next.some(
        (file) =>
          !types.includes(file.type) ||
          file.size >
            1024 *
              1024 *
              (file.type.startsWith('image/')
                ? (project?.maxImageMb ?? 0)
                : (project?.maxVideoMb ?? 0))
      );
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
      aria-describedby={`${id}-hint`}
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
          <p id={`${id}-hint`}>{hint}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={hint}
          aria-describedby={`${id}-hint`}
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
      {fileInput}
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      {errorMessage}
      <ul className="space-y-1">
        {files.map((file, index) => (
          <li key={index} className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-sm">{file.name}</span>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              aria-label={t('removeFile', { name: file.name })}
              onClick={() => remove(index)}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
