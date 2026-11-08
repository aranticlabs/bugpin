import { useState } from 'react';
import { Moon, Sparkles, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { ColorPicker } from './ui/color-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import type { ThemeColors } from '@shared/types';

export type ColorMode = 'light' | 'dark';
type Mode = ColorMode;
type ColorKey = keyof ThemeColors;
type ColorField = { key: ColorKey; fallback?: string };
type ColorRow = { label: string; hint?: string; base: ColorField; hover?: ColorField };
type ColorGroup = { title?: string; rows: ColorRow[] };

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
  mode?: ColorMode;
  onModeChange?: (mode: ColorMode) => void;
}

// Utility function to generate dark mode colors from light mode colors
const INVERTED_DIALOG_COLORS = [
  ['lightBackgroundColor', 'darkBackgroundColor'],
  ['lightSecondaryColor', 'darkSecondaryColor'],
  ['lightInputColor', 'darkInputColor'],
  ['lightForegroundColor', 'darkForegroundColor'],
  ['lightSecondaryButtonColor', 'darkSecondaryButtonColor'],
  ['lightSecondaryButtonTextColor', 'darkSecondaryButtonTextColor'],
  ['lightSecondaryButtonHoverColor', 'darkSecondaryButtonHoverColor'],
  ['lightSecondaryButtonTextHoverColor', 'darkSecondaryButtonTextHoverColor'],
  ['lightTabBarColor', 'darkTabBarColor'],
  ['lightActiveTabColor', 'darkActiveTabColor'],
  ['lightActiveTabTextColor', 'darkActiveTabTextColor'],
  ['lightTabTextColor', 'darkTabTextColor'],
  ['lightTabTextHoverColor', 'darkTabTextHoverColor'],
] as const satisfies ReadonlyArray<readonly [keyof ThemeColors, keyof ThemeColors]>;

function generateDarkModeColors(lightColors: ThemeColors) {
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
    darkButtonColor: adjustColor(lightColors.lightButtonColor, 80),
    darkTextColor: adjustColor(lightColors.lightTextColor, -200),
    darkButtonHoverColor: adjustColor(lightColors.lightButtonHoverColor, 100),
    darkTextHoverColor: adjustColor(lightColors.lightTextHoverColor, -200),
  };

  for (const [lightKey, darkKey] of INVERTED_DIALOG_COLORS) {
    const lightValue = lightColors[lightKey];
    if (lightValue) result[darkKey] = invertColor(lightValue);
  }

  return result;
}

