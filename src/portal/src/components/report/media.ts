import type { PortalFile } from '@shared/portal-types';
import type { MediaItem, MediaThumbnailsLabels } from '@shared-ui/components/MediaThumbnails';
import { useI18n } from '../../i18n/I18nProvider';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'video/quicktime': 'mov',
};

function extension(mimeType: string): string {
  return extensions[mimeType] ?? (mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin');
}

function size(bytes: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024) return `${format.format(Math.max(bytes, 1) / 1024)} KB`;
  return `${format.format(bytes / 1024 / 1024)} MB`;
}

type Kind = 'screenshot' | 'video' | 'attachment';
export type MediaCounter = Record<Kind, number>;

export function mediaCounter(): MediaCounter {
  return { screenshot: 0, video: 0, attachment: 0 };
}

/**
 * Maps portal files to thumbnails with generated names, since the portal API exposes no filenames.
 * Passing one counter through several calls keeps the names unique across a page.
 */
export function usePortalMedia() {
  const { t, locale } = useI18n();
  const labels: MediaThumbnailsLabels = {
    view: (label) => t('viewMedia', { label }),
    play: (label) => t('playVideo', { label }),
    download: (label) => t('downloadMedia', { label }),
    image: {
      close: t('close'),
      download: t('download'),
      openInNewTab: t('openInNewTab'),
      alt: t('fullSizeImage'),
    },
    video: { close: t('close'), description: t('videoDescription') },
  };
  function items(files: PortalFile[], counts = mediaCounter()): MediaItem[] {
    return files.map((file) => {
      const kind: Kind = file.mimeType.startsWith('video/')
        ? 'video'
        : file.type === 'screenshot'
          ? 'screenshot'
          : 'attachment';
      const number = ++counts[kind];
      return {
        id: file.id,
        url: file.url,
        mimeType: file.mimeType,
        width: file.width,
        height: file.height,
        label: t(kind, { number }),
        filename: `${kind}-${number}.${extension(file.mimeType)}`,
        details:
          file.width && file.height
            ? `${file.width} × ${file.height}`
            : size(file.sizeBytes, locale),
      };
    });
  }
  return { labels, items };
}
