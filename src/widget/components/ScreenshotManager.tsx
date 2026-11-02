import { FunctionComponent } from 'preact';
import { useState, useCallback, useRef } from 'preact/hooks';
import {
  Camera,
  TriangleAlert,
  X,
  CircleAlert,
  Upload,
  Pencil,
  Download,
  Trash2,
  Plus,
  Video,
} from 'lucide-preact';
import { cn } from '../lib/utils';
import { Button } from './ui';
import { useLocale } from '../hooks/use-locale.js';
import { useObjectUrl } from '../hooks/use-object-url.js';
import { getLocale, t } from '../i18n/index.js';
import { getExtensionFromMimeType, type MediaData } from '../api/submit-form.js';
import { formatDuration } from './RecordingBar.js';

interface CapturedMediaBase {
  id: string;
  timestamp: Date;
  annotated: boolean;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  annotations?: object;
  source?: 'recording';
  recovered?: boolean;
}

export type CapturedMedia = CapturedMediaBase & MediaData;

interface ScreenshotManagerProps {
  media: CapturedMedia[];
  onCapture: () => void;
  onUpload: (item: CapturedMedia) => void;
  onRemove: (id: string) => void;
  onAnnotate: (id: string) => void;
  isCapturing: boolean;
  enableAnnotation: boolean;
  maxImageSize?: number;
  maxVideoSize?: number;
  reduceQuality: boolean;
  onReduceQualityChange: (value: boolean) => void;
  oversizedCapture: { sizeMb: number; limitMb: number } | null;
  onDismissOversizedCapture: () => void;
}

