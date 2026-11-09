import { ExternalLink, Info } from 'lucide-react';
import {
  DEFAULT_RECORDING_QUALITY,
  estimateRecordingSizeMb,
  RECORDING_QUALITIES,
  RECORDING_QUALITY_PRESETS,
  RECORDING_QUALITY_LABELS,
  type RecordingQuality,
} from '@shared/recording-quality';
import { cn } from '../lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { SettingsNumberInput } from './SettingsNumberInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { ScreenshotSettings, GlobalScreenshotSettings } from '@shared/types';

function qualityLabel(quality: RecordingQuality): string {
  const { height, frameRate } = RECORDING_QUALITY_PRESETS[quality];
  const sizePerMinute = Math.round(estimateRecordingSizeMb(quality, 60));
  return `${RECORDING_QUALITY_LABELS[quality]} (${height}p, ${frameRate} fps, about ${sizePerMinute} MB per minute)`;
}

interface RecordingSettingsFormProps {
  value: ScreenshotSettings;
  onChange: (value: ScreenshotSettings) => void;
  globalSettings?: {
    screenshot: GlobalScreenshotSettings;
  };
  disabled?: boolean;
  showCustomToggle?: boolean;
  useCustomSettings?: boolean;
  onCustomToggle?: (enabled: boolean) => void;
}

