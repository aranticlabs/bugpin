import { ExternalLink } from 'lucide-react';
import { Label } from './ui/label';
import { SettingsNumberInput } from './SettingsNumberInput';
import { Switch } from './ui/switch';
import type { ScreenshotSettings, GlobalScreenshotSettings } from '@shared/types';

interface ScreenshotSettingsFormProps {
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

export function ScreenshotSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
  showCustomToggle = false,
  useCustomSettings = true,
  onCustomToggle,
}: ScreenshotSettingsFormProps) {
  const effectiveUseScreenCaptureAPI =
    value.useScreenCaptureAPI ?? globalSettings?.screenshot.useScreenCaptureAPI ?? false;
  const effectiveMaxScreenshotSize =
    value.maxScreenshotSize ?? globalSettings?.screenshot.maxScreenshotSize ?? 10;
  const effectiveMaxImageUploadSizeMb =
    value.maxImageUploadSizeMb ?? globalSettings?.screenshot.maxImageUploadSizeMb ?? 10;

  return (
    <div className="space-y-4">
      {/* Use Custom Screenshot Settings Toggle */}
      {showCustomToggle && (
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="space-y-0.5">
            <Label htmlFor="use-custom-screenshot" className="text-sm font-medium">
              Use Custom Settings
            </Label>
            <p className="text-xs text-muted-foreground">
              Enable individual screenshot settings for this project
            </p>
          </div>
          <Switch
            id="use-custom-screenshot"
            checked={useCustomSettings}
            onCheckedChange={(checked) => {
              onCustomToggle?.(checked);
              // Turning custom settings on copies the inherited values, so the project keeps
              // them even when nothing else is changed before saving.
              onChange(
                checked
                  ? {
                      ...value,
                      useScreenCaptureAPI: effectiveUseScreenCaptureAPI,
                      maxScreenshotSize: effectiveMaxScreenshotSize,
                      maxImageUploadSizeMb: effectiveMaxImageUploadSizeMb,
                    }
                  : {
                      ...value,
                      useScreenCaptureAPI: undefined,
                      maxScreenshotSize: undefined,
                      maxImageUploadSizeMb: undefined,
                    }
              );
            }}
          />
        </div>
      )}

      {/* Screenshot Settings - collapsed when custom toggle is off */}
      {(!showCustomToggle || useCustomSettings) && (
        <>
          {/* Max Screenshot Size */}
          <div className="space-y-2">
            <Label htmlFor="max-screenshot-size">Max. Screenshot Size (MB)</Label>
            <SettingsNumberInput
              id="max-screenshot-size"
              min={1}
              max={50}
              value={effectiveMaxScreenshotSize}
              onChange={(sizeMb) => onChange({ ...value, maxScreenshotSize: sizeMb })}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum allowed size for captured screenshots (1-50 MB)
            </p>
          </div>

          {/* Max Upload File Size */}
          <div className="space-y-2">
            <Label htmlFor="max-image-upload-size">Max. Image Upload Size (MB)</Label>
            <SettingsNumberInput
              id="max-image-upload-size"
              min={1}
              max={50}
              value={effectiveMaxImageUploadSizeMb}
              onChange={(sizeMb) => onChange({ ...value, maxImageUploadSizeMb: sizeMb })}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum allowed size for uploaded images (1-50 MB)
            </p>
          </div>

          {/* Screen Capture API Toggle */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="use-screen-capture-api">Use Screen Capture API</Label>
                <p className="text-xs text-muted-foreground">
                  Enable browser Screen Capture API for pixel-perfect screenshots
                </p>
              </div>
              <Switch
                id="use-screen-capture-api"
                checked={effectiveUseScreenCaptureAPI}
                onCheckedChange={(checked) => onChange({ ...value, useScreenCaptureAPI: checked })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                Enable for websites (WordPress, Wix, etc.) that load stylesheets or fonts from
                external domains (CDNs, Google Fonts, etc.). These cross-origin resources cannot be
                captured automatically, resulting in missing fonts and blank images. It also shows
                embedded videos, canvas, and WebGL content correctly in screenshots. The browser
                will prompt the user for permission before each screenshot. This setting does not
                affect screen recordings.
              </p>
              <a
                href="https://docs.bugpin.io/configuration/widget#screen-capture-api"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View documentation
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
