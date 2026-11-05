import { cn } from '../lib/utils';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { SettingRow, SettingRowPair, SettingRows } from './ui/setting-row';
import { ThemeColorPicker } from './ThemeColorPicker';
import { LocalizedTextEditor } from './i18n/LocalizedTextEditor';
import { Bug, MessageSquare, AlertCircle } from 'lucide-react';
import { SUPPORTED_LOCALES } from '@shared/types';
import { computeTooltipShift } from '@shared/tooltip-position';
import type {
  GlobalWidgetLauncherButtonSettings,
  LocaleCode,
  LocalizedString,
  WidgetLauncherButtonSettings,
} from '@shared/types';

const TOOLTIP_BUILTIN_PREVIEW = {
  en: 'Found a bug?',
  de: 'Bug gefunden?',
  fr: 'Vous avez trouvé un bug ?',
  nl: 'Bug gevonden?',
  es: '¿Has encontrado un error?',
  it: 'Hai trovato un bug?',
  ja: 'バグを見つけましたか？',
  zh: '发现 bug 了？',
} as const;

// Available icons for the button
const AVAILABLE_ICONS = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'message-square', label: 'Message', icon: MessageSquare },
  { value: 'alert-circle', label: 'Alert', icon: AlertCircle },
] as const;

function resolveForPreview(
  project: LocalizedString | null | undefined,
  global: LocalizedString | null,
  builtin: Partial<Record<LocaleCode, string>> | null,
  locale: LocaleCode = 'en'
): string | null {
  if (project === null) return null;
  if (project) {
    if (project[locale]) return project[locale] ?? null;
    if (project.en) return project.en;
  }
  if (global) {
    if (global[locale]) return global[locale] ?? null;
    if (global.en) return global.en;
  }
  if (builtin) {
    return builtin[locale] ?? builtin.en ?? null;
  }
  return null;
}

function buildPerLocalePreview(
  global: LocalizedString | null,
  builtin: Partial<Record<LocaleCode, string>> | null
): Partial<Record<LocaleCode, string>> {
  const out: Partial<Record<LocaleCode, string>> = {};
  for (const code of SUPPORTED_LOCALES) {
    const fromGlobal = global?.[code] ?? global?.en ?? '';
    const fromBuiltin = builtin?.[code] ?? builtin?.en ?? '';
    const value = fromGlobal || fromBuiltin;
    if (value) out[code] = value;
  }
  return out;
}

type LauncherPosition = GlobalWidgetLauncherButtonSettings['position'];
type SizeUnit = GlobalWidgetLauncherButtonSettings['buttonSizeUnit'];

type SizeField = 'offset' | 'icon';

interface SizeRange {
  min: number;
  max: number;
  step: number;
}

const SIZE_RANGES: Record<SizeField, Record<SizeUnit, SizeRange>> = {
  offset: {
    px: { min: 0, max: 200, step: 1 },
    rem: { min: 0, max: 12.5, step: 0.05 },
  },
  icon: {
    px: { min: 12, max: 32, step: 1 },
    rem: { min: 0.75, max: 2, step: 0.125 },
  },
};

// Matches the browser default root font size; the real rem value depends on the host page.
const PX_PER_REM = 16;

// The preview box is much smaller than a real page, so large offsets are capped to keep the button visible.
const MAX_PREVIEW_OFFSET_PX = 64;

// Computed styles of the real widget tooltip, which renders with its own font
// stack and Tailwind scale inside the Shadow DOM rather than the Admin Console theme.
const WIDGET_TOOLTIP_STYLE = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '16px',
  padding: '6px 12px',
  borderRadius: '4px',
} as const;

const EDGE_LABELS: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
};

function splitPosition(position: LauncherPosition): { vertical: string; horizontal: string } {
  const [vertical, horizontal] = position.split('-');
  return { vertical, horizontal };
}

function clampSize(size: number, field: SizeField, unit: SizeUnit): number {
  const { min, max, step } = SIZE_RANGES[field][unit];
  const snapped = Number((Math.round(size / step) * step).toFixed(3));
  return Math.min(Math.max(snapped, min), max);
}

