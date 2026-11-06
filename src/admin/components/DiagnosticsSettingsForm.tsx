import { Lock } from 'lucide-react';
import { DEFAULT_DIAGNOSTIC_SETTINGS, type DiagnosticSettings } from '@shared/types';
import { Switch } from './ui/switch';
import { SettingRow, SettingRows } from './ui/setting-row';

type DiagnosticKey = keyof DiagnosticSettings;

interface DiagnosticsSettingsFormProps {
  value: Partial<DiagnosticSettings>;
  onChange: (value: Partial<DiagnosticSettings>) => void;
  /** Values used for settings the form value leaves unset. */
  defaults?: DiagnosticSettings;
  euPrivacyMode?: boolean;
  disabled?: boolean;
}

export function resolveDiagnosticSettings(
  value: Partial<DiagnosticSettings>,
  defaults: DiagnosticSettings = DEFAULT_DIAGNOSTIC_SETTINGS
): DiagnosticSettings {
  return {
    activityCapture: value.activityCapture ?? defaults.activityCapture,
    consoleCapture: value.consoleCapture ?? defaults.consoleCapture,
    networkCapture: value.networkCapture ?? defaults.networkCapture,
    storageKeysCapture: value.storageKeysCapture ?? defaults.storageKeysCapture,
  };
}

export function DiagnosticsSettingsForm({
  value,
  onChange,
  defaults,
  euPrivacyMode = false,
  disabled = false,
}: DiagnosticsSettingsFormProps) {
  const effective = resolveDiagnosticSettings(value, defaults);
  const options: { key: DiagnosticKey; label: string; description: string }[] = [
    {
      key: 'activityCapture',
      label: 'User activity trail',
      description: euPrivacyMode
        ? 'Disabled for every project by EU Privacy Mode.'
        : 'Button, link, and other interactive actions. Typed values are not recorded.',
    },
    {
      key: 'consoleCapture',
      label: 'Console output',
      description: 'Browser errors and warnings captured while the widget is active.',
    },
    {
      key: 'networkCapture',
      label: 'Network failures',
      description: 'Failed request URLs, methods, and response statuses.',
    },
    {
      key: 'storageKeysCapture',
      label: 'Storage key names',
      description: 'Cookie and browser-storage key names only. Off by default.',
    },
  ];

  return (
    <SettingRows>
      {options.map((option) => {
        const lockedByPrivacy = option.key === 'activityCapture' && euPrivacyMode;
        return (
          <SettingRow
            key={option.key}
            label={option.label}
            htmlFor={`diagnostic-${option.key}`}
            description={
              lockedByPrivacy ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {option.description}
                </span>
              ) : (
                option.description
              )
            }
          >
            <Switch
              id={`diagnostic-${option.key}`}
              checked={lockedByPrivacy ? false : effective[option.key]}
              disabled={disabled || lockedByPrivacy}
              onCheckedChange={(checked) => onChange({ ...value, [option.key]: checked })}
            />
          </SettingRow>
        );
      })}
    </SettingRows>
  );
}
