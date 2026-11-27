import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button as UIButton } from '../../components/ui/button';
import { RotateCcw } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { WidgetLauncherButtonSettingsForm } from '../../components/WidgetLauncherButtonSettingsForm';
import { SUPPORTED_LOCALES } from '@shared/types';
import type {
  AppSettings,
  GlobalWidgetLauncherButtonSettings,
  LocaleCode,
  WidgetLauncherButtonSettings,
} from '@shared/types';

const optionalLocaleFields = Object.fromEntries(
  SUPPORTED_LOCALES.filter((code) => code !== 'en').map((code) => [code, z.string().optional()])
) as Record<Exclude<LocaleCode, 'en'>, z.ZodOptional<z.ZodString>>;

const localizedStringWithEnSchema = z.object({
  en: z.string().trim().min(1, 'English value is required'),
  ...optionalLocaleFields,
});

const localizedStringSchema = z.object({
  en: z.string(),
  ...optionalLocaleFields,
});

const buttonSettingsSchema = z.object({
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']),
  buttonText: z.union([z.null(), localizedStringWithEnSchema]),
  buttonShape: z.enum(['round', 'rectangle']),
  buttonIcon: z.string().nullable(),
  buttonIconSize: z.number(),
  buttonIconStroke: z.number(),
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
      <Card className="max-w-4xl">
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
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
    formState: { errors },
  } = useForm<ButtonSettingsFormValues>({
    resolver: zodResolver(buttonSettingsSchema),
    defaultValues: initialValues,
    mode: 'onSubmit',
  });

  const watched = watch();

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
    reset(DEFAULT_BUTTON_SETTINGS);
  };

  const buttonTextError =
    errors.buttonText?.message ??
    (errors.buttonText as { en?: { message?: string } } | undefined)?.en?.message;

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Widget Button Settings</CardTitle>
        <CardDescription>
          Configure the appearance and behavior of the floating widget launcher button.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onValid)} noValidate>
        <CardContent className="space-y-4">
          <WidgetLauncherButtonSettingsForm
            value={watched}
            onChange={handleFormChange}
            buttonTextError={buttonTextError}
          />

          <div className="flex gap-2 pt-4 border-t">
            <UIButton type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </UIButton>
            <UIButton
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={mutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </UIButton>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