// Values are clamped on blur rather than on every keystroke, so partial input
// such as "2" on the way to "24" is not snapped to the minimum.
function parseSize(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toPx(size: number, unit: SizeUnit): number {
  return unit === 'rem' ? size * PX_PER_REM : size;
}

function convertSize(size: number, field: SizeField, from: SizeUnit, to: SizeUnit): number {
  if (from === to) return size;
  const px = toPx(size, from);
  return clampSize(to === 'rem' ? px / PX_PER_REM : px, field, to);
}

function describeRange(field: SizeField, unit: SizeUnit): string {
  const { min, max } = SIZE_RANGES[field][unit];
  return `${min} to ${max} ${unit}.`;
}

interface LauncherPreviewProps extends Omit<
  GlobalWidgetLauncherButtonSettings,
  'buttonText' | 'tooltipText'
> {
  buttonText: string | null;
  tooltipText: string | null;
}

function LauncherPreview({
  position,
  buttonText,
  buttonShape,
  buttonIcon,
  buttonIconSize,
  buttonIconStroke,
  buttonOffsetX,
  buttonOffsetY,
  buttonSizeUnit,
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
}: LauncherPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipShift, setTooltipShift] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const offsetX = toPx(buttonOffsetX, buttonSizeUnit);
  const offsetY = toPx(buttonOffsetY, buttonSizeUnit);
  const previousOffsets = useRef({ x: offsetX, y: offsetY });
  const [marginHighlights, setMarginHighlights] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const xChanged = previousOffsets.current.x !== offsetX;
    const yChanged = previousOffsets.current.y !== offsetY;
    previousOffsets.current = { x: offsetX, y: offsetY };
    if (xChanged || yChanged) {
      setMarginHighlights((current) => ({
        x: current.x + Number(xChanged),
        y: current.y + Number(yChanged),
      }));
    }
  }, [offsetX, offsetY]);

  // Same clamping as the real widget, with the preview box standing in for the browser window.
  useLayoutEffect(() => {
    const bounds = wrapperRef.current?.parentElement;
    if (!isHovered || !bounds || !buttonRef.current || !tooltipRef.current) return;
    const boundsRect = bounds.getBoundingClientRect();
    const buttonRect = buttonRef.current.getBoundingClientRect();
    setTooltipShift(
      computeTooltipShift(
        buttonRect.left + buttonRect.width / 2,
        tooltipRef.current.offsetWidth,
        boundsRect.left,
        boundsRect.right
      )
    );
  }, [isHovered, tooltipText, position, buttonOffsetX, buttonSizeUnit]);

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
  const iconSizePx = toPx(buttonIconSize, buttonSizeUnit);
  const padding = buttonShape === 'round' ? `${iconSizePx / 2}px` : '12px 20px';

  // Get the icon component
  const IconComponent = AVAILABLE_ICONS.find((i) => i.value === buttonIcon)?.icon;

  const tooltipBelow = position.startsWith('top');
  const { vertical, horizontal } = splitPosition(position);
  const previewOffsetX = Math.min(offsetX, MAX_PREVIEW_OFFSET_PX);
  const previewOffsetY = Math.min(offsetY, MAX_PREVIEW_OFFSET_PX);
  const positionStyle = {
    top: vertical === 'top' ? `${previewOffsetY}px` : `calc(100% - ${previewOffsetY}px)`,
    left: horizontal === 'left' ? `${previewOffsetX}px` : `calc(100% - ${previewOffsetX}px)`,
    transform: `translate(${horizontal === 'left' ? '0' : '-100%'}, ${vertical === 'top' ? '0' : '-100%'})`,
    maxWidth: `calc(100% - ${previewOffsetX}px)`,
  };

  return (
    <>
      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none text-xs font-medium leading-none',
          isDarkMode ? 'text-sky-300' : 'text-sky-800'
        )}
        data-preview-theme={isDarkMode ? 'dark' : 'light'}
        aria-hidden="true"
      >
        {marginHighlights.x > 0 && (
          <div
            key={`x-${marginHighlights.x}`}
            aria-hidden="true"
            data-testid="launcher-preview-margin-x"
            className="launcher-preview-margin absolute inset-y-0 flex items-center justify-center"
            style={{ [horizontal]: 0, width: Math.max(previewOffsetX, 2) }}
          >
            <span
              className="relative shrink-0 whitespace-nowrap -rotate-90"
              style={{ [horizontal]: Math.max(0, (16 - previewOffsetX) / 2) }}
            >
              {buttonOffsetX} {buttonSizeUnit}
            </span>
          </div>
        )}
        {marginHighlights.y > 0 && (
          <div
            key={`y-${marginHighlights.y}`}
            aria-hidden="true"
            data-testid="launcher-preview-margin-y"
            className="launcher-preview-margin absolute inset-x-0 flex items-center justify-center"
            style={{ [vertical]: 0, height: Math.max(previewOffsetY, 2) }}
          >
            <span
              className="relative shrink-0 whitespace-nowrap"
              style={{ [vertical]: Math.max(0, (16 - previewOffsetY) / 2) }}
            >
              {buttonOffsetY} {buttonSizeUnit}
            </span>
          </div>
        )}
      </div>
      <div
        ref={wrapperRef}
        className="absolute inline-block w-max transition-[top,left,transform] duration-300 ease-in-out motion-reduce:transition-none"
        style={positionStyle}
      >
        <button
          ref={buttonRef}
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
          {IconComponent && <IconComponent size={iconSizePx} strokeWidth={buttonIconStroke} />}
          {buttonText && <span>{buttonText}</span>}
        </button>

        {/* Tooltip */}
        {tooltipEnabled && tooltipText && isHovered && (
          <div
            ref={tooltipRef}
            data-testid="launcher-preview-tooltip"
            className={`absolute left-1/2 pointer-events-none whitespace-nowrap ${
              tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2'
            }`}
            style={{
              ...WIDGET_TOOLTIP_STYLE,
              backgroundColor: tooltipBgColor,
              color: tooltipTextColor,
              animation: 'fadeIn 0.2s ease-in-out',
              transform: `translateX(-50%) translateX(${tooltipShift}px)`,
            }}
          >
            {tooltipText}
          </div>
        )}
      </div>
    </>
  );
}

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
}

