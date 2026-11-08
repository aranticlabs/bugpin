import { SettingRows } from './ui/setting-row';
import type { ColorMode } from './ThemeColorPicker';
import type {
  GlobalWidgetLauncherButtonSettings,
  LocaleCode,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { resolveLauncherSettings } from './widget/launcher/resolveLauncherSettings';
import { LauncherPlacementFields } from './widget/launcher/LauncherPlacementFields';
import { LauncherIconFields } from './widget/launcher/LauncherIconFields';
import { LauncherBehaviorFields } from './widget/launcher/LauncherBehaviorFields';
import { LauncherColorsSection } from './widget/launcher/LauncherColorsSection';

export { WidgetLauncherPreview } from './widget/launcher/LauncherPreview';

interface ButtonSettingsFormProps {
  value: WidgetLauncherButtonSettings;
  onChange: (value: WidgetLauncherButtonSettings) => void;
  globalSettings?: {
    widgetLauncherButton: GlobalWidgetLauncherButtonSettings;
  };
  disabled?: boolean;
  onPreviewLocaleChange?: (locale: LocaleCode) => void;
  buttonTextError?: string;
  tooltipTextError?: string;
  colorMode?: ColorMode;
  onColorModeChange?: (mode: ColorMode) => void;
  part?: 'general' | 'colors';
}

export function WidgetLauncherButtonSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
  onPreviewLocaleChange,
  buttonTextError,
  tooltipTextError,
  colorMode,
  onColorModeChange,
  part = 'general',
}: ButtonSettingsFormProps) {
  const isProjectLayer = Boolean(globalSettings);
  const fields = {
    value,
    onChange,
    disabled,
    effective: resolveLauncherSettings(value, globalSettings),
  };

  if (part === 'colors') {
    return (
      <LauncherColorsSection
        {...fields}
        colorMode={colorMode}
        onColorModeChange={onColorModeChange}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SettingRows>
        <LauncherPlacementFields {...fields} />
        <LauncherIconFields
          {...fields}
          isProjectLayer={isProjectLayer}
          globalButtonText={globalSettings?.widgetLauncherButton.buttonText ?? null}
          onPreviewLocaleChange={onPreviewLocaleChange}
          buttonTextError={buttonTextError}
        />
        <LauncherBehaviorFields
          {...fields}
          isProjectLayer={isProjectLayer}
          globalTooltipText={globalSettings?.widgetLauncherButton.tooltipText ?? null}
          globalHoverScale={globalSettings?.widgetLauncherButton.enableHoverScaleEffect}
          onPreviewLocaleChange={onPreviewLocaleChange}
          tooltipTextError={tooltipTextError}
        />
      </SettingRows>
    </div>
  );
}
