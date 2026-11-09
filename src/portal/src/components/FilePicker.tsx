import { useState } from 'react';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
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
}: {
  files: File[];
  onChange: (files: File[]) => void;
  project?: PortalProject;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [error, setError] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor="feedback-files">{t('files')}</Label>
      <Input
        id="feedback-files"
        type="file"
        multiple
        accept={types.join(',')}
        disabled={disabled || !project}
        aria-describedby="file-hint"
        onChange={(event) => {
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
        }}
      />
      <p id="file-hint" className="text-sm text-muted-foreground">
        {t('fileHint', { images: project?.maxImageMb ?? 0, videos: project?.maxVideoMb ?? 0 })}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {t('invalidFiles')}
        </p>
      )}
      <ul className="space-y-1">
        {files.map((file, index) => (
          <li key={index} className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-sm">{file.name}</span>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              aria-label={t('removeFile', { name: file.name })}
              onClick={() => {
                onChange(files.filter((_, position) => position !== index));
                setError(false);
              }}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
