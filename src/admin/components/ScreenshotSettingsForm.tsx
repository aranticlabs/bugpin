import { Label } from './ui/label';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Alert, AlertDescription } from './ui/alert';
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
              if (!checked) {
                // Reset to undefined when switching to global defaults
                onChange({
                  useScreenCaptureAPI: undefined,
                  maxScreenshotSize: undefined,
                });
              }
            }}
          />
        </div>
      )}

      {/* Screenshot Settings - collapsed when custom toggle is off */}
      {(!showCustomToggle || useCustomSettings) && (
        <>
          {/* Max Screenshot Size */}
          <div className="space-y-2">
            <Label htmlFor="max-screenshot-size">Max Screenshot Size (MB)</Label>
            <Input
              id="max-screenshot-size"
              type="number"
              min={1}
              max={50}
              value={effectiveMaxScreenshotSize}
              onChange={(e) =>
                onChange({ ...value, maxScreenshotSize: parseInt(e.target.value) || 10 })
              }
              disabled={disabled}
            />
            <p className="text-sm text-muted-foreground">
              Maximum allowed size for uploaded screenshots (1-50 MB)
            </p>
          </div>

          {/* Screen Capture API Toggle */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="use-screen-capture-api" className="text-base">
                  Use Screen Capture API
                </Label>
                <p className="text-sm text-muted-foreground">
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
            <Alert className="mt-3">
              <AlertDescription className="text-sm space-y-2">
                <p>
                  <strong>Default (DOM Capture):</strong> Automatically captures your app UI without
                  user permission. Fast, privacy-friendly, and works for most layout bugs. Does not
                  capture videos, canvas, or WebGL content accurately.
                </p>
                <p>
                  <strong>Screen Capture API:</strong> Requires user permission to select which
                  tab/window to capture. Provides pixel-perfect screenshots including videos,
                  canvas, WebGL, and exactly what the user sees. Higher friction but more accurate
                  for complex visual bugs.
                </p>
              </AlertDescription>
            </Alert>
            <Alert className="mt-3">
              <AlertDescription className="text-sm space-y-2">
                <p>
                  <strong>Recommended:</strong> Keep disabled for general use. Enable only if you
                  need to capture video players, canvas graphics, or other dynamic content that
                  doesn't render correctly with DOM capture.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        </>
      )}
    </div>
  );
}