const DEFAULT_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export function formatVideoMeta(item: CapturedMedia): string {
  const details: string[] = [];
  if (item.durationMs !== undefined) details.push(formatDuration(item.durationMs));
  if (item.blob) {
    const sizeMb = Math.max(item.blob.size / (1024 * 1024), 0.1);
    try {
      details.push(
        new Intl.NumberFormat(getLocale(), {
          style: 'unit',
          unit: 'megabyte',
          unitDisplay: 'short',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(sizeMb)
      );
    } catch {
      details.push(`${sizeMb.toFixed(1)} MB`);
    }
  }
  return details.join(' · ');
}

export function downloadMedia(item: CapturedMedia): void {
  const extension = getExtensionFromMimeType(item.mimeType);
  const stamp = item.timestamp.toISOString().replace(/[:.]/g, '-');
  const kind =
    item.source === 'recording'
      ? 'recording'
      : item.mimeType.startsWith('video/')
        ? 'video'
        : 'screenshot';
  const anchor = document.createElement('a');
  const objectUrl = item.blob ? URL.createObjectURL(item.blob) : null;
  anchor.href = item.blob ? (objectUrl as string) : item.dataUrl;
  anchor.download = `bugpin-${kind}-${stamp}.${extension}`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (objectUrl) {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

export const VideoPreview: FunctionComponent<{ item: CapturedMedia; controls?: boolean }> = ({
  item,
  controls = false,
}) => {
  const objectUrl = useObjectUrl(item.blob);
  const source = item.blob ? objectUrl : item.dataUrl;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = source !== null && source !== undefined && failedSource === source;

  if (failed) {
    return (
      <div
        data-testid="video-preview-fallback"
        role="status"
        class="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center text-gray-200"
      >
        <Video class="w-8 h-8" aria-hidden="true" />
        <span class="text-xs font-medium">{t('recording.previewUnavailable')}</span>
        {formatVideoMeta(item) && <span class="text-xs">{formatVideoMeta(item)}</span>}
      </div>
    );
  }

  return (
    <video
      class="w-full h-full object-contain"
      src={source ?? undefined}
      muted={!controls}
      controls={controls}
      playsInline
      preload="metadata"
      aria-label={t('screenshot.badge.video')}
      onError={() => source && setFailedSource(source)}
    />
  );
};

const ImagePreview: FunctionComponent<{ item: CapturedMedia }> = ({ item }) => {
  const objectUrl = useObjectUrl(item.blob);
  const source = item.blob ? objectUrl : item.dataUrl;

  return (
    <img class="w-full h-full object-contain" src={source ?? undefined} alt={t('screenshot.alt')} />
  );
};

const MediaPreview: FunctionComponent<{ item: CapturedMedia }> = ({ item }) => {
  return item.mimeType.startsWith('video/') ? (
    <VideoPreview item={item} />
  ) : (
    <ImagePreview item={item} />
  );
};

export const ScreenshotManager: FunctionComponent<ScreenshotManagerProps> = ({
  media,
  onCapture,
  onUpload,
  onRemove,
  onAnnotate,
  isCapturing,
  enableAnnotation,
  maxImageSize = DEFAULT_MAX_IMAGE_SIZE,
  maxVideoSize = DEFAULT_MAX_VIDEO_SIZE,
  reduceQuality,
  onReduceQualityChange,
  oversizedCapture,
  onDismissOversizedCapture,
}) => {
  useLocale();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVideo = (mimeType: string) => mimeType.startsWith('video/');
  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  const maxImageSizeMb = Math.round(maxImageSize / (1024 * 1024));
  const maxVideoSizeMb = Math.round(maxVideoSize / (1024 * 1024));

  const validateFile = useCallback(
    (file: File): string | null => {
      if (isImage(file.type)) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          return t('screenshot.error.unsupportedImage', { type: file.type });
        }
        if (file.size > maxImageSize) {
          return t('screenshot.error.imageTooLarge', { size: maxImageSizeMb });
        }
      } else if (isVideo(file.type)) {
        if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
          return t('screenshot.error.unsupportedVideo', { type: file.type });
        }
        if (file.size > maxVideoSize) {
          return t('screenshot.error.videoTooLarge', { size: maxVideoSizeMb });
        }
      } else {
        return t('screenshot.error.unsupportedFile', { type: file.type });
      }
      return null;
    },
    [maxImageSize, maxImageSizeMb, maxVideoSize, maxVideoSizeMb]
  );

  const processFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        setUploadError(error);
        return;
      }

      setUploadError(null);

      if (isVideo(file.type)) {
        const video = document.createElement('video');
        const objectUrl = URL.createObjectURL(file);
        let settled = false;
        const cleanup = () => URL.revokeObjectURL(objectUrl);
        const upload = (
          metadata: Partial<Pick<CapturedMedia, 'width' | 'height' | 'durationMs'>>
        ) => {
          if (settled) return;
          settled = true;
          const item: CapturedMedia = {
            id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            blob: file,
            timestamp: new Date(),
            annotated: false,
            mimeType: file.type,
            ...metadata,
          };
          cleanup();
          onUpload(item);
        };
        video.onloadedmetadata = () =>
          upload({
            width: video.videoWidth,
            height: video.videoHeight,
            durationMs: Number.isFinite(video.duration)
              ? Math.round(video.duration * 1000)
              : undefined,
          });
        video.onerror = () => upload({});
        video.src = objectUrl;
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;

        if (isImage(file.type)) {
          const img = new Image();
          img.onload = () => {
            const item: CapturedMedia = {
              id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              dataUrl,
              timestamp: new Date(),
              annotated: false,
              mimeType: file.type,
              width: img.width,
              height: img.height,
            };
            onUpload(item);
          };
          img.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    },
    [validateFile, onUpload]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          await processFile(files[i]);
        }
      }
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const files = input.files;
      if (files) {
        for (let i = 0; i < files.length; i++) {
          await processFile(files[i]);
        }
      }
      input.value = '';
    },
    [processFile]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div class="flex-auto min-h-0 flex flex-col">
      {/* Fixed top section: capture button and related controls stay visible
          while the media grid below scrolls independently. */}
      <div class="shrink-0 flex flex-col gap-4 px-6 pt-6 pb-4">
        <div
          class="flex items-center justify-end gap-2 text-xs text-muted-foreground select-none"
          title={t('screenshot.quality.tooltip')}
        >
          <label class="flex items-center gap-2 cursor-pointer">
            <span>{t('screenshot.quality.label')}</span>
            <input
              type="checkbox"
              class="peer sr-only"
              checked={reduceQuality}
              onChange={(e) => onReduceQualityChange((e.target as HTMLInputElement).checked)}
              aria-label={t('screenshot.quality.label')}
            />
            <span
              aria-hidden="true"
              class="relative flex-shrink-0 inline-block w-8 h-4 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-[var(--button-color)] after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
            />
          </label>
        </div>

        {/* Action button */}
        <div class="flex gap-2">
          <Button class="flex-1" onClick={onCapture} disabled={isCapturing}>
            <Camera class="w-4.5 h-4.5" />
            {isCapturing ? t('screenshot.capturing') : t('screenshot.capture')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        {/* Privacy notice */}
        <p class="text-xs text-muted-foreground">{t('screenshot.privacyTip')}</p>

        {/* Oversize warning banner with inline quality toggle.
          Only shown after a too-large capture is rejected. */}
        {oversizedCapture && (
          <div
            role="alert"
            class="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-solid border-amber-200 dark:border-amber-800/60 rounded text-amber-800 dark:text-amber-200 text-xs"
          >
            <TriangleAlert class="w-4 h-4 flex-shrink-0 mt-px" />
            <div class="flex-1 leading-relaxed">
              <p class="font-medium">
                {t('screenshot.error.captureTooLarge', {
                  size: oversizedCapture.sizeMb,
                  limit: oversizedCapture.limitMb,
                })}
              </p>
              <p class="mt-1 opacity-90">{t('screenshot.error.captureTooLargeHint')}</p>
            </div>
            <button
              type="button"
              onClick={onDismissOversizedCapture}
              class="flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              aria-label={t('aria.close')}
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error message */}
        {uploadError && (
          <div class="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-950/50 border border-solid border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">
            <CircleAlert class="w-4.5 h-4.5 flex-shrink-0" />
            {uploadError}
          </div>
        )}
      </div>

      {/* Scrollable area: only the media grid and helper text scroll, so the
          scrollbar appears below the fixed top section, not alongside it. */}
      <div class="flex-auto min-h-0 overflow-y-auto px-6 pb-6 flex flex-col gap-4">
        {/* Drop zone / Media grid */}
        <div
          class={cn(
            'shrink-0 min-h-40 border-2 border-dashed border-border rounded bg-muted transition-colors',
            media.length === 0 && 'hover:border-primary hover:bg-primary/5',
            isDragging && 'border-primary bg-primary/5',
            media.length > 0 && 'border-solid bg-background min-h-0'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {media.length === 0 ? (
            <div
              class="flex flex-col items-center justify-center py-8 px-4 text-muted-foreground text-center cursor-pointer transition-colors hover:text-primary [&_svg]:hover:text-primary"
              onClick={handleUploadClick}
            >
              <Upload class="w-12 h-12 mb-3 text-muted-foreground transition-colors" />
              <p class="text-sm font-medium mb-1">{t('screenshot.dropzone.title')}</p>
              <span class="text-xs text-muted-foreground">{t('screenshot.dropzone.subtitle')}</span>
            </div>
          ) : (
            <div class="grid grid-cols-2 gap-3 p-3">
              {media.map((item) => (
                <div
                  key={item.id}
                  class="relative rounded overflow-hidden bg-background border border-solid border-border"
                >
                  <div class="relative aspect-video bg-gray-800">
                    <MediaPreview item={item} />
                    {/* Badges */}
                    <div class="absolute top-1.5 left-1.5 flex gap-1">
                      {item.annotated && (
                        <span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-blue-100 dark:bg-blue-900/70 text-blue-700 dark:text-blue-300">
                          {t('screenshot.badge.annotated')}
                        </span>
                      )}
                      {isVideo(item.mimeType) && (
                        <span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {t('screenshot.badge.video')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div class="flex justify-between px-2 py-1.5 text-xs text-muted-foreground border-t border-solid border-border">
                    <span>{formatTimestamp(item.timestamp)}</span>
                    {isVideo(item.mimeType) && formatVideoMeta(item) ? (
                      <span>{formatVideoMeta(item)}</span>
                    ) : item.width && item.height ? (
                      <span>
                        {item.width} x {item.height}
                      </span>
                    ) : null}
                  </div>
                  <div class="flex gap-1 px-2 py-1.5 border-t border-solid border-border bg-muted">
                    {enableAnnotation && isImage(item.mimeType) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        class="w-7 h-7 bg-background hover:bg-foreground/10 text-foreground"
                        onClick={() => onAnnotate(item.id)}
                        title={t('screenshot.action.annotate')}
                      >
                        <Pencil class="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="w-7 h-7 bg-background hover:bg-foreground/10 text-foreground"
                      onClick={() => downloadMedia(item)}
                      title={t('screenshot.action.download')}
                    >
                      <Download class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="w-7 h-7 bg-background hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 text-foreground"
                      onClick={() => onRemove(item.id)}
                      title={t('screenshot.action.remove')}
                    >
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {/* Drop more area as a grid item */}
              <div
                class="flex flex-col items-center justify-center gap-2 min-h-28 border-2 border-dashed border-border rounded bg-muted cursor-pointer transition-colors hover:border-primary hover:bg-primary/5 [&_svg]:hover:text-primary [&_span]:hover:text-primary"
                onClick={handleUploadClick}
              >
                <Plus class="w-8 h-8 text-muted-foreground transition-colors" />
                <span class="text-xs text-muted-foreground transition-colors">
                  {t('screenshot.addMore')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Helper text */}
        <p class="text-xs text-muted-foreground text-center">
          {t('screenshot.helperText', { imageSize: maxImageSizeMb, videoSize: maxVideoSizeMb })}
        </p>
      </div>
    </div>
  );
};