type LauncherGlobals = ButtonSettingsFormProps['globalSettings'];

function resolveLauncherSettings(
  value: WidgetLauncherButtonSettings,
  globalSettings: LauncherGlobals
) {
  const global = globalSettings?.widgetLauncherButton;
  return {
    position: value.position ?? global?.position ?? 'bottom-right',
    buttonShape: value.buttonShape ?? global?.buttonShape ?? 'rectangle',
    buttonIcon: value.buttonIcon !== undefined ? value.buttonIcon : (global?.buttonIcon ?? null),
    buttonIconSize: value.buttonIconSize ?? global?.buttonIconSize ?? 18,
    buttonIconStroke: value.buttonIconStroke ?? global?.buttonIconStroke ?? 2,
    buttonOffsetX: value.buttonOffsetX ?? global?.buttonOffsetX ?? 20,
    buttonOffsetY: value.buttonOffsetY ?? global?.buttonOffsetY ?? 20,
    buttonSizeUnit: value.buttonSizeUnit ?? global?.buttonSizeUnit ?? 'px',
    theme: value.theme ?? global?.theme ?? 'auto',
    enableHoverScaleEffect: value.enableHoverScaleEffect ?? global?.enableHoverScaleEffect ?? true,
    tooltipEnabled: value.tooltipEnabled ?? global?.tooltipEnabled ?? false,
    lightButtonColor: value.lightButtonColor ?? global?.lightButtonColor ?? '#02658D',
    lightTextColor: value.lightTextColor ?? global?.lightTextColor ?? '#ffffff',
    lightButtonHoverColor:
      value.lightButtonHoverColor ?? global?.lightButtonHoverColor ?? '#024F6F',
    lightTextHoverColor: value.lightTextHoverColor ?? global?.lightTextHoverColor ?? '#ffffff',
    darkButtonColor: value.darkButtonColor ?? global?.darkButtonColor ?? '#02658D',
    darkTextColor: value.darkTextColor ?? global?.darkTextColor ?? '#ffffff',
    darkButtonHoverColor: value.darkButtonHoverColor ?? global?.darkButtonHoverColor ?? '#036F9B',
    darkTextHoverColor: value.darkTextHoverColor ?? global?.darkTextHoverColor ?? '#ffffff',
  };
}

