import { ThemeColorPicker, type ColorMode } from '../../ThemeColorPicker';
import type { LauncherFieldsProps } from './fields';

interface LauncherColorsSectionProps extends LauncherFieldsProps {
  colorMode?: ColorMode;
  onColorModeChange?: (mode: ColorMode) => void;
}

export function LauncherColorsSection({
  value,
  effective,
  onChange,
  disabled,
  colorMode,
  onColorModeChange,
}: LauncherColorsSectionProps) {
  return (
    <ThemeColorPicker
      value={{
        lightButtonColor: effective.lightButtonColor,
        lightTextColor: effective.lightTextColor,
        lightButtonHoverColor: effective.lightButtonHoverColor,
        lightTextHoverColor: effective.lightTextHoverColor,
        darkButtonColor: effective.darkButtonColor,
        darkTextColor: effective.darkTextColor,
        darkButtonHoverColor: effective.darkButtonHoverColor,
        darkTextHoverColor: effective.darkTextHoverColor,
      }}
      onChange={(colors) => onChange({ ...value, ...colors })}
      disabled={disabled}
      buttonColorLabel="Button Color"
      textColorLabel="Text/Icon Color"
      mode={colorMode}
      onModeChange={onColorModeChange}
    />
  );
}
