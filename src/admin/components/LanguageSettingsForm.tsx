import { SUPPORTED_LOCALES } from '@shared/types';
import type { LocaleCode, ProjectLanguageSettings } from '@shared/types';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { SettingRow, SettingRows } from './ui/setting-row';

export const DEFAULT_LANGUAGE_SETTINGS: ProjectLanguageSettings = {
  mode: 'auto',
  defaultLanguage: 'en',
};

const LOCALE_DISPLAY_LABELS: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  es: 'Español',
  it: 'Italiano',
  ja: '日本語 (JP)',
  zh: '中文 (简体) (CN)',
};

interface LanguageSettingsFormProps {
  value: ProjectLanguageSettings;
  onChange: (value: ProjectLanguageSettings) => void;
  disabled?: boolean;
}

export function LanguageSettingsForm({
  value,
  onChange,
  disabled = false,
}: LanguageSettingsFormProps) {
  return (
    <SettingRows>
      <SettingRow
        label="Language Mode"
        description="Auto detects each visitor's language from the page or browser. Manual locks the widget and reporter emails to one language."
      >
        <div role="radiogroup" aria-label="Language mode" className="flex gap-2">
          <Button
            type="button"
            variant={value.mode === 'auto' ? 'default' : 'outline'}
            role="radio"
            aria-checked={value.mode === 'auto'}
            onClick={() => onChange({ ...value, mode: 'auto' })}
            disabled={disabled}
          >
            Auto-detect
          </Button>
          <Button
            type="button"
            variant={value.mode === 'manual' ? 'default' : 'outline'}
            role="radio"
            aria-checked={value.mode === 'manual'}
            onClick={() => onChange({ ...value, mode: 'manual' })}
            disabled={disabled}
          >
            Manual (locked)
          </Button>
        </div>
      </SettingRow>
      <SettingRow
        label="Default Language"
        htmlFor="default-language"
        description="The fallback in auto mode, or the locked language in manual mode."
        controlClassName="@sm:w-56"
      >
        <Select
          value={value.defaultLanguage}
          disabled={disabled}
          onValueChange={(next) => {
            // Radix emits an empty value when its hidden native select resets; ignore it.
            if (next) onChange({ ...value, defaultLanguage: next as LocaleCode });
          }}
        >
          <SelectTrigger id="default-language" className="w-full">
            <SelectValue placeholder="Select default language" />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((code) => (
              <SelectItem key={code} value={code}>
                {LOCALE_DISPLAY_LABELS[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
    </SettingRows>
  );
}
