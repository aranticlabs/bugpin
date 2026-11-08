import type { LocaleCode, LocalizedString } from '@shared/types';
import { cn } from '../../../lib/utils';
import { buildPerLocalePreview } from '../../../lib/localizedPreview';
import { LocalizedTextEditor } from '../../i18n/LocalizedTextEditor';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { SettingRow, SettingRowPair } from '../../ui/setting-row';
import { Switch } from '../../ui/switch';
import { TOOLTIP_BUILTIN_PREVIEW } from './constants';
import type { LauncherFieldsProps } from './fields';

interface LauncherBehaviorFieldsProps extends LauncherFieldsProps {
  isProjectLayer: boolean;
  globalTooltipText: LocalizedString | null;
  globalHoverScale: boolean | undefined;
  onPreviewLocaleChange?: (locale: LocaleCode) => void;
  tooltipTextError?: string;
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

export function LauncherBehaviorFields({
  value,
  effective,
  onChange,
  disabled,
  isProjectLayer,
  globalTooltipText,
  globalHoverScale,
  onPreviewLocaleChange,
  tooltipTextError,
}: LauncherBehaviorFieldsProps) {
  const hoverDescription = !isProjectLayer
    ? 'Grow the button slightly when hovering over it.'
    : value.enableHoverScaleEffect === undefined
      ? `Uses the project default (${globalHoverScale ? 'on' : 'off'}).`
      : `${effective.enableHoverScaleEffect ? 'On' : 'Off'} for this project.`;

  return (
    <>
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
              onCheckedChange={(checked) => onChange({ ...value, enableHoverScaleEffect: checked })}
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
    </>
  );
}
