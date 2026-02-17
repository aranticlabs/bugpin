import { useState } from 'react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ThemeColorPicker } from './ThemeColorPicker';
import { Bug, MessageSquare, AlertCircle } from 'lucide-react';
import type {
  GlobalWidgetLauncherButtonSettings,
  WidgetLauncherButtonSettings,
} from '@shared/types';

// Available icons for the button
const AVAILABLE_ICONS = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'message-square', label: 'Message', icon: MessageSquare },
  { value: 'alert-circle', label: 'Alert', icon: AlertCircle },
] as const;

function LauncherPreview({
  buttonText,
  buttonShape,
  buttonIcon,
  buttonIconSize,
  buttonIconStroke,
  theme,
  lightButtonColor,
  lightTextColor,
  lightButtonHoverColor,
  lightTextHoverColor,
  darkButtonColor,
  darkTextColor,
  darkButtonHoverColor,
  darkTextHoverColor,
  enableHoverScaleEffect,
  tooltipEnabled,
  tooltipText,
}: GlobalWidgetLauncherButtonSettings) {
  const [isHovered, setIsHovered] = useState(false);

  // For preview, we'll use light mode by default (you can add theme detection if needed)
  const isDarkMode = theme === 'dark';

  // Select colors based on theme and hover state
  const buttonColor = isDarkMode
    ? isHovered
      ? darkButtonHoverColor
      : darkButtonColor
    : isHovered
      ? lightButtonHoverColor
      : lightButtonColor;

  const textColor = isDarkMode
    ? isHovered
      ? darkTextHoverColor
      : darkTextColor
    : isHovered
      ? lightTextHoverColor
      : lightTextColor;

  // Tooltip uses base button color (non-hover), matching the real widget behavior
  const tooltipBgColor = isDarkMode ? darkButtonColor : lightButtonColor;
  const tooltipTextColor = isDarkMode ? darkTextColor : lightTextColor;

  const borderRadius = buttonShape === 'round' ? '50%' : '8px';
  const padding = buttonShape === 'round' ? `${buttonIconSize / 2}px` : '12px 20px';

  // Get the icon component
  const IconComponent = AVAILABLE_ICONS.find((i) => i.value === buttonIcon)?.icon;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 border-none cursor-pointer font-medium shadow-lg transition-colors duration-200"
        style={{
          backgroundColor: buttonColor,
          color: textColor,
          borderRadius: borderRadius,
          padding: padding,
          fontSize: '14px',
          fontWeight: 500,
          transform: isHovered && enableHoverScaleEffect ? 'scale(1.1)' : 'scale(1)',
          transition: enableHoverScaleEffect
            ? 'background-color 0.2s ease, color 0.2s ease, transform 0.3s ease, box-shadow 0.3s ease'
            : 'background-color 0.2s ease, color 0.2s ease',
          boxShadow:
            isHovered && enableHoverScaleEffect
              ? '0 8px 20px rgba(0, 0, 0, 0.25)'
              : '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => e.preventDefault()}
      >
        {IconComponent && <IconComponent size={buttonIconSize} strokeWidth={buttonIconStroke} />}
        {buttonText && <span>{buttonText}</span>}
      </button>

      {/* Tooltip */}
      {tooltipEnabled && tooltipText && isHovered && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 text-xs rounded shadow pointer-events-none whitespace-nowrap"
          style={{
            backgroundColor: tooltipBgColor,
            color: tooltipTextColor,
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          {tooltipText}
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent"
            style={{
              borderTopColor: tooltipBgColor,
              width: 0,
              height: 0,
            }}
          />
        </div>
      )}
    </div>
  );
}

interface ButtonSettingsFormProps {
  value: WidgetLauncherButtonSettings;
  onChange: (value: WidgetLauncherButtonSettings) => void;
  globalSettings?: {
    widgetLauncherButton: GlobalWidgetLauncherButtonSettings;
  };
  disabled?: boolean;
  showCustomToggle?: boolean;
  useCustomSettings?: boolean;
  onCustomToggle?: (enabled: boolean) => void;
  useTabs?: boolean;
}

export function WidgetLauncherButtonSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
  showCustomToggle = false,
  useCustomSettings = true,
  onCustomToggle,
  useTabs = false,
}: ButtonSettingsFormProps) {
  const effectivePosition =
    value.position ?? globalSettings?.widgetLauncherButton.position ?? 'bottom-right';
  const effectiveButtonText =
    value.buttonText !== undefined
      ? value.buttonText
      : (globalSettings?.widgetLauncherButton.buttonText ?? null);
  const effectiveButtonShape =
    value.buttonShape ?? globalSettings?.widgetLauncherButton.buttonShape ?? 'rectangle';
  const effectiveButtonIcon =
    value.buttonIcon !== undefined
      ? value.buttonIcon
      : (globalSettings?.widgetLauncherButton.buttonIcon ?? null);
  const effectiveButtonIconSize =
    value.buttonIconSize ?? globalSettings?.widgetLauncherButton.buttonIconSize ?? 18;
  const effectiveButtonIconStroke =
    value.buttonIconStroke ?? globalSettings?.widgetLauncherButton.buttonIconStroke ?? 2;
  const effectiveTheme = value.theme ?? globalSettings?.widgetLauncherButton.theme ?? 'auto';
  const effectiveEnableHoverScaleEffect =
    value.enableHoverScaleEffect ??
    globalSettings?.widgetLauncherButton.enableHoverScaleEffect ??
    true;
  const effectiveTooltipEnabled =
    value.tooltipEnabled ?? globalSettings?.widgetLauncherButton.tooltipEnabled ?? false;
  const effectiveTooltipText =
    value.tooltipText !== undefined
      ? value.tooltipText
      : (globalSettings?.widgetLauncherButton.tooltipText ?? null);

  // Light mode colors
  const effectiveLightButtonColor =
    value.lightButtonColor ?? globalSettings?.widgetLauncherButton.lightButtonColor ?? '#02658D';
  const effectiveLightTextColor =
    value.lightTextColor ?? globalSettings?.widgetLauncherButton.lightTextColor ?? '#ffffff';
  const effectiveLightButtonHoverColor =
    value.lightButtonHoverColor ??
    globalSettings?.widgetLauncherButton.lightButtonHoverColor ??
    '#024F6F';
  const effectiveLightTextHoverColor =
    value.lightTextHoverColor ??
    globalSettings?.widgetLauncherButton.lightTextHoverColor ??
    '#ffffff';

  // Dark mode colors
  const effectiveDarkButtonColor =
    value.darkButtonColor ?? globalSettings?.widgetLauncherButton.darkButtonColor ?? '#02658D';
  const effectiveDarkTextColor =
    value.darkTextColor ?? globalSettings?.widgetLauncherButton.darkTextColor ?? '#ffffff';
  const effectiveDarkButtonHoverColor =
    value.darkButtonHoverColor ??
    globalSettings?.widgetLauncherButton.darkButtonHoverColor ??
    '#036F9B';
  const effectiveDarkTextHoverColor =
    value.darkTextHoverColor ??
    globalSettings?.widgetLauncherButton.darkTextHoverColor ??
    '#ffffff';

  // Custom Toggle Section
  const customToggleSection = showCustomToggle && (
    <div className="flex items-center justify-between pb-3 border-b">
      <div className="space-y-0.5">
        <Label htmlFor="use-custom-settings" className="text-sm font-medium">
          Use Custom Settings
        </Label>
        <p className="text-xs text-muted-foreground">
          Enable individual widget settings for this project
        </p>
      </div>
      <Switch
        id="use-custom-settings"
        checked={useCustomSettings}
        onCheckedChange={(checked) => {
          onCustomToggle?.(checked);
          if (!checked) {
            onChange({
              position: undefined,
              buttonText: undefined,
              buttonShape: undefined,
              buttonIcon: undefined,
              buttonIconSize: undefined,
              buttonIconStroke: undefined,
              theme: undefined,
              lightButtonColor: undefined,
              lightTextColor: undefined,
              lightButtonHoverColor: undefined,
              lightTextHoverColor: undefined,
              darkButtonColor: undefined,
              darkTextColor: undefined,
              darkButtonHoverColor: undefined,
              darkTextHoverColor: undefined,
              enableHoverScaleEffect: undefined,
              tooltipEnabled: undefined,
              tooltipText: undefined,
            });
          }
        }}
      />
    </div>
  );

  // Live Preview Section
  const livePreviewSection = (
    <div className="border rounded-lg p-6 bg-muted/30">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-1">Live Preview</h4>
          <p className="text-xs text-muted-foreground">
            Preview how your button will look. Hover over it to see the effects.
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[100px] bg-background rounded border">
          <LauncherPreview
            position={effectivePosition}
            buttonText={effectiveButtonText}
            buttonShape={effectiveButtonShape}
            buttonIcon={effectiveButtonIcon}
            buttonIconSize={effectiveButtonIconSize}
            buttonIconStroke={effectiveButtonIconStroke}
            theme={effectiveTheme}
            lightButtonColor={effectiveLightButtonColor}
            lightTextColor={effectiveLightTextColor}
            lightButtonHoverColor={effectiveLightButtonHoverColor}
            lightTextHoverColor={effectiveLightTextHoverColor}
            darkButtonColor={effectiveDarkButtonColor}
            darkTextColor={effectiveDarkTextColor}
            darkButtonHoverColor={effectiveDarkButtonHoverColor}
            darkTextHoverColor={effectiveDarkTextHoverColor}
            enableHoverScaleEffect={effectiveEnableHoverScaleEffect}
            tooltipEnabled={effectiveTooltipEnabled}
            tooltipText={effectiveTooltipText}
          />
        </div>
      </div>
    </div>
  );

  // Button Settings Content
  const buttonSettingsContent = (
    <div className="space-y-4">
      {/* Position and Shape */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="widget-position">Button Position</Label>
          <Select
            value={effectivePosition}
            onValueChange={(val) =>
              onChange({
                ...value,
                position: val as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
              })
            }
            disabled={disabled}
          >
            <SelectTrigger id="widget-position">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">Bottom Right</SelectItem>
              <SelectItem value="bottom-left">Bottom Left</SelectItem>
              <SelectItem value="top-right">Top Right</SelectItem>
              <SelectItem value="top-left">Top Left</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="widget-button-shape">Button Shape</Label>
          <Select
            value={effectiveButtonShape}
            onValueChange={(val) =>
              onChange({ ...value, buttonShape: val as 'round' | 'rectangle' })
            }
            disabled={disabled}
          >
            <SelectTrigger id="widget-button-shape">
              <SelectValue placeholder="Select shape" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rectangle">Rectangle</SelectItem>
              <SelectItem value="round">Round</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Button Text and Icon */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="widget-button-text">Button Text (Optional)</Label>
          <Input
            id="widget-button-text"
            value={effectiveButtonText || ''}
            onChange={(e) => onChange({ ...value, buttonText: e.target.value || null })}
            placeholder="Leave empty for icon-only"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">Leave empty to show only an icon</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="widget-button-icon">Button Icon (Optional)</Label>
          <Select
            value={effectiveButtonIcon ?? 'none'}
            onValueChange={(val) => onChange({ ...value, buttonIcon: val === 'none' ? null : val })}
            disabled={disabled}
          >
            <SelectTrigger id="widget-button-icon">
              <SelectValue placeholder="Select icon" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Icon</SelectItem>
              {AVAILABLE_ICONS.map((iconOption) => {
                const IconComponent = iconOption.icon;
                return (
                  <SelectItem key={iconOption.value} value={iconOption.value}>
                    <div className="flex items-center gap-2">
                      <IconComponent className="h-4 w-4" />
                      <span>{iconOption.label}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Choose an icon to display on the button</p>
        </div>
      </div>

      {/* Icon Size and Stroke Width */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="widget-icon-size">Icon Size (px)</Label>
          <Input
            id="widget-icon-size"
            type="number"
            min="12"
            max="32"
            value={effectiveButtonIconSize}
            onChange={(e) =>
              onChange({ ...value, buttonIconSize: parseInt(e.target.value) || undefined })
            }
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">Icon size in pixels (12-32)</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="widget-icon-stroke">Icon Stroke Width</Label>
          <Input
            id="widget-icon-stroke"
            type="number"
            min="1"
            max="3"
            step="0.5"
            value={effectiveButtonIconStroke}
            onChange={(e) =>
              onChange({ ...value, buttonIconStroke: parseFloat(e.target.value) || undefined })
            }
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">Icon stroke thickness (1-3)</p>
        </div>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <Label htmlFor="widget-theme">Theme</Label>
        <Select
          value={effectiveTheme}
          onValueChange={(val) => onChange({ ...value, theme: val as 'auto' | 'light' | 'dark' })}
          disabled={disabled}
        >
          <SelectTrigger id="widget-theme">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (Detect from page)</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Auto detects the page's color scheme automatically
        </p>
      </div>

      {/* Hover Scale Effect */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="enable-hover-scale-effect" className="text-sm font-normal">
            Hover Scale Effect
          </Label>
          <p className="text-xs text-muted-foreground">
            {!showCustomToggle || !useCustomSettings
              ? `Using global default (${globalSettings?.widgetLauncherButton.enableHoverScaleEffect ? 'enabled' : 'disabled'})`
              : value.enableHoverScaleEffect === undefined
                ? `Using global default (${globalSettings?.widgetLauncherButton.enableHoverScaleEffect ? 'enabled' : 'disabled'})`
                : effectiveEnableHoverScaleEffect
                  ? 'Enabled for this project'
                  : 'Disabled for this project'}
          </p>
        </div>
        <Switch
          id="enable-hover-scale-effect"
          checked={effectiveEnableHoverScaleEffect}
          onCheckedChange={(checked) => onChange({ ...value, enableHoverScaleEffect: checked })}
          disabled={disabled}
        />
      </div>

      {showCustomToggle && useCustomSettings && value.enableHoverScaleEffect !== undefined && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, enableHoverScaleEffect: undefined })}
          className="w-full"
        >
          Reset to Global Default
        </Button>
      )}

      {/* Tooltip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-tooltip" className="text-sm font-normal">
              Show Tooltip
            </Label>
            <p className="text-xs text-muted-foreground">
              Display a tooltip when hovering over the button
            </p>
          </div>
          <Switch
            id="enable-tooltip"
            checked={effectiveTooltipEnabled}
            onCheckedChange={(checked) => onChange({ ...value, tooltipEnabled: checked })}
            disabled={disabled}
          />
        </div>

        {effectiveTooltipEnabled && (
          <div className="space-y-2">
            <Label htmlFor="tooltip-text">Tooltip Text</Label>
            <Input
              id="tooltip-text"
              value={effectiveTooltipText || ''}
              onChange={(e) => onChange({ ...value, tooltipText: e.target.value || null })}
              placeholder="Report a bug"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">Text shown in the tooltip on hover</p>
          </div>
        )}
      </div>

      {showCustomToggle && useCustomSettings && value.tooltipEnabled !== undefined && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, tooltipEnabled: undefined, tooltipText: undefined })}
          className="w-full"
        >
          Reset to Global Default
        </Button>
      )}
    </div>
  );

  // Colors Content
  const colorsContent = (
    <ThemeColorPicker
      value={{
        lightButtonColor: effectiveLightButtonColor,
        lightTextColor: effectiveLightTextColor,
        lightButtonHoverColor: effectiveLightButtonHoverColor,
        lightTextHoverColor: effectiveLightTextHoverColor,
        darkButtonColor: effectiveDarkButtonColor,
        darkTextColor: effectiveDarkTextColor,
        darkButtonHoverColor: effectiveDarkButtonHoverColor,
        darkTextHoverColor: effectiveDarkTextHoverColor,
      }}
      onChange={(colors) => onChange({ ...value, ...colors })}
      disabled={disabled}
      buttonColorLabel="Button Color"
      textColorLabel="Text/Icon Color"
    />
  );

  // Tabbed layout for modal context
  if (useTabs) {
    return (
      <div className="space-y-4">
        {customToggleSection}
        {(!showCustomToggle || useCustomSettings) && (
          <>
            {livePreviewSection}
            <Tabs defaultValue="button" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="button">Button</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
              </TabsList>
              <TabsContent value="button" className="mt-4">
                {buttonSettingsContent}
              </TabsContent>
              <TabsContent value="colors" className="mt-4">
                {colorsContent}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    );
  }

  // Linear layout for settings page
  return (
    <div className="space-y-4">
      {customToggleSection}
      {(!showCustomToggle || useCustomSettings) && (
        <>
          {livePreviewSection}
          {buttonSettingsContent}
          <div className="border-t pt-4">{colorsContent}</div>
        </>
      )}
    </div>
  );
}
