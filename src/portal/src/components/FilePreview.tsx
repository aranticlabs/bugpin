import type { PortalFile } from '@shared/portal-types';
import { useI18n } from '../i18n/I18nProvider';

export function FilePreview({ files }: { files: PortalFile[] }) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {files.map((file, index) => (
        <div key={file.id} className="min-w-0 space-y-1">
          {file.mimeType.startsWith('video/') ? (
            <video
              src={file.url}
              controls
              preload="metadata"
              className="max-h-80 w-full rounded-md"
              aria-label={t('attachment', { number: index + 1 })}
            />
          ) : file.mimeType.startsWith('image/') ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              <img
                src={file.url}
                loading="lazy"
                className="max-h-80 max-w-full rounded-md object-contain"
                alt={t('attachment', { number: index + 1 })}
              />
            </a>
          ) : null}
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-sm underline"
          >
            {t('openFile', { number: index + 1 })}
          </a>
        </div>
      ))}
    </div>
  );
}
