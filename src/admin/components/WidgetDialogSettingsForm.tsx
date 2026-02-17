import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { ThemeColorPicker } from './ThemeColorPicker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import type { ThemeColors } from '@shared/types';

const DEFAULT_WIDGET_COLORS: ThemeColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
};

interface WidgetDialogSettingsFormProps {
  value: Partial<ThemeColors>;
  onChange: (value: Partial<ThemeColors>) => void;
  globalWidgetColors?: ThemeColors;
  disabled?: boolean;
  showCustomToggle?: boolean;
  useCustomSettings?: boolean;
  onCustomToggle?: (enabled: boolean) => void;
  showCard?: boolean;
}

export function WidgetDialogSettingsForm({
  value,
  onChange,
  globalWidgetColors,
  disabled = false,
  showCustomToggle = false,
  useCustomSettings = true,
  onCustomToggle,
  showCard = true,
}: WidgetDialogSettingsFormProps) {
  // Merge value with global colors and defaults
  const currentColors: ThemeColors = {
    lightButtonColor:
      value.lightButtonColor ??
      globalWidgetColors?.lightButtonColor ??
      DEFAULT_WIDGET_COLORS.lightButtonColor,
    lightTextColor:
      value.lightTextColor ??
      globalWidgetColors?.lightTextColor ??
      DEFAULT_WIDGET_COLORS.lightTextColor,
    lightButtonHoverColor:
      value.lightButtonHoverColor ??
      globalWidgetColors?.lightButtonHoverColor ??
      DEFAULT_WIDGET_COLORS.lightButtonHoverColor,
    lightTextHoverColor:
      value.lightTextHoverColor ??
      globalWidgetColors?.lightTextHoverColor ??
      DEFAULT_WIDGET_COLORS.lightTextHoverColor,
    darkButtonColor:
      value.darkButtonColor ??
      globalWidgetColors?.darkButtonColor ??
      DEFAULT_WIDGET_COLORS.darkButtonColor,
    darkTextColor:
      value.darkTextColor ??
      globalWidgetColors?.darkTextColor ??
      DEFAULT_WIDGET_COLORS.darkTextColor,
    darkButtonHoverColor:
      value.darkButtonHoverColor ??
      globalWidgetColors?.darkButtonHoverColor ??
      DEFAULT_WIDGET_COLORS.darkButtonHoverColor,
    darkTextHoverColor:
      value.darkTextHoverColor ??
      globalWidgetColors?.darkTextHoverColor ??
      DEFAULT_WIDGET_COLORS.darkTextHoverColor,
  };

  const handleColorChange = (colors: Partial<ThemeColors>) => {
    onChange({ ...value, ...colors });
  };

  const isDisabled = disabled || (showCustomToggle && !useCustomSettings);

  const colorPicker = (
    <ThemeColorPicker value={currentColors} onChange={handleColorChange} disabled={isDisabled} />
  );

  return (
    <div className="space-y-4">
      {/* Use Custom Settings Toggle */}
      {showCustomToggle && (
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="space-y-0.5">
            <Label htmlFor="use-custom-widget-dialog" className="text-sm font-medium">
              Use Custom Settings
            </Label>
            <p className="text-xs text-muted-foreground">
              Enable custom widget dialog colors for this project
            </p>
          </div>
          <Switch
            id="use-custom-widget-dialog"
            checked={useCustomSettings}
            onCheckedChange={(checked) => {
              onCustomToggle?.(checked);
              if (!checked) {
                // Reset all values to undefined when switching to global defaults
                onChange({});
              }
            }}
          />
        </div>
      )}

      {/* Widget Dialog Colors - collapsed when custom toggle is off */}
      {(!showCustomToggle || useCustomSettings) && (
        <>
          {showCard ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Widget Dialog Colors</CardTitle>
                <CardDescription>
                  Configure the colors for buttons inside the feedback widget dialog (submit, action
                  buttons).
                </CardDescription>
              </CardHeader>
              <CardContent>{colorPicker}</CardContent>
            </Card>
          ) : (
            <div>{colorPicker}</div>
          )}
        </>
      )}
    </div>
  );
}