export function WidgetLauncherPreview({
  value,
  globalSettings,
  mode,
  locale = 'en',
}: {
  value: WidgetLauncherButtonSettings;
  globalSettings: LauncherGlobals;
  mode?: 'light' | 'dark';
  locale?: LocaleCode;
}) {
  const effective = resolveLauncherSettings(value, globalSettings);
  const globalButtonText = globalSettings?.widgetLauncherButton.buttonText ?? null;
  const globalTooltipText = globalSettings?.widgetLauncherButton.tooltipText ?? null;
  return (
    <LauncherPreview
      {...effective}
      theme={mode ?? effective.theme}
      buttonText={resolveForPreview(value.buttonText, globalButtonText, null, locale)}
      tooltipText={
        resolveForPreview(value.tooltipText, globalTooltipText, TOOLTIP_BUILTIN_PREVIEW, locale) ??
        TOOLTIP_BUILTIN_PREVIEW[locale]
      }
    />
  );
}

function ResetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 px-2 text-xs text-muted-foreground"
      onClick={onClick}
      aria-label={label}
    >
      Reset
    </Button>
  );
}

export function WidgetLauncherButtonSettingsForm({
  value,
  onChange,
  globalSettings,
  disabled = false,
  onPreviewLocaleChange,
  buttonTextError,
  tooltipTextError,
}: ButtonSettingsFormProps) {
  const isProjectLayer = Boolean(globalSettings);
  const effective = resolveLauncherSettings(value, globalSettings);
  const globalButtonText: LocalizedString | null =
    globalSettings?.widgetLauncherButton.buttonText ?? null;
  const globalTooltipText: LocalizedString | null =
    globalSettings?.widgetLauncherButton.tooltipText ?? null;
  const globalHoverScale = globalSettings?.widgetLauncherButton.enableHoverScaleEffect;

  const { vertical: verticalEdge, horizontal: horizontalEdge } = splitPosition(effective.position);

  const sizeUnit = effective.buttonSizeUnit;
  const offsetRange = SIZE_RANGES.offset[sizeUnit];
  const iconRange = SIZE_RANGES.icon[sizeUnit];

  // All unit-dependent sizes are rewritten so a project that only switches the
  // unit does not reinterpret the inherited numbers in the new unit.
  const handleSizeUnitChange = (nextUnit: SizeUnit) => {
    onChange({
      ...value,
      buttonSizeUnit: nextUnit,
      buttonOffsetX: convertSize(effective.buttonOffsetX, 'offset', sizeUnit, nextUnit),
      buttonOffsetY: convertSize(effective.buttonOffsetY, 'offset', sizeUnit, nextUnit),
      buttonIconSize: convertSize(effective.buttonIconSize, 'icon', sizeUnit, nextUnit),
    });
  };

  const clampOnBlur = (
    key: 'buttonOffsetX' | 'buttonOffsetY' | 'buttonIconSize',
    field: SizeField
  ) => {
    const current = value[key];
    if (current === undefined) return;
    const clamped = clampSize(current, field, sizeUnit);
    if (clamped !== current) onChange({ ...value, [key]: clamped });
  };

  const hoverDescription = !isProjectLayer
    ? 'Grow the button slightly when hovering over it.'
    : value.enableHoverScaleEffect === undefined
      ? `Uses the project default (${globalHoverScale ? 'on' : 'off'}).`
      : `${effective.enableHoverScaleEffect ? 'On' : 'Off'} for this project.`;

  return (
    <div className="space-y-4">
      <SettingRows>
        <SettingRowPair>
          <SettingRow
            label="Button Position"
            htmlFor="widget-position"
            controlClassName="@sm:w-56"
          >
            <Select
              value={effective.position}
              onValueChange={(val) =>
                onChange({
                  ...value,
                  position: val as 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
                })
              }
              disabled={disabled}
            >
              <SelectTrigger id="widget-position" className="w-full">
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Bottom Right</SelectItem>
                <SelectItem value="bottom-left">Bottom Left</SelectItem>
                <SelectItem value="top-right">Top Right</SelectItem>
                <SelectItem value="top-left">Top Left</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            label="Button Shape"
            htmlFor="widget-button-shape"
            controlClassName="@sm:w-56"
          >
            <Select
              value={effective.buttonShape}
              onValueChange={(val) =>
                onChange({ ...value, buttonShape: val as 'round' | 'rectangle' })
              }
              disabled={disabled}
            >
              <SelectTrigger id="widget-button-shape" className="w-full">
                <SelectValue placeholder="Select shape" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rectangle">Rectangle</SelectItem>
                <SelectItem value="round">Round</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </SettingRowPair>

        <SettingRow
          label="Size Unit"
          htmlFor="widget-size-unit"
          description="Used for the edge distance and icon size. rem scales with the root font size of the page the widget is embedded in."
          controlClassName="@sm:w-56"
        >
          <Select
            value={effective.buttonSizeUnit}
            onValueChange={(val) => handleSizeUnitChange(val as SizeUnit)}
            disabled={disabled}
          >
            <SelectTrigger id="widget-size-unit" className="w-full">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="px">px</SelectItem>
              <SelectItem value="rem">rem</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRowPair>
          <SettingRow
            label={`Distance from ${EDGE_LABELS[horizontalEdge]}`}
            htmlFor="widget-offset-x"
            description={describeRange('offset', sizeUnit)}
            controlClassName="@sm:w-56"
          >
            <Input
              id="widget-offset-x"
              type="number"
              min="0"
              max={offsetRange.max}
              step={offsetRange.step}
              value={effective.buttonOffsetX}
              onChange={(e) =>
                onChange({
                  ...value,
                  buttonOffsetX: parseSize(e.target.value),
                })
              }
              onBlur={() => clampOnBlur('buttonOffsetX', 'offset')}
              disabled={disabled}
            />
          </SettingRow>
          <SettingRow
            label={`Distance from ${EDGE_LABELS[verticalEdge]}`}
            htmlFor="widget-offset-y"
            description={describeRange('offset', sizeUnit)}
            controlClassName="@sm:w-56"
          >
            <Input
              id="widget-offset-y"
              type="number"
              min="0"
              max={offsetRange.max}
              step={offsetRange.step}
              value={effective.buttonOffsetY}
              onChange={(e) =>
                onChange({
                  ...value,
                  buttonOffsetY: parseSize(e.target.value),
                })
              }
              onBlur={() => clampOnBlur('buttonOffsetY', 'offset')}
              disabled={disabled}
            />
          </SettingRow>
        </SettingRowPair>

        <SettingRowPair>
          <SettingRow
            label="Icon Size"
            htmlFor="widget-icon-size"
            description={describeRange('icon', sizeUnit)}
            controlClassName="@sm:w-56"
          >
            <Input
              id="widget-icon-size"
              type="number"
              min={iconRange.min}
              max={iconRange.max}
              step={iconRange.step}
              value={effective.buttonIconSize}
              onChange={(e) =>
                onChange({
                  ...value,
                  buttonIconSize: parseSize(e.target.value),
                })
              }
              onBlur={() => clampOnBlur('buttonIconSize', 'icon')}
              disabled={disabled}
            />
          </SettingRow>
          <SettingRow
            label="Icon Stroke Width"
            htmlFor="widget-icon-stroke"
            description="1 to 3."
            controlClassName="@sm:w-56"
          >
            <Input
              id="widget-icon-stroke"
              type="number"
              min="1"
              max="3"
              step="0.5"
              value={effective.buttonIconStroke}
              onChange={(e) =>
                onChange({ ...value, buttonIconStroke: parseFloat(e.target.value) || undefined })
              }
              disabled={disabled}
            />
          </SettingRow>
        </SettingRowPair>

        <SettingRow
          label="Button Icon"
          htmlFor="widget-button-icon"
          description="Optional icon shown on the button."
          controlClassName="@sm:w-56"
        >
          <Select
            value={effective.buttonIcon ?? 'none'}
            onValueChange={(val) => onChange({ ...value, buttonIcon: val === 'none' ? null : val })}
            disabled={disabled}
          >
            <SelectTrigger id="widget-button-icon" className="w-full">
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
        </SettingRow>

        <div className="py-3">
          <LocalizedTextEditor
            layer={isProjectLayer ? 'project' : 'global'}
            value={value.buttonText}
            onChange={(next) => onChange({ ...value, buttonText: next })}
            label="Button Text"
            helpText="Leave empty to show only an icon. Toggle the switch to add a text."
            builtInPreview={
              isProjectLayer ? buildPerLocalePreview(globalButtonText, null) : undefined
            }
            disabled={disabled}
            onActiveLocaleChange={onPreviewLocaleChange}
            error={buttonTextError}
          />
        </div>

        <SettingRow
          label="Theme"
          htmlFor="widget-theme"
          description="Auto follows the page's color scheme."
          controlClassName="@sm:w-56"
        >
          <Select
            value={effective.theme}
            onValueChange={(val) => onChange({ ...value, theme: val as 'auto' | 'light' | 'dark' })}
            disabled={disabled}
          >
            <SelectTrigger id="widget-theme" className="w-full">
              <SelectValue placeholder="Select theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (Detect from page)</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRowPair>
          <SettingRow
            label="Hover Scale Effect"
            htmlFor="enable-hover-scale-effect"
            description={hoverDescription}
          >
            <div className="flex items-center gap-2">
              {isProjectLayer && !disabled && value.enableHoverScaleEffect !== undefined && (
                <ResetButton
                  label="Reset hover scale effect to the project default"
                  onClick={() => onChange({ ...value, enableHoverScaleEffect: undefined })}
                />
              )}
              <Switch
                id="enable-hover-scale-effect"
                checked={effective.enableHoverScaleEffect}
                onCheckedChange={(checked) =>
                  onChange({ ...value, enableHoverScaleEffect: checked })
                }
                disabled={disabled}
              />
            </div>
          </SettingRow>

          <SettingRow
            label="Show Tooltip"
            htmlFor="enable-tooltip"
            description="Show a tooltip when hovering over the button."
          >
            <div className="flex items-center gap-2">
              {isProjectLayer && !disabled && value.tooltipEnabled !== undefined && (
                <ResetButton
                  label="Reset tooltip to the project default"
                  onClick={() =>
                    onChange({ ...value, tooltipEnabled: undefined, tooltipText: undefined })
                  }
                />
              )}
              <Switch
                id="enable-tooltip"
                checked={effective.tooltipEnabled}
                onCheckedChange={(checked) => onChange({ ...value, tooltipEnabled: checked })}
                disabled={disabled}
              />
            </div>
          </SettingRow>
        </SettingRowPair>

        <div
          aria-disabled={!effective.tooltipEnabled || undefined}
          inert={!effective.tooltipEnabled}
          className={cn('py-3', !effective.tooltipEnabled && 'section-disabled')}
        >
          <LocalizedTextEditor
            layer={isProjectLayer ? 'project' : 'global'}
            value={value.tooltipText}
            onChange={(next) => onChange({ ...value, tooltipText: next })}
            label="Tooltip Text"
            helpText="Text shown in the tooltip on hover. Toggle the switch to override the tooltip text."
            builtInPreview={
              isProjectLayer
                ? buildPerLocalePreview(globalTooltipText, TOOLTIP_BUILTIN_PREVIEW)
                : TOOLTIP_BUILTIN_PREVIEW
            }
            disabled={disabled}
            onActiveLocaleChange={onPreviewLocaleChange}
            englishRequired={false}
            error={tooltipTextError}
          />
        </div>

        <div className="space-y-3 pt-4">
          <h4 className="text-sm font-medium">Colors</h4>
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
          />
        </div>
      </SettingRows>
    </div>
  );
}
