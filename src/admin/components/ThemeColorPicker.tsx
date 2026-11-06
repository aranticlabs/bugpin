import { useState } from 'react';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { ColorPicker } from './ui/color-picker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
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
  showSurfaceColors?: boolean;
}

// Utility function to generate dark mode colors from light mode colors
function generateDarkModeColors(lightColors: {
  buttonColor: string;
  textColor: string;
  buttonHoverColor: string;
  textHoverColor: string;
  backgroundColor?: string;
  secondaryColor?: string;
  inputColor?: string;
  foregroundColor?: string;
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

  // Invert a color (light ↔ dark)
  const invertColor = (hex: string): string => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
  };

  const result: Partial<ThemeColors> = {
    darkButtonColor: adjustColor(lightColors.buttonColor, 80),
    darkTextColor: adjustColor(lightColors.textColor, -200),
    darkButtonHoverColor: adjustColor(lightColors.buttonHoverColor, 100),
    darkTextHoverColor: adjustColor(lightColors.textHoverColor, -200),
  };

  // Generate surface colors if light mode values are provided
  if (lightColors.backgroundColor) {
    result.darkBackgroundColor = invertColor(lightColors.backgroundColor);
  }
  if (lightColors.secondaryColor) {
    result.darkSecondaryColor = invertColor(lightColors.secondaryColor);
  }
  if (lightColors.inputColor) {
    result.darkInputColor = invertColor(lightColors.inputColor);
  }
  if (lightColors.foregroundColor) {
    result.darkForegroundColor = invertColor(lightColors.foregroundColor);
  }

  return result;
}

export function ThemeColorPicker({
  value,
  onChange,
  disabled = false,
  lightModeTitle = 'Light Mode Colors',
  darkModeTitle = 'Dark Mode Colors',
  buttonColorLabel = 'Primary Color',
  textColorLabel = 'Button Text Color',
  showGenerateButton = true,
  showSurfaceColors = false,
}: ThemeColorPickerProps) {
  const [activeMode, setActiveMode] = useState<'light' | 'dark'>('light');

  const handleGenerateDarkColors = () => {
    const generated = generateDarkModeColors({
      buttonColor: value.lightButtonColor,
      textColor: value.lightTextColor,
      buttonHoverColor: value.lightButtonHoverColor,
      textHoverColor: value.lightTextHoverColor,
      backgroundColor: value.lightBackgroundColor,
      secondaryColor: value.lightSecondaryColor,
      inputColor: value.lightInputColor,
      foregroundColor: value.lightForegroundColor,
    });
    onChange(generated);
  };

  type ColorKey = keyof ThemeColors;
  const field = (key: ColorKey, label: string, fallback?: string) => ({ key, label, fallback });

  // Ordered row by row so each hover color sits under its base color.
  const fieldsFor = (mode: 'light' | 'dark') => {
    const light = mode === 'light';
    const button = field(light ? 'lightButtonColor' : 'darkButtonColor', buttonColorLabel);
    const text = field(light ? 'lightTextColor' : 'darkTextColor', textColorLabel);
    const buttonHover = field(
      light ? 'lightButtonHoverColor' : 'darkButtonHoverColor',
      `${buttonColorLabel} (Hover)`
    );
    const textHover = field(
      light ? 'lightTextHoverColor' : 'darkTextHoverColor',
      `${textColorLabel} (Hover)`
    );
    if (!showSurfaceColors) return [button, text, buttonHover, textHover];
    return [
      button,
      text,
      field(
        light ? 'lightBackgroundColor' : 'darkBackgroundColor',
        'Background Color',
        light ? '#ffffff' : '#0a0a0a'
      ),
      buttonHover,
      textHover,
      field(
        light ? 'lightSecondaryColor' : 'darkSecondaryColor',
        'Secondary Color',
        light ? '#f5f5f5' : '#262626'
      ),
      field(
        light ? 'lightInputColor' : 'darkInputColor',
        'Input Field Color',
        light ? '#ffffff' : '#1a1a1a'
      ),
      field(
        light ? 'lightForegroundColor' : 'darkForegroundColor',
        'Text Color',
        light ? '#0a0a0a' : '#fafafa'
      ),
    ];
  };

  const colorGrid = (mode: 'light' | 'dark') => (
    <div
      className={`grid grid-cols-2 gap-x-4 gap-y-3 ${showSurfaceColors ? 'md:grid-cols-3' : ''}`}
    >
      {fieldsFor(mode).map(({ key, label, fallback }) => (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <ColorPicker
            value={value[key] ?? fallback ?? ''}
            onChange={(color) => onChange({ [key]: color })}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );

  return (
    <Tabs value={activeMode} onValueChange={(mode) => setActiveMode(mode as 'light' | 'dark')}>
      {/* The button shares the tab row so switching modes does not move the color fields. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="light">
            {lightModeTitle}
          </TabsTrigger>
          <TabsTrigger value="dark">
            {darkModeTitle}
          </TabsTrigger>
        </TabsList>
        {showGenerateButton && activeMode === 'dark' && (
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

      <TabsContent value="light" className="space-y-3 pt-2">
        {colorGrid('light')}
      </TabsContent>

      <TabsContent value="dark" className="space-y-3 pt-2">
        {colorGrid('dark')}
      </TabsContent>
    </Tabs>
  );
}
