import { useState } from 'react';
import { z } from 'zod';
import { useDraft, useSettings, useUpdateSettings } from '../../hooks/useSettings';
import {
  SectionCard,
  SectionLoading,
  ResetToDefaultButton,
} from '../../components/settings/SectionCard';
import { WidgetLauncherButtonSettingsForm } from '../../components/WidgetLauncherButtonSettingsForm';
import {
  LauncherPreviewCard,
  useColorMode,
  SettingsWithPreview,
} from '../../components/widget/WidgetSettingsLayout';
import { changedFields } from '../../lib/changedFields';
import type { ColorMode } from '../../components/ThemeColorPicker';
import type {
  LocaleCode,
  GlobalWidgetLauncherButtonSettings,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

const localizedStringWithEnSchema = z.object({
  en: z.string().trim().min(1, 'English value is required'),
  de: z.string().optional(),
  fr: z.string().optional(),
  nl: z.string().optional(),
  es: z.string().optional(),
  it: z.string().optional(),
  ja: z.string().optional(),
  zh: z.string().optional(),
});

const localizedStringSchema = z.object({
  en: z.string(),
  de: z.string().optional(),
  fr: z.string().optional(),
  nl: z.string().optional(),
  es: z.string().optional(),
  it: z.string().optional(),
  ja: z.string().optional(),
  zh: z.string().optional(),
});

const buttonSettingsSchema = z.object({
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  buttonText: z.union([z.null(), localizedStringWithEnSchema]),
  buttonShape: z.enum(['round', 'rectangle']),
  buttonIcon: z.string().nullable(),
  buttonIconSize: z.number(),
  buttonIconStroke: z.number(),
  buttonOffsetX: z.number().min(0).max(200),
  buttonOffsetY: z.number().min(0).max(200),
  buttonSizeUnit: z.enum(['px', 'rem']),
  theme: z.enum(['auto', 'light', 'dark']),
  enableHoverScaleEffect: z.boolean(),
  tooltipEnabled: z.boolean(),
  tooltipText: z.union([z.null(), localizedStringSchema]),
  lightButtonColor: z.string(),
  lightTextColor: z.string(),
  lightButtonHoverColor: z.string(),
  lightTextHoverColor: z.string(),
  darkButtonColor: z.string(),
  darkTextColor: z.string(),
  darkButtonHoverColor: z.string(),
  darkTextHoverColor: z.string(),
});

type ButtonSettingsFormValues = z.infer<typeof buttonSettingsSchema>;

// Compile-time guard that the schema stays structurally identical to the shared interface.
const _typeCheck: ButtonSettingsFormValues = {} as GlobalWidgetLauncherButtonSettings;
const _typeCheckReverse: GlobalWidgetLauncherButtonSettings = {} as ButtonSettingsFormValues;
void _typeCheck;
void _typeCheckReverse;

type ColorKey =
  | 'lightButtonColor'
  | 'lightTextColor'
  | 'lightButtonHoverColor'
  | 'lightTextHoverColor'
  | 'darkButtonColor'
  | 'darkTextColor'
  | 'darkButtonHoverColor'
  | 'darkTextHoverColor';

const DEFAULT_GENERAL_SETTINGS: Omit<ButtonSettingsFormValues, ColorKey> = {
  position: 'bottom-right',
  buttonText: null,
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 24,
  buttonIconStroke: 2,
  buttonOffsetX: 20,
  buttonOffsetY: 20,
  buttonSizeUnit: 'px',
  theme: 'auto',
  enableHoverScaleEffect: true,
  tooltipEnabled: true,
  tooltipText: null,
};

const DEFAULT_COLORS: Record<ColorMode, Partial<ButtonSettingsFormValues>> = {
  light: {
    lightButtonColor: '#02658D',
    lightTextColor: '#ffffff',
    lightButtonHoverColor: '#024F6F',
    lightTextHoverColor: '#ffffff',
  },
  dark: {
    darkButtonColor: '#02658D',
    darkTextColor: '#ffffff',
    darkButtonHoverColor: '#036F9B',
    darkTextHoverColor: '#ffffff',
  },
};

export function Button() {
  const { data: settings, isLoading } = useSettings();

  if (isLoading || !settings?.widgetLauncherButton) {
    return (
      <SectionCard section="launcher" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  return <ButtonSettingsForm saved={settings.widgetLauncherButton} />;
}

function ButtonSettingsForm({ saved }: { saved: ButtonSettingsFormValues }) {
  const draft = useDraft<ButtonSettingsFormValues>(saved);
  const value = draft.value ?? saved;
  const [showErrors, setShowErrors] = useState(false);
  const [previewLocale, setPreviewLocale] = useState<LocaleCode>('en');
  const [colorMode, setColorMode] = useColorMode();
  const mutation = useUpdateSettings({
    successMessage: 'Widget button settings saved successfully',
  });

  const handleFormChange = (next: WidgetLauncherButtonSettings) => {
    draft.patch(changedFields<ButtonSettingsFormValues>(next, value, { skipUndefined: true }));
  };

  const save = async () => {
    if (!buttonSettingsSchema.safeParse(value).success) {
      setShowErrors(true);
      return false;
    }
    await mutation.mutateAsync({ widgetLauncherButton: draft.changes });
    draft.reset();
    setShowErrors(false);
    return true;
  };

  const discard = () => {
    draft.reset();
    setShowErrors(false);
  };

  const buttonTextError =
    showErrors && value.buttonText && !value.buttonText.en.trim()
      ? 'English value is required'
      : undefined;

  return (
    <Tabs defaultValue="general" className="space-y-6">
      <UnsavedChangesGuard isDirty={draft.isDirty} onSave={save} onDiscard={discard} />
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="colors">Colors</TabsTrigger>
      </TabsList>
      <SettingsWithPreview
        preview={<LauncherPreviewCard launcher={value} locale={previewLocale} mode={colorMode} />}
      >
        <TabsContent value="general" forceMount className="mt-0">
          <SectionCard section="launcher" showHeader={false}>
            <div className="space-y-6">
              <WidgetLauncherButtonSettingsForm
                value={value}
                onChange={handleFormChange}
                buttonTextError={buttonTextError}
                onPreviewLocaleChange={setPreviewLocale}
              />
              <ResetToDefaultButton
                onReset={() => handleFormChange(DEFAULT_GENERAL_SETTINGS)}
                disabled={mutation.isPending}
              />
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="colors" forceMount className="mt-0">
          <SectionCard section="launcherColors" showHeader={false}>
            <div className="space-y-6">
              <WidgetLauncherButtonSettingsForm
                part="colors"
                value={value}
                onChange={handleFormChange}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
              />
              <ResetToDefaultButton
                label={colorMode === 'dark' ? 'Reset to Dark Default' : 'Reset to Light Default'}
                onReset={() => handleFormChange(DEFAULT_COLORS[colorMode])}
                disabled={mutation.isPending}
              />
            </div>
          </SectionCard>
        </TabsContent>
      </SettingsWithPreview>
    </Tabs>
  );
}
