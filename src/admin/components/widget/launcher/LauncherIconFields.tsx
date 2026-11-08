import type { LocaleCode, LocalizedString } from '@shared/types';
import { buildPerLocalePreview } from '../../../lib/localizedPreview';
import { LocalizedTextEditor } from '../../i18n/LocalizedTextEditor';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { SettingRow, SettingRowPair } from '../../ui/setting-row';
import { AVAILABLE_ICONS } from './constants';
import { clampSizeOnBlur, type LauncherFieldsProps } from './fields';
import { SIZE_RANGES, describeRange, parseSize } from './sizing';

interface LauncherIconFieldsProps extends LauncherFieldsProps {
  isProjectLayer: boolean;
  globalButtonText: LocalizedString | null;
  onPreviewLocaleChange?: (locale: LocaleCode) => void;
  buttonTextError?: string;
}

export function LauncherIconFields(props: LauncherIconFieldsProps) {
  const {
    value,
    effective,
    onChange,
    disabled,
    isProjectLayer,
    globalButtonText,
    onPreviewLocaleChange,
    buttonTextError,
  } = props;
  const sizeUnit = effective.buttonSizeUnit;
  const iconRange = SIZE_RANGES.icon[sizeUnit];

  return (
    <>
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
            onBlur={() => clampSizeOnBlur(props, 'buttonIconSize', 'icon')}
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
    </>
  );
}
