import type { WidgetLauncherButtonSettings } from '@shared/types';
import type { ResolvedLauncherSettings } from './resolveLauncherSettings';
import { clampSize, type SizeField } from './sizing';

export interface LauncherFieldsProps {
  value: WidgetLauncherButtonSettings;
  effective: ResolvedLauncherSettings;
  onChange: (value: WidgetLauncherButtonSettings) => void;
  disabled: boolean;
}

// Values are clamped on blur rather than on every keystroke, so partial input
// such as "2" on the way to "24" is not snapped to the minimum.
export function clampSizeOnBlur(
  { value, effective, onChange }: LauncherFieldsProps,
  key: 'buttonOffsetX' | 'buttonOffsetY' | 'buttonIconSize',
  field: SizeField
) {
  const current = value[key];
  if (current === undefined) return;
  const clamped = clampSize(current, field, effective.buttonSizeUnit);
  if (clamped !== current) onChange({ ...value, [key]: clamped });
}
