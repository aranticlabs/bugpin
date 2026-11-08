import { ExternalLink, Info } from 'lucide-react';
import {
  DEFAULT_RECORDING_QUALITY,
  estimateRecordingSizeMb,
  RECORDING_QUALITIES,
  RECORDING_QUALITY_PRESETS,
  type RecordingQuality,
} from '@shared/recording-quality';
import { cn } from '../lib/utils';
import { Alert, AlertDescription } from './ui/alert';
import { Switch } from './ui/switch';
import { SettingRow, SettingRows } from './ui/setting-row';
import { SettingsNumberInput } from './SettingsNumberInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { ScreenshotSettings, GlobalScreenshotSettings } from '@shared/types';

const QUALITY_NAMES: Record<RecordingQuality, string> = {
  low: 'Low',
  standard: 'Standard',
  high: 'High',
};

function qualityLabel(quality: RecordingQuality): string {
  const { height, frameRate } = RECORDING_QUALITY_PRESETS[quality];
  const sizePerMinute = Math.round(estimateRecordingSizeMb(quality, 60));
  return `${QUALITY_NAMES[quality]} (${height}p, ${frameRate} fps, about ${sizePerMinute} MB per minute)`;
}

interface RecordingSettingsFormProps {
  value: ScreenshotSettings;
  onChange: (value: ScreenshotSettings) => void;
  globalSettings?: {
    screenshot: GlobalScreenshotSettings;
  };
  disabled?: boolean;
}

export function resolveRecordingSettings(
  value: ScreenshotSettings,
  globalSettings?: { screenshot: GlobalScreenshotSettings }
) {
  const global = globalSettings?.screenshot;
  return {
    maxVideoUploadSizeMb: value.maxVideoUploadSizeMb ?? global?.maxVideoUploadSizeMb ?? 50,
    maxVideoUploadMbPerDay: value.maxVideoUploadMbPerDay ?? global?.maxVideoUploadMbPerDay ?? 2048,
    enableScreenRecording: value.enableScreenRecording ?? global?.enableScreenRecording ?? false,
    allowRecordingMicrophone:
      value.allowRecordingMicrophone ?? global?.allowRecordingMicrophone ?? false,
    maxRecordingDurationSeconds:
      value.maxRecordingDurationSeconds ?? global?.maxRecordingDurationSeconds ?? 180,
    recordingQuality:
      value.recordingQuality ?? global?.recordingQuality ?? DEFAULT_RECORDING_QUALITY,
  };
}

export function RecordingSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
}: RecordingSettingsFormProps) {
  const effective = resolveRecordingSettings(value, globalSettings);
  const recordingOff = !effective.enableScreenRecording;
  const fieldsDisabled = disabled || recordingOff;
  const dimmed = recordingOff && 'section-disabled';

  const estimatedSizeMb = Math.round(
    estimateRecordingSizeMb(effective.recordingQuality, effective.maxRecordingDurationSeconds)
  );

  return (
    <div className="space-y-4">
      <SettingRows>
        <SettingRow
          label="Enable Screen Recording"
          htmlFor="enable-screen-recording"
          description="Let reporters record and attach their screen from the widget."
        >
          <Switch
            id="enable-screen-recording"
            checked={effective.enableScreenRecording}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                enableScreenRecording: checked,
                ...(checked ? {} : { allowRecordingMicrophone: false }),
              })
            }
            disabled={disabled}
          />
        </SettingRow>

        <SettingRow
          label="Video Quality"
          htmlFor="recording-quality"
          description="Higher quality is sharper and smoother, but creates larger files."
          className={cn(dimmed)}
          controlClassName="@sm:w-96"
        >
          <Select
            value={effective.recordingQuality}
            onValueChange={(quality) =>
              onChange({ ...value, recordingQuality: quality as RecordingQuality })
            }
            disabled={fieldsDisabled}
          >
            <SelectTrigger id="recording-quality" className="w-full">
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
        </SettingRow>

        <SettingRow
          label="Maximum Recording Duration"
          htmlFor="max-recording-duration"
          description="Recordings stop after this many seconds. Between 10 and 600 seconds."
          className={cn(dimmed)}
          controlClassName="@sm:w-28"
        >
          <SettingsNumberInput
            id="max-recording-duration"
            min={10}
            max={600}
            value={effective.maxRecordingDurationSeconds}
            onChange={(seconds) => onChange({ ...value, maxRecordingDurationSeconds: seconds })}
            disabled={fieldsDisabled}
          />
        </SettingRow>
        <SettingRow
          label="Allow Microphone Recording"
          htmlFor="allow-recording-microphone"
          description="Reporters still choose for each recording."
          className={cn(dimmed)}
        >
          <Switch
            id="allow-recording-microphone"
            checked={effective.allowRecordingMicrophone}
            onCheckedChange={(checked) => onChange({ ...value, allowRecordingMicrophone: checked })}
            disabled={fieldsDisabled}
          />
        </SettingRow>

        <SettingRow
          label="Maximum Video Upload Size"
          htmlFor="max-video-upload-size"
          description="Per video. Between 1 and 100 MB."
          className={cn(dimmed)}
          controlClassName="@sm:w-28"
        >
          <SettingsNumberInput
            id="max-video-upload-size"
            min={1}
            max={100}
            value={effective.maxVideoUploadSizeMb}
            onChange={(sizeMb) => onChange({ ...value, maxVideoUploadSizeMb: sizeMb })}
            disabled={fieldsDisabled}
          />
        </SettingRow>
        <SettingRow
          label="Daily Video Upload Limit"
          htmlFor="max-video-upload-per-day"
          description="MB per project in 24 hours. 0 disables the limit."
          className={cn(dimmed)}
          controlClassName="@sm:w-28"
        >
          <SettingsNumberInput
            id="max-video-upload-per-day"
            min={0}
            max={1048576}
            value={effective.maxVideoUploadMbPerDay}
            onChange={(limitMb) => onChange({ ...value, maxVideoUploadMbPerDay: limitMb })}
            disabled={fieldsDisabled}
          />
        </SettingRow>
      </SettingRows>

      {effective.enableScreenRecording && estimatedSizeMb > effective.maxVideoUploadSizeMb && (
        <p className="text-xs text-warning">
          A full-length recording at this quality is about {estimatedSizeMb} MB, above the{' '}
          {effective.maxVideoUploadSizeMb} MB upload limit. Recordings stop early when they reach
          the limit.
        </p>
      )}

      <Alert
        aria-disabled={recordingOff || undefined}
        inert={recordingOff}
        className={cn('border-primary/20 bg-primary/10', recordingOff && 'section-disabled')}
      >
        <Info className="h-4 w-4" />
        <AlertDescription>
          Your reverse proxy must accept uploads up to the configured video size and allow enough
          time for slower uploads.{' '}
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
  );
}
