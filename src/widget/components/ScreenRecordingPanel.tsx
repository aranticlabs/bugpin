import { FunctionComponent } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import { Download, Maximize2, Trash2, Video, X } from 'lucide-preact';
import { cn } from '../lib/utils.js';
import { Button } from './ui';
import { MediaOptionToggle, MediaUploadButton, MediaCaptureFeedback } from './MediaPanelShared';
import {
  downloadMedia,
  formatMediaMeta,
  VideoPreview,
  type CapturedMedia,
} from './ScreenshotManager.js';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';
import { DEFAULT_RECORDING_QUALITY, type RecordingQuality } from '@shared/recording-quality';

interface ScreenRecordingPanelProps {
  clips: CapturedMedia[];
  recordingEnabled: boolean;
  recordingQuality?: RecordingQuality;
  onRecord: () => void;
  onUpload: (item: CapturedMedia) => void;
  onRemove: (id: string) => void;
  isStarting: boolean;
  maxVideoSize?: number;
  allowMicrophone: boolean;
  includeMicrophone: boolean;
  onIncludeMicrophoneChange: (value: boolean) => void;
  oversizedRecording: { sizeMb: number; limitMb: number } | null;
  onDismissOversizedRecording?: () => void;
}

const DEFAULT_MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export const ScreenRecordingPanel: FunctionComponent<ScreenRecordingPanelProps> = ({
  clips,
  recordingEnabled,
  recordingQuality = DEFAULT_RECORDING_QUALITY,
  onRecord,
  onUpload,
  onRemove,
  isStarting,
  maxVideoSize = DEFAULT_MAX_VIDEO_SIZE,
  allowMicrophone,
  includeMicrophone,
  onIncludeMicrophoneChange,
  oversizedRecording,
  onDismissOversizedRecording,
}) => {
  useLocale();
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const expandedClip = clips.find((clip) => clip.id === expandedClipId);
  const maxVideoSizeMb = Math.round(maxVideoSize / (1024 * 1024));
  const formatTimestamp = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const processFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        setUploadError(t('screenshot.error.unsupportedVideo', { type: file.type }));
        return;
      }
      if (file.size > maxVideoSize) {
        setUploadError(t('screenshot.error.videoTooLarge', { size: maxVideoSizeMb }));
        return;
      }

      setUploadError(null);
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);
      let settled = false;
      const upload = (
        metadata: Partial<Pick<CapturedMedia, 'width' | 'height' | 'durationMs'>>
      ) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(objectUrl);
        onUpload({
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          blob: file,
          timestamp: new Date(),
          annotated: false,
          mimeType: file.type,
          ...metadata,
        });
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
    },
    [maxVideoSize, maxVideoSizeMb, onUpload]
  );

  const processFiles = useCallback(
    (files: FileList | null | undefined) => {
      if (!files) return;
      for (let index = 0; index < files.length; index++) processFile(files[index]);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);
      processFiles(event.dataTransfer?.files);
    },
    [processFiles]
  );

  return (
    <div class="flex-auto min-h-0 flex flex-col">
      {(recordingEnabled || oversizedRecording || uploadError) && (
        <div class="shrink-0 flex flex-col gap-4 px-6 pt-6 pb-4">
          {recordingEnabled && (
            <>
              {allowMicrophone && (
                <MediaOptionToggle
                  label={t('recording.microphone')}
                  checked={includeMicrophone}
                  onChange={onIncludeMicrophoneChange}
                />
              )}

              <div class="flex gap-2">
                <Button class="flex-1" onClick={onRecord} disabled={isStarting}>
                  <Video class="w-4.5 h-4.5" />
                  {t('recording.start')}
                </Button>
              </div>

              <p class="text-xs text-muted-foreground">
                {t('recording.quality.setting', {
                  quality: t(`recording.quality.${recordingQuality}`),
                })}
              </p>
              <p class="text-xs text-muted-foreground">{t('recording.privacyTip')}</p>
            </>
          )}
          <MediaCaptureFeedback
            error={uploadError}
            warning={
              oversizedRecording
                ? {
                    message: t('recording.oversized', {
                      size: oversizedRecording.sizeMb,
                      limit: oversizedRecording.limitMb,
                    }),
                    hint: t('recording.oversizedHint'),
                  }
                : null
            }
            onDismiss={onDismissOversizedRecording}
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        multiple
        class="hidden"
        onChange={(event) => {
          const input = event.target as HTMLInputElement;
          processFiles(input.files);
          input.value = '';
        }}
      />

      <div
        class={cn(
          'flex-auto min-h-0 overflow-y-auto px-6 pb-6 flex flex-col gap-4',
          !recordingEnabled && !oversizedRecording && !uploadError && 'pt-6'
        )}
      >
        <div
          class={cn(
            'shrink-0 transition-colors',
            clips.length === 0 &&
              'min-h-40 border-2 border-dashed border-border rounded bg-muted hover:border-primary hover:bg-primary/5',
            clips.length > 0 && 'min-h-0',
            isDragging && 'border-2 border-dashed border-primary rounded bg-primary/5'
          )}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          {clips.length === 0 ? (
            <MediaUploadButton hasMedia={false} onClick={() => fileInputRef.current?.click()} />
          ) : (
            <ul class="grid grid-cols-2 gap-3 list-none m-0">
              {clips.map((clip) => (
                <li
                  key={clip.id}
                  class="relative overflow-hidden border border-solid border-border rounded bg-background"
                >
                  <div class="relative aspect-video bg-gray-800">
                    <VideoPreview item={clip} controls />
                    <span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 pointer-events-none">
                      {t('screenshot.badge.video')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="absolute top-1.5 right-1.5 z-10 w-7 h-7 bg-black/60 text-white hover:bg-black/80 hover:text-white"
                      onClick={() => setExpandedClipId(clip.id)}
                      title={t('recording.expand')}
                      aria-label={t('recording.expand')}
                    >
                      <Maximize2 class="w-4 h-4" />
                    </Button>
                  </div>
                  <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1.5 text-xs text-muted-foreground border-t border-solid border-border">
                    <span>{formatTimestamp(clip.timestamp)}</span>
                    <span class="min-w-0 break-words tabular-nums">{formatMediaMeta(clip)}</span>
                  </div>
                  <div class="flex gap-1 px-2 py-1.5 border-t border-solid border-border bg-muted">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="w-7 h-7 bg-background hover:bg-foreground/10 text-foreground"
                      onClick={() => downloadMedia(clip)}
                      title={t('screenshot.action.download')}
                      aria-label={t('screenshot.action.download')}
                    >
                      <Download class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="w-7 h-7 bg-background hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 text-foreground"
                      onClick={() => onRemove(clip.id)}
                      title={t('screenshot.action.remove')}
                      aria-label={t('screenshot.action.remove')}
                    >
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
              <li>
                <MediaUploadButton hasMedia onClick={() => fileInputRef.current?.click()} />
              </li>
            </ul>
          )}
        </div>

        <p class="text-xs text-muted-foreground text-center">
          {t('recording.helperText', { videoSize: maxVideoSizeMb })}
        </p>
      </div>

      {expandedClip && (
        <div
          data-testid="recording-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={t('recording.expand')}
          class="fixed inset-0 z-[2147483647] flex items-center justify-center p-6 bg-black/90"
          onClick={() => setExpandedClipId(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setExpandedClipId(null);
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            class="absolute top-4 right-4 w-10 h-10 text-white hover:bg-white/15 hover:text-white"
            onClick={() => setExpandedClipId(null)}
            aria-label={t('aria.close')}
            autoFocus
          >
            <X class="w-6 h-6" />
          </Button>
          <div
            class="w-[calc(100vw-3rem)] h-[calc(100vh-6rem)] overflow-hidden rounded-lg bg-black shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <VideoPreview item={expandedClip} controls />
          </div>
        </div>
      )}
    </div>
  );
};