export function ThemeColorPicker({
  value,
  onChange,
  disabled = false,
  lightModeTitle = 'Light',
  darkModeTitle = 'Dark',
  buttonColorLabel = 'Primary Color',
  textColorLabel = 'Button Text Color',
  showGenerateButton = true,
  showSurfaceColors = false,
  mode,
  onModeChange,
}: ThemeColorPickerProps) {
  const [localMode, setLocalMode] = useState<Mode>('light');
  const activeMode = mode ?? localMode;
  const setActiveMode = (next: Mode) => {
    setLocalMode(next);
    onModeChange?.(next);
  };

  const handleGenerateDarkColors = () => {
    onChange(generateDarkModeColors(value));
  };

  const groupsFor = (groupMode: Mode): ColorGroup[] => {
    const light = groupMode === 'light';
    const pick = (
      lightKey: ColorKey,
      darkKey: ColorKey,
      lightFallback?: string,
      darkFallback?: string
    ) => ({ key: light ? lightKey : darkKey, fallback: light ? lightFallback : darkFallback });
    const primaryButtonRows = (backgroundLabel: string, textLabel: string): ColorRow[] => [
      {
        label: backgroundLabel,
        base: pick('lightButtonColor', 'darkButtonColor'),
        hover: pick('lightButtonHoverColor', 'darkButtonHoverColor'),
      },
      {
        label: textLabel,
        base: pick('lightTextColor', 'darkTextColor'),
        hover: pick('lightTextHoverColor', 'darkTextHoverColor'),
      },
    ];
    if (!showSurfaceColors) {
      return [{ rows: primaryButtonRows(buttonColorLabel, textColorLabel) }];
    }
    return [
      {
        title: 'Dialog',
        rows: [
          {
            label: 'Background',
            base: pick('lightBackgroundColor', 'darkBackgroundColor', '#ffffff', '#0a0a0a'),
          },
          {
            label: 'Secondary',
            hint: 'Footer area',
            base: pick('lightSecondaryColor', 'darkSecondaryColor', '#f5f5f5', '#262626'),
          },
          {
            label: 'Input field',
            base: pick('lightInputColor', 'darkInputColor', '#ffffff', '#1a1a1a'),
          },
          {
            label: 'Text',
            base: pick('lightForegroundColor', 'darkForegroundColor', '#0a0a0a', '#fafafa'),
          },
        ],
      },
      { title: 'Primary Button', rows: primaryButtonRows('Background', 'Text') },
      {
        title: 'Secondary Button',
        rows: [
          {
            label: 'Background',
            base: pick(
              'lightSecondaryButtonColor',
              'darkSecondaryButtonColor',
              '#ffffff',
              '#0a0a0a'
            ),
            hover: pick(
              'lightSecondaryButtonHoverColor',
              'darkSecondaryButtonHoverColor',
              '#e5e5e5',
              '#404040'
            ),
          },
          {
            label: 'Text',
            base: pick(
              'lightSecondaryButtonTextColor',
              'darkSecondaryButtonTextColor',
              '#0a0a0a',
              '#fafafa'
            ),
            hover: pick(
              'lightSecondaryButtonTextHoverColor',
              'darkSecondaryButtonTextHoverColor',
              '#0a0a0a',
              '#fafafa'
            ),
          },
        ],
      },
      {
        title: 'Tabs',
        rows: [
          {
            label: 'Tab bar',
            base: pick('lightTabBarColor', 'darkTabBarColor', '#f5f5f5', '#262626'),
          },
          {
            label: 'Active tab',
            base: pick('lightActiveTabColor', 'darkActiveTabColor', '#ffffff', '#0a0a0a'),
          },
          {
            label: 'Active text',
            base: pick('lightActiveTabTextColor', 'darkActiveTabTextColor', '#0a0a0a', '#fafafa'),
          },
          {
            label: 'Inactive text',
            base: pick('lightTabTextColor', 'darkTabTextColor', '#737373', '#a3a3a3'),
            hover: pick('lightTabTextHoverColor', 'darkTabTextHoverColor', '#0a0a0a', '#fafafa'),
          },
        ],
      },
    ];
  };

  const colorControl = (field: ColorField, label: string) => (
    <ColorPicker
      value={value[field.key] ?? field.fallback ?? ''}
      onChange={(color) => onChange({ [field.key]: color })}
      disabled={disabled}
      label={label}
    />
  );

  const colorTable = ({ title, rows }: ColorGroup) => {
    const hasHover = rows.some((row) => row.hover);
    const fieldLabel = (row: ColorRow) => (title ? `${title} ${row.label}` : row.label);
    return (
      <div key={title ?? 'colors'} className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44">{title}</TableHead>
              <TableHead className="w-44">Default</TableHead>
              <TableHead className="w-44">{hasHover && 'Hover'}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.base.key} className="hover:bg-transparent">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.label}</span>
                    {row.hint && <span className="text-xs text-muted-foreground">{row.hint}</span>}
                  </div>
                </TableCell>
                <TableCell>{colorControl(row.base, fieldLabel(row))}</TableCell>
                <TableCell>
                  {row.hover && colorControl(row.hover, `${fieldLabel(row)} (Hover)`)}
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Tabs value={activeMode} onValueChange={(next) => setActiveMode(next as Mode)}>
      {/* The button shares the tab row so switching modes does not move the color fields. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="light" className="gap-1.5">
            <Sun className="size-4" />
            {lightModeTitle}
          </TabsTrigger>
          <TabsTrigger value="dark" className="gap-1.5">
            <Moon className="size-4" />
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
            <Sparkles />
            Generate from Light Mode
          </Button>
        )}
      </div>

      <TabsContent value="light" className="space-y-4 pt-2">
        {groupsFor('light').map(colorTable)}
      </TabsContent>

      <TabsContent value="dark" className="space-y-4 pt-2">
        {groupsFor('dark').map(colorTable)}
      </TabsContent>
    </Tabs>
  );
}
