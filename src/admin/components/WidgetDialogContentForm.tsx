import type {
  GlobalWidgetDialogContentSettings,
  LocaleCode,
  LocalizedString,
  WidgetDialogContentSettings,
} from '@shared/types';
import { LocalizedTextEditor } from './i18n/LocalizedTextEditor';
import { Button } from './ui/button';
import { SettingRow, SettingRows } from './ui/setting-row';
import { Switch } from './ui/switch';
import {
  buildPerLocalePreview,
  resolveForPreview,
  type BuiltinTexts,
} from '../lib/localizedPreview';

export type DialogTextKey =
  'title' | 'titlePlaceholder' | 'descriptionPlaceholder' | 'submitButtonText';

// Copies of the widget's built-in translations, shown until a custom text is set.
const DIALOG_TEXT_BUILTIN: Record<DialogTextKey, BuiltinTexts> = {
  title: {
    en: 'Report a Bug',
    de: 'Bug melden',
    fr: 'Signaler un bug',
    nl: 'Een bug melden',
    es: 'Informar de un error',
    it: 'Segnala un bug',
    ja: 'バグを報告',
    zh: '缺陷报告',
  },
  titlePlaceholder: {
    en: 'Brief description of the issue',
    de: 'Kurze Beschreibung des Problems',
    fr: 'Brève description du problème',
    nl: 'Korte beschrijving van het probleem',
    es: 'Breve descripción del problema',
    it: 'Breve descrizione del problema',
    ja: '問題の概要を簡潔に',
    zh: '简要描述问题',
  },
  descriptionPlaceholder: {
    en: 'Steps to reproduce, expected behavior, etc.',
    de: 'Schritte zur Reproduktion, erwartetes Verhalten usw.',
    fr: 'Étapes de reproduction, comportement attendu, etc.',
    nl: 'Stappen om dit probleem te herhalen, verwacht gedrag, etc.',
    es: 'Pasos para reproducirlo, comportamiento esperado, etc.',
    it: 'Passaggi per riprodurre, comportamento atteso, ecc.',
    ja: '再現手順、期待される動作など',
    zh: '复现步骤、预期行为等',
  },
  submitButtonText: {
    en: 'Submit Report',
    de: 'Bericht senden',
    fr: 'Envoyer le rapport',
    nl: 'Rapport verzenden',
    es: 'Enviar informe',
    it: 'Invia segnalazione',
    ja: 'レポートを送信',
    zh: '提交缺陷报告',
  },
};

const DIALOG_TEXT_FIELDS: { key: DialogTextKey; label: string; helpText: string }[] = [
  {
    key: 'title',
    label: 'Dialog Title',
    helpText: 'Heading at the top of the dialog.',
  },
  {
    key: 'titlePlaceholder',
    label: 'Title Placeholder',
    helpText: 'Hint shown in the empty Title field.',
  },
  {
    key: 'descriptionPlaceholder',
    label: 'Description Placeholder',
    helpText: 'Hint shown in the empty Description field.',
  },
  {
    key: 'submitButtonText',
    label: 'Submit Button Text',
    helpText: 'Label of the button that sends the report.',
  },
];

export const DEFAULT_DIALOG_CONTENT: GlobalWidgetDialogContentSettings = {
  title: null,
  titlePlaceholder: null,
  descriptionPlaceholder: null,
  submitButtonText: null,
  showPriority: true,
};

export interface DialogContentPreview {
  title: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  submitButtonText: string;
  showPriority: boolean;
}

export function resolveDialogContentPreview(
  value: WidgetDialogContentSettings,
  global: GlobalWidgetDialogContentSettings | undefined,
  locale: LocaleCode
): DialogContentPreview {
  const text = (key: DialogTextKey) => {
    const builtin = DIALOG_TEXT_BUILTIN[key];
    const project = global ? value[key] : undefined;
    const fallback = global ? global[key] : (value[key] ?? null);
    return (
      resolveForPreview(project, fallback, builtin, locale) ?? builtin[locale] ?? builtin.en ?? ''
    );
  };
  return {
    title: text('title'),
    titlePlaceholder: text('titlePlaceholder'),
    descriptionPlaceholder: text('descriptionPlaceholder'),
    submitButtonText: text('submitButtonText'),
    showPriority: value.showPriority ?? global?.showPriority ?? true,
  };
}

// A custom text needs its English value; the server rejects one without it.
export function dialogContentErrors(
  value: WidgetDialogContentSettings
): Partial<Record<DialogTextKey, string>> {
  const errors: Partial<Record<DialogTextKey, string>> = {};
  for (const { key } of DIALOG_TEXT_FIELDS) {
    const text = value[key];
    if (text && !text.en.trim()) errors[key] = 'English text is required';
  }
  return errors;
}

interface WidgetDialogContentFormProps {
  value: WidgetDialogContentSettings;
  onChange: (value: WidgetDialogContentSettings) => void;
  globalContent?: GlobalWidgetDialogContentSettings;
  disabled?: boolean;
  errors?: Partial<Record<DialogTextKey, string>>;
  onPreviewLocaleChange?: (locale: LocaleCode) => void;
}

export function WidgetDialogContentForm({
  value,
  onChange,
  globalContent,
  disabled = false,
  errors,
  onPreviewLocaleChange,
}: WidgetDialogContentFormProps) {
  const isProjectLayer = Boolean(globalContent);
  const showPriority = value.showPriority ?? globalContent?.showPriority ?? true;
  const editor = ({ key, label, helpText }: (typeof DIALOG_TEXT_FIELDS)[number]) => (
    <div key={key} className="py-3">
      <LocalizedTextEditor
        layer={isProjectLayer ? 'project' : 'global'}
        value={value[key]}
        onChange={(next: LocalizedString | null | undefined) => onChange({ ...value, [key]: next })}
        label={label}
        helpText={helpText}
        builtInPreview={
          globalContent
            ? buildPerLocalePreview(globalContent[key], DIALOG_TEXT_BUILTIN[key])
            : DIALOG_TEXT_BUILTIN[key]
        }
        disabled={disabled}
        onActiveLocaleChange={onPreviewLocaleChange}
        error={errors?.[key]}
      />
    </div>
  );
  const submitField = DIALOG_TEXT_FIELDS.find((field) => field.key === 'submitButtonText');

  return (
    <SettingRows>
      {DIALOG_TEXT_FIELDS.filter((field) => field !== submitField).map(editor)}
      <SettingRow
        label="Show Priority"
        htmlFor="dialog-show-priority"
        description="Let reporters pick a priority. When hidden, reports are created with Medium."
      >
        <div className="flex items-center gap-2">
          {isProjectLayer && !disabled && value.showPriority !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => onChange({ ...value, showPriority: undefined })}
              aria-label="Reset priority to the project default"
            >
              Reset
            </Button>
          )}
          <Switch
            id="dialog-show-priority"
            checked={showPriority}
            onCheckedChange={(checked) => onChange({ ...value, showPriority: checked })}
            disabled={disabled}
          />
        </div>
      </SettingRow>
      {submitField && editor(submitField)}
    </SettingRows>
  );
}
