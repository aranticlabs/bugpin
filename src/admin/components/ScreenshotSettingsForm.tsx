import { ExternalLink } from 'lucide-react';
import { SettingsNumberInput } from './SettingsNumberInput';
import { Switch } from './ui/switch';
import { SettingRow, SettingRowPair, SettingRows } from './ui/setting-row';
import type { ScreenshotSettings, GlobalScreenshotSettings } from '@shared/types';

interface ScreenshotSettingsFormProps {
  value: ScreenshotSettings;
  onChange: (value: ScreenshotSettings) => void;
  globalSettings?: {
    screenshot: GlobalScreenshotSettings;
  };
  disabled?: boolean;
}

export function resolveScreenshotSettings(
  value: ScreenshotSettings,
  globalSettings?: { screenshot: GlobalScreenshotSettings }
) {
  return {
    useScreenCaptureAPI:
      value.useScreenCaptureAPI ?? globalSettings?.screenshot.useScreenCaptureAPI ?? false,
    maxScreenshotSize:
      value.maxScreenshotSize ?? globalSettings?.screenshot.maxScreenshotSize ?? 10,
    maxImageUploadSizeMb:
      value.maxImageUploadSizeMb ?? globalSettings?.screenshot.maxImageUploadSizeMb ?? 10,
  };
}

export function ScreenshotSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
}: ScreenshotSettingsFormProps) {
  const effective = resolveScreenshotSettings(value, globalSettings);

  return (
    <SettingRows>
      <SettingRowPair>
        <SettingRow
          label="Max. Screenshot Size (MB)"
          htmlFor="max-screenshot-size"
          description="1 to 50 MB per captured screenshot."
          controlClassName="@sm:w-28"
        >
          <SettingsNumberInput
            id="max-screenshot-size"
            min={1}
            max={50}
            value={effective.maxScreenshotSize}
            onChange={(sizeMb) => onChange({ ...value, maxScreenshotSize: sizeMb })}
            disabled={disabled}
          />
        </SettingRow>
        <SettingRow
          label="Max. Image Upload Size (MB)"
          htmlFor="max-image-upload-size"
          description="1 to 50 MB per uploaded image."
          controlClassName="@sm:w-28"
        >
          <SettingsNumberInput
            id="max-image-upload-size"
            min={1}
            max={50}
            value={effective.maxImageUploadSizeMb}
            onChange={(sizeMb) => onChange({ ...value, maxImageUploadSizeMb: sizeMb })}
            disabled={disabled}
          />
        </SettingRow>
      </SettingRowPair>
      <SettingRow
        label="Use Screen Capture API"
        htmlFor="use-screen-capture-api"
        description={
          <>
            Pixel-perfect screenshots for sites that load fonts or stylesheets from other domains
            (CDNs, Google Fonts, WordPress, Wix), including embedded videos, canvas and WebGL. The
            browser asks the reporter for permission before each screenshot. Screen recordings are
            not affected.{' '}
            <a
              href="https://docs.bugpin.io/configuration/widget#screen-capture-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              View documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        }
      >
        <Switch
          id="use-screen-capture-api"
          checked={effective.useScreenCaptureAPI}
          onCheckedChange={(checked) => onChange({ ...value, useScreenCaptureAPI: checked })}
          disabled={disabled}
        />
      </SettingRow>
    </SettingRows>
  );
}
