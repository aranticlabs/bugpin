import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  SectionCard,
  SectionLoading,
  SettingsFormActions,
} from '../../components/settings/SectionCard';
import { WidgetLauncherButtonSettingsForm } from '../../components/WidgetLauncherButtonSettingsForm';
import {
  LauncherPreviewCard,
  SettingsWithPreview,
} from '../../components/widget/WidgetSettingsLayout';
import type {
  AppSettings,
  LocaleCode,
  GlobalWidgetLauncherButtonSettings,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { submitForm } from '../../lib/submitForm';

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

const DEFAULT_BUTTON_SETTINGS: ButtonSettingsFormValues = {
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
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  enableHoverScaleEffect: true,
  tooltipEnabled: true,
  tooltipText: null,
};

export function Button() {
  return <WidgetLauncherButtonSettingsSection />;
}

function WidgetLauncherButtonSettingsSection() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  if (isLoading || !settings?.widgetLauncherButton) {
    return (
      <SectionCard section="launcher" showHeader={false}>
        <SectionLoading />
      </SectionCard>
    );
  }

  return <ButtonSettingsForm initialValues={settings.widgetLauncherButton} />;
}

function ButtonSettingsForm({ initialValues }: { initialValues: ButtonSettingsFormValues }) {
  const queryClient = useQueryClient();
  const {
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ButtonSettingsFormValues>({
    resolver: zodResolver(buttonSettingsSchema),
    defaultValues: initialValues,
    mode: 'onSubmit',
  });

  const watched = watch();

  const [previewLocale, setPreviewLocale] = useState<LocaleCode>('en');

  const mutation = useMutation({
    mutationFn: async (data: ButtonSettingsFormValues) => {
      const response = await api.put('/settings', { widgetLauncherButton: data });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      reset(variables);
      toast.success('Widget button settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleFormChange = (partial: WidgetLauncherButtonSettings) => {
    for (const key of Object.keys(partial) as Array<keyof WidgetLauncherButtonSettings>) {
      const next = partial[key];
      if (next === undefined) continue;
      setValue(key as keyof ButtonSettingsFormValues, next as never, {
        shouldDirty: true,
        shouldValidate: false,
      });
    }
  };

  const onValid = (data: ButtonSettingsFormValues) => {
    mutation.mutate(data);
  };

  const handleReset = () => {
    handleFormChange(DEFAULT_BUTTON_SETTINGS);
  };

  const buttonTextError =
    errors.buttonText?.message ??
    (errors.buttonText as { en?: { message?: string } } | undefined)?.en?.message;

  return (
    <SettingsWithPreview
      preview={<LauncherPreviewCard launcher={watched} locale={previewLocale} />}
    >
      <SectionCard section="launcher" showHeader={false}>
        <UnsavedChangesGuard
          isDirty={isDirty}
          onSave={() => submitForm(handleSubmit, (data) => mutation.mutateAsync(data))}
        />
        <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-6">
          <WidgetLauncherButtonSettingsForm
            value={watched}
            onChange={handleFormChange}
            buttonTextError={buttonTextError}
            onPreviewLocaleChange={setPreviewLocale}
          />
          <SettingsFormActions
            isPending={mutation.isPending}
            isDirty={isDirty}
            onReset={handleReset}
          />
        </form>
      </SectionCard>
    </SettingsWithPreview>
  );
}
