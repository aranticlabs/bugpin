import { FunctionComponent } from 'preact';
import { Download, Trash2, TriangleAlert, Video, X } from 'lucide-preact';
import { Button } from './ui';
import { formatDuration } from './RecordingBar.js';
import { downloadMedia, type CapturedMedia } from './ScreenshotManager.js';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

const BYTES_PER_MB = 1024 * 1024;

interface ScreenRecordingPanelProps {
  clips: CapturedMedia[];
  onRecord: () => void;
  onRemove: (id: string) => void;
  isStarting: boolean;
  allowMicrophone: boolean;
  includeMicrophone: boolean;
  onIncludeMicrophoneChange: (value: boolean) => void;
  oversizedRecording: { sizeMb: number; limitMb: number } | null;
  onDismissOversizedRecording: () => void;
}

export const ScreenRecordingPanel: FunctionComponent<ScreenRecordingPanelProps> = ({
  clips,
  onRecord,
  onRemove,
  isStarting,
  allowMicrophone,
  includeMicrophone,
  onIncludeMicrophoneChange,
  oversizedRecording,
  onDismissOversizedRecording,
}) => {
  useLocale();

  return (
    <div class="flex-auto min-h-0 overflow-y-auto p-6 flex flex-col gap-4">
      {oversizedRecording && (
        <div
          role="alert"
          class="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-solid border-amber-200 dark:border-amber-800/60 rounded text-amber-800 dark:text-amber-200 text-xs"
        >
          <TriangleAlert class="w-4 h-4 flex-shrink-0 mt-px" />
          <div class="flex-1 leading-relaxed">
            <p class="font-medium">
              {t('recording.oversized', {
                size: oversizedRecording.sizeMb,
                limit: oversizedRecording.limitMb,
              })}
            </p>
            <p>{t('recording.oversizedHint')}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="w-6 h-6"
            onClick={onDismissOversizedRecording}
            aria-label={t('aria.close')}
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
      )}

      <div class="flex flex-col items-center gap-3">
        <Button onClick={onRecord} disabled={isStarting}>
          <Video class="w-4 h-4" />
          {t('recording.start')}
        </Button>
        {allowMicrophone && (
          <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeMicrophone}
              onChange={(e) => onIncludeMicrophoneChange((e.target as HTMLInputElement).checked)}
              class="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            {t('recording.microphone')}
          </label>
        )}
        <p class="text-xs text-muted-foreground text-center">{t('recording.privacyTip')}</p>
      </div>

      {clips.length > 0 && (
        <ul class="flex flex-col gap-2 list-none m-0 p-0">
          {clips.map((clip) => (
            <li
              key={clip.id}
              class="flex items-center gap-3 px-3 py-2 border border-solid border-border rounded"
            >
              <Video class="w-4 h-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="flex-1 text-sm tabular-nums">
                {formatDuration(clip.durationMs ?? 0)}
                {clip.blob && ` · ${Math.max(clip.blob.size / BYTES_PER_MB, 0.1).toFixed(1)} MB`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => downloadMedia(clip)}
                title={t('screenshot.action.download')}
                aria-label={t('screenshot.action.download')}
              >
                <Download class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(clip.id)}
                title={t('screenshot.action.remove')}
                aria-label={t('screenshot.action.remove')}
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
