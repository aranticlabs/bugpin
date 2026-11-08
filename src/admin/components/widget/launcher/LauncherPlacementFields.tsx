import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { SettingRow, SettingRowPair } from '../../ui/setting-row';
import { clampSizeOnBlur, type LauncherFieldsProps } from './fields';
import {
  EDGE_LABELS,
  SIZE_RANGES,
  convertSize,
  describeRange,
  parseSize,
  splitPosition,
  type SizeUnit,
} from './sizing';

export function LauncherPlacementFields(props: LauncherFieldsProps) {
  const { value, effective, onChange, disabled } = props;
  const { vertical: verticalEdge, horizontal: horizontalEdge } = splitPosition(effective.position);
  const sizeUnit = effective.buttonSizeUnit;
  const offsetRange = SIZE_RANGES.offset[sizeUnit];

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

  return (
    <>
      <SettingRowPair>
        <SettingRow label="Button Position" htmlFor="widget-position" controlClassName="@sm:w-56">
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
        <SettingRow label="Button Shape" htmlFor="widget-button-shape" controlClassName="@sm:w-56">
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
            onBlur={() => clampSizeOnBlur(props, 'buttonOffsetX', 'offset')}
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
            onBlur={() => clampSizeOnBlur(props, 'buttonOffsetY', 'offset')}
            disabled={disabled}
          />
        </SettingRow>
      </SettingRowPair>
    </>
  );
}
