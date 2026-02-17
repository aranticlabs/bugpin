import { Label } from './ui/label';
import { Button } from './ui/button';
import { ColorPicker } from './ui/color-picker';
import type { ThemeColors } from '@shared/types';

interface ThemeColorPickerProps {
  value: ThemeColors;
  onChange: (colors: Partial<ThemeColors>) => void;
  disabled?: boolean;
  lightModeTitle?: string;
  darkModeTitle?: string;
  buttonColorLabel?: string;
  textColorLabel?: string;
  showGenerateButton?: boolean;
}

// Utility function to generate dark mode colors from light mode colors
function generateDarkModeColors(lightColors: {
  buttonColor: string;
  textColor: string;
  buttonHoverColor: string;
  textHoverColor: string;
}) {
  // Helper to parse hex color to RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  // Helper to convert RGB to hex
  const rgbToHex = (r: number, g: number, b: number): string => {
    return (
      '#' +
      [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')
    );
  };

  // Helper to lighten/darken color
  const adjustColor = (hex: string, amount: number): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    const adjust = (val: number) => Math.max(0, Math.min(255, val + amount));
    return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
  };

  // Generate dark mode colors by lightening the light mode colors
  return {
    darkButtonColor: adjustColor(lightColors.buttonColor, 80),
    darkTextColor: adjustColor(lightColors.textColor, -200),
    darkButtonHoverColor: adjustColor(lightColors.buttonHoverColor, 100),
    darkTextHoverColor: adjustColor(lightColors.textHoverColor, -200),
  };
}

export function ThemeColorPicker({
  value,
  onChange,
  disabled = false,
  lightModeTitle = 'Light Mode Colors',
  darkModeTitle = 'Dark Mode Colors',
  buttonColorLabel = 'Primary Color',
  textColorLabel = 'Text Color',
  showGenerateButton = true,
}: ThemeColorPickerProps) {
  const handleGenerateDarkColors = () => {
    const generated = generateDarkModeColors({
      buttonColor: value.lightButtonColor,
      textColor: value.lightTextColor,
      buttonHoverColor: value.lightButtonHoverColor,
      textHoverColor: value.lightTextHoverColor,
    });
    onChange(generated);
  };

  return (
    <div className="space-y-4">
      {/* Light Mode Colors */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">{lightModeTitle}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{buttonColorLabel}</Label>
            <ColorPicker
              value={value.lightButtonColor}
              onChange={(color) => onChange({ lightButtonColor: color })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>{textColorLabel}</Label>
            <ColorPicker
              value={value.lightTextColor}
              onChange={(color) => onChange({ lightTextColor: color })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>{buttonColorLabel} (Button Hover)</Label>
            <ColorPicker
              value={value.lightButtonHoverColor}
              onChange={(color) => onChange({ lightButtonHoverColor: color })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>{textColorLabel} (Button Hover)</Label>
            <ColorPicker
              value={value.lightTextHoverColor}
              onChange={(color) => onChange({ lightTextHoverColor: color })}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {/* Dark Mode Colors */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{darkModeTitle}</h4>
          {showGenerateButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateDarkColors}
              disabled={disabled}
              type="button"
            >
              Generate from Light Mode
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{buttonColorLabel}</Label>
            <ColorPicker
              value={value.darkButtonColor}
              onChange={(color) => onChange({ darkButtonColor: color })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>{textColorLabel}</Label>
            <ColorPicker
              value={value.darkTextColor}
              onChange={(color) => onChange({ darkTextColor: color })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>{buttonColorLabel} (Button Hover)</Label>
            <ColorPicker
              value={value.darkButtonHoverColor}
              onChange={(color) => onChange({ darkButtonHoverColor: color })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label>{textColorLabel} (Button Hover)</Label>
            <ColorPicker
              value={value.darkTextHoverColor}
              onChange={(color) => onChange({ darkTextHoverColor: color })}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
