import { ExternalLink } from 'lucide-react';
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
  const effectiveMaxImageUploadSizeMb =
    value.maxImageUploadSizeMb ?? globalSettings?.screenshot.maxImageUploadSizeMb ?? 10;
  const effectiveMaxVideoUploadSizeMb =
    value.maxVideoUploadSizeMb ?? globalSettings?.screenshot.maxVideoUploadSizeMb ?? 50;
  const effectiveMaxVideoUploadMbPerDay =
    value.maxVideoUploadMbPerDay ?? globalSettings?.screenshot.maxVideoUploadMbPerDay ?? 2048;

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
                  maxImageUploadSizeMb: undefined,
                  maxVideoUploadSizeMb: undefined,
                  maxVideoUploadMbPerDay: undefined,
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
            <Label htmlFor="max-screenshot-size">Max. Screenshot Size (MB)</Label>
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
            <p className="text-xs text-muted-foreground">
              Maximum allowed size for captured screenshots (1-50 MB)
            </p>
          </div>

          {/* Max Upload File Size */}
          <div className="space-y-2">
            <Label htmlFor="max-image-upload-size">Max. Image Upload Size (MB)</Label>
            <Input
              id="max-image-upload-size"
              type="number"
              min={1}
              max={50}
              value={effectiveMaxImageUploadSizeMb}
              onChange={(e) =>
                onChange({ ...value, maxImageUploadSizeMb: parseInt(e.target.value) || 10 })
              }
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum allowed size for uploaded images (1-50 MB)
            </p>
          </div>

          {/* Max Video Upload File Size */}
          <div className="space-y-2">
            <Label htmlFor="max-video-upload-size">Max. Video Upload Size (MB)</Label>
            <Input
              id="max-video-upload-size"
              type="number"
              min={1}
              max={100}
              value={effectiveMaxVideoUploadSizeMb}
              onChange={(e) =>
                onChange({ ...value, maxVideoUploadSizeMb: parseInt(e.target.value) || 50 })
              }
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum allowed size for uploaded videos (1-100 MB)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-video-upload-per-day">Daily Video Upload Limit (MB)</Label>
            <Input
              id="max-video-upload-per-day"
              type="number"
              min={0}
              max={1048576}
              value={effectiveMaxVideoUploadMbPerDay}
              onChange={(e) => {
                const parsedValue = Number.parseInt(e.target.value, 10);
                onChange({
                  ...value,
                  maxVideoUploadMbPerDay: Number.isNaN(parsedValue)
                    ? effectiveMaxVideoUploadMbPerDay
                    : parsedValue,
                });
              }}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Maximum video data accepted per project in 24 hours. Use 0 to disable the limit.
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
            <Alert className="mt-3">
              <AlertDescription className="text-sm space-y-2">
                <p>
                  <strong>Default (DOM Capture):</strong> Captures the page without requiring user
                  permission. Fast, seamless, and works for most layouts. Does not capture videos,
                  canvas, or WebGL content accurately.
                </p>
                <p>
                  <strong>Screen Capture API:</strong> Enable for websites (WordPress, Wix, etc.)
                  that load stylesheets or fonts from external domains (CDNs, Google Fonts, etc.).
                  These cross-origin resources cannot be captured automatically, resulting in
                  missing fonts and blank images. Also captures videos, canvas, and WebGL. The
                  browser will prompt the user for permission before each capture.
                </p>
                <p>
                  <a
                    href="https://docs.bugpin.io/configuration/widget#screen-capture-api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    View documentation
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </p>
              </AlertDescription>
            </Alert>
          </div>
        </>
      )}
    </div>
  );
}
