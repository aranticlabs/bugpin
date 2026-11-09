import { FunctionComponent } from 'preact';
import { useState, useCallback, useRef } from 'preact/hooks';
import { Camera, Pencil, Download, Trash2, Play, Pause } from 'lucide-preact';
import { cn } from '../lib/utils';
import { Button } from './ui';
import { MediaOptionToggle, MediaUploadButton, MediaCaptureFeedback } from './MediaPanelShared';
import { useLocale } from '../hooks/use-locale.js';
import { useObjectUrl } from '../hooks/use-object-url.js';
import { getLocale, t } from '../i18n/index.js';
import { getExtensionFromMimeType, type MediaData } from '../api/submit-form.js';
import { formatMediaDetails } from '@shared/media-metadata';
import type { RecordingQuality } from '@shared/recording-quality';

interface CapturedMediaBase {
  id: string;
  timestamp: Date;
  annotated: boolean;
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  recordingQuality?: RecordingQuality;
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
  reduceQuality: boolean;
  onReduceQualityChange: (value: boolean) => void;
  oversizedCapture: { sizeMb: number; limitMb: number } | null;
  onDismissOversizedCapture: () => void;
}

const DEFAULT_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function formatMediaMeta(item: CapturedMedia): string {
  return [
    item.recordingQuality && t(`recording.quality.${item.recordingQuality}`),
    formatMediaDetails({ ...item, sizeBytes: item.blob?.size }, getLocale()),
  ]
    .filter(Boolean)
    .join(' · ');
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
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const failed = source !== null && source !== undefined && failedSource === source;

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  if (failed) {
    return (
      <div
        data-testid="video-preview-fallback"
        role="status"
        class="w-full h-full flex items-center justify-center px-2 pt-8 pb-2 text-center text-gray-200"
      >
        <span class="text-xs font-medium">{t('recording.previewUnavailable')}</span>
      </div>
    );
  }

  return (
    <div class="group relative w-full h-full">
      <video
        ref={videoRef}
        class="w-full h-full object-contain"
        src={source ?? undefined}
        muted={!controls}
        controls={controls}
        playsInline
        preload="metadata"
        aria-label={t('screenshot.badge.video')}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => source && setFailedSource(source)}
      />
      {controls && (
        <button
          type="button"
          onClick={togglePlayback}
          class={cn(
            'absolute inset-0 m-auto w-10 h-10 flex items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-opacity hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            isPlaying && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          )}
          title={isPlaying ? t('recording.pause') : t('recording.play')}
          aria-label={isPlaying ? t('recording.pause') : t('recording.play')}
        >
          {isPlaying ? (
            <Pause class="w-4 h-4 fill-current" />
          ) : (
            <Play class="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>
      )}
    </div>
  );
};

const ImagePreview: FunctionComponent<{ item: CapturedMedia }> = ({ item }) => {
  const objectUrl = useObjectUrl(item.blob);
  const source = item.blob ? objectUrl : item.dataUrl;

  return (
    <img class="w-full h-full object-contain" src={source ?? undefined} alt={t('screenshot.alt')} />
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
  reduceQuality,
  onReduceQualityChange,
  oversizedCapture,
  onDismissOversizedCapture,
}) => {
  useLocale();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isImage = (mimeType: string) => mimeType.startsWith('image/');

  const maxImageSizeMb = Math.round(maxImageSize / (1024 * 1024));

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!isImage(file.type)) {
        return t('screenshot.error.unsupportedFile', { type: file.type });
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        return t('screenshot.error.unsupportedImage', { type: file.type });
      }
      if (file.size > maxImageSize) {
        return t('screenshot.error.imageTooLarge', { size: maxImageSizeMb });
      }
      return null;
    },
    [maxImageSize, maxImageSizeMb]
  );

  const processFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        setUploadError(error);
        return;
      }

      setUploadError(null);

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
        <MediaOptionToggle
          label={t('screenshot.quality.label')}
          title={t('screenshot.quality.tooltip')}
          checked={reduceQuality}
          onChange={onReduceQualityChange}
        />

        {/* Action button */}
        <div class="flex gap-2">
          <Button class="flex-1" onClick={onCapture} disabled={isCapturing}>
            <Camera class="w-4.5 h-4.5" />
            {isCapturing ? t('screenshot.capturing') : t('screenshot.capture')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        {/* Privacy notice */}
        <p class="text-xs text-muted-foreground">{t('screenshot.privacyTip')}</p>

        <MediaCaptureFeedback
          error={uploadError}
          warning={
            oversizedCapture
              ? {
                  message: t('screenshot.error.captureTooLarge', {
                    size: oversizedCapture.sizeMb,
                    limit: oversizedCapture.limitMb,
                  }),
                  hint: t('screenshot.error.captureTooLargeHint'),
                }
              : null
          }
          onDismiss={onDismissOversizedCapture}
        />
      </div>

      {/* Scrollable area: only the media grid and helper text scroll, so the
          scrollbar appears below the fixed top section, not alongside it. */}
      <div class="flex-auto min-h-0 overflow-y-auto px-6 pb-6 flex flex-col gap-4">
        {/* Drop zone / Media grid */}
        <div
          class={cn(
            'shrink-0 transition-colors',
            media.length === 0 &&
              'min-h-40 border-2 border-dashed border-border rounded bg-muted hover:border-primary hover:bg-primary/5',
            media.length > 0 && 'min-h-0',
            isDragging && 'border-2 border-dashed border-primary rounded bg-primary/5'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {media.length === 0 ? (
            <MediaUploadButton hasMedia={false} onClick={handleUploadClick} />
          ) : (
            <div class="grid grid-cols-2 gap-3">
              {media.map((item) => (
                <div
                  key={item.id}
                  class="relative rounded overflow-hidden bg-background border border-solid border-border"
                >
                  <div class="relative aspect-video bg-gray-800">
                    <ImagePreview item={item} />
                    {/* Badges */}
                    <div class="absolute top-1.5 left-1.5 flex gap-1">
                      {item.annotated && (
                        <span class="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-blue-100 dark:bg-blue-900/70 text-blue-700 dark:text-blue-300">
                          {t('screenshot.badge.annotated')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1.5 text-xs text-muted-foreground border-t border-solid border-border">
                    <span>{formatTimestamp(item.timestamp)}</span>
                    <span class="min-w-0 break-words tabular-nums">{formatMediaMeta(item)}</span>
                  </div>
                  <div class="flex gap-1 px-2 py-1.5 border-t border-solid border-border bg-muted">
                    {enableAnnotation && (
                      <Button
                        variant="ghost"
                        size="icon"
                        class="w-7 h-7 bg-background hover:bg-foreground/10 text-foreground"
                        onClick={() => onAnnotate(item.id)}
                        title={t('screenshot.action.annotate')}
                        aria-label={t('screenshot.action.annotate')}
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
                      aria-label={t('screenshot.action.download')}
                    >
                      <Download class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="w-7 h-7 bg-background hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 text-foreground"
                      onClick={() => onRemove(item.id)}
                      title={t('screenshot.action.remove')}
                      aria-label={t('screenshot.action.remove')}
                    >
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <MediaUploadButton hasMedia onClick={handleUploadClick} />
            </div>
          )}
        </div>

        {/* Helper text */}
        <p class="text-xs text-muted-foreground text-center">
          {t('screenshot.helperText', { imageSize: maxImageSizeMb })}
        </p>
      </div>
    </div>
  );
};