export function RecordingSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
  showCustomToggle = false,
  useCustomSettings = true,
  onCustomToggle,
}: RecordingSettingsFormProps) {
  const effectiveMaxVideoUploadSizeMb =
    value.maxVideoUploadSizeMb ?? globalSettings?.screenshot.maxVideoUploadSizeMb ?? 50;
  const effectiveMaxVideoUploadMbPerDay =
    value.maxVideoUploadMbPerDay ?? globalSettings?.screenshot.maxVideoUploadMbPerDay ?? 2048;
  const effectiveEnableScreenRecording =
    value.enableScreenRecording ?? globalSettings?.screenshot.enableScreenRecording ?? false;
  const effectiveAllowRecordingMicrophone =
    value.allowRecordingMicrophone ?? globalSettings?.screenshot.allowRecordingMicrophone ?? false;
  const effectiveMaxRecordingDurationSeconds =
    value.maxRecordingDurationSeconds ??
    globalSettings?.screenshot.maxRecordingDurationSeconds ??
    180;
  const effectiveRecordingQuality =
    value.recordingQuality ??
    globalSettings?.screenshot.recordingQuality ??
    DEFAULT_RECORDING_QUALITY;

  const fieldsDisabled = disabled || !effectiveEnableScreenRecording;

  const estimatedSizeMb = Math.round(
    estimateRecordingSizeMb(effectiveRecordingQuality, effectiveMaxRecordingDurationSeconds)
  );

  return (
    <div className="space-y-4">
      {showCustomToggle && (
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="space-y-0.5">
            <Label htmlFor="use-custom-recording" className="text-sm font-medium">
              Use Custom Settings
            </Label>
            <p className="text-xs text-muted-foreground">
              Enable individual recording settings for this project
            </p>
          </div>
          <Switch
            id="use-custom-recording"
            checked={useCustomSettings}
            onCheckedChange={(checked) => {
              onCustomToggle?.(checked);
              // Turning custom settings on copies the inherited values, so the project keeps
              // them even when nothing else is changed before saving.
              onChange(
                checked
                  ? {
                      maxVideoUploadSizeMb: effectiveMaxVideoUploadSizeMb,
                      maxVideoUploadMbPerDay: effectiveMaxVideoUploadMbPerDay,
                      enableScreenRecording: effectiveEnableScreenRecording,
                      allowRecordingMicrophone: effectiveAllowRecordingMicrophone,
                      maxRecordingDurationSeconds: effectiveMaxRecordingDurationSeconds,
                      recordingQuality: effectiveRecordingQuality,
                    }
                  : {
                      maxVideoUploadSizeMb: undefined,
                      maxVideoUploadMbPerDay: undefined,
                      enableScreenRecording: undefined,
                      allowRecordingMicrophone: undefined,
                      maxRecordingDurationSeconds: undefined,
                      recordingQuality: undefined,
                    }
              );
            }}
          />
        </div>
      )}

      {(!showCustomToggle || useCustomSettings) && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="enable-screen-recording">Enable Screen Recording</Label>
                <p className="text-xs text-muted-foreground">
                  Let reporters record and attach their screen from the widget
                </p>
              </div>
              <Switch
                id="enable-screen-recording"
                checked={effectiveEnableScreenRecording}
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    enableScreenRecording: checked,
                    ...(checked ? {} : { allowRecordingMicrophone: false }),
                  })
                }
                disabled={disabled}
              />
            </div>

            <div
              className={cn(
                'space-y-4',
                !effectiveEnableScreenRecording && '[&_label]:opacity-50 [&_p]:opacity-50'
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="recording-quality">Video Quality</Label>
                <Select
                  value={effectiveRecordingQuality}
                  onValueChange={(quality) =>
                    onChange({ ...value, recordingQuality: quality as RecordingQuality })
                  }
                  disabled={fieldsDisabled}
                >
                  <SelectTrigger id="recording-quality">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORDING_QUALITIES.map((quality) => (
                      <SelectItem key={quality} value={quality}>
                        {qualityLabel(quality)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Higher quality is sharper and smoother, but creates larger files.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-recording-duration">Max. Recording Duration (seconds)</Label>
                <SettingsNumberInput
                  id="max-recording-duration"
                  min={10}
                  max={600}
                  value={effectiveMaxRecordingDurationSeconds}
                  onChange={(seconds) =>
                    onChange({ ...value, maxRecordingDurationSeconds: seconds })
                  }
                  disabled={fieldsDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Recording stops automatically after 10 to 600 seconds.
                </p>
              </div>

              {effectiveEnableScreenRecording &&
                estimatedSizeMb > effectiveMaxVideoUploadSizeMb && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    A full-length recording at this quality is about {estimatedSizeMb} MB, above the{' '}
                    {effectiveMaxVideoUploadSizeMb} MB upload limit. Recordings stop early when they
                    reach the limit.
                  </p>
                )}
            </div>

            {/* Video limits also apply to uploaded video files, so they stay editable when recording is off. */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="max-video-upload-size">Max. Video Upload Size (MB)</Label>
                <SettingsNumberInput
                  id="max-video-upload-size"
                  min={1}
                  max={100}
                  value={effectiveMaxVideoUploadSizeMb}
                  onChange={(sizeMb) => onChange({ ...value, maxVideoUploadSizeMb: sizeMb })}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum allowed size for uploaded videos (1-100 MB)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-video-upload-per-day">Daily Video Upload Limit (MB)</Label>
                <SettingsNumberInput
                  id="max-video-upload-per-day"
                  min={0}
                  max={1048576}
                  value={effectiveMaxVideoUploadMbPerDay}
                  onChange={(limitMb) => onChange({ ...value, maxVideoUploadMbPerDay: limitMb })}
                  disabled={disabled}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum video data accepted per project in 24 hours. Use 0 to disable the limit.
                </p>
              </div>
            </div>

            <div
              className={cn(
                'space-y-4',
                !effectiveEnableScreenRecording && '[&_label]:opacity-50 [&_p]:opacity-50'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-4">
                  <Label htmlFor="allow-recording-microphone">Allow Microphone Recording</Label>
                  <p className="text-xs text-muted-foreground">
                    Reporters still choose whether to include their microphone for each recording.
                  </p>
                </div>
                <Switch
                  id="allow-recording-microphone"
                  checked={effectiveAllowRecordingMicrophone}
                  onCheckedChange={(checked) =>
                    onChange({ ...value, allowRecordingMicrophone: checked })
                  }
                  disabled={fieldsDisabled}
                />
              </div>
            </div>

            <Alert className="border-primary/20 bg-primary/10">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Your reverse proxy must accept uploads up to the configured video size and allow
                enough time for slower uploads.{' '}
                <a
                  href="https://docs.bugpin.io/installation/reverse-proxy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Reverse proxy guide <ExternalLink className="h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>
          </div>
        </>
      )}
    </div>
  );
}
