import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '../../components/ui/card';
import { SettingsCard } from '../../components/ui/settings-card';
import { Input } from '../../components/ui/input';
import { SettingRow, SettingRows } from '../../components/ui/setting-row';
import { Spinner } from '../../components/ui/spinner';
import { Switch } from '../../components/ui/switch';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { submitForm } from '../../lib/submitForm';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';

const settingsSchema = z
  .object({
    appName: z
      .string()
      .trim()
      .min(1, 'Application name is required')
      .max(100, 'Application name must be 100 characters or less'),
    appUrl: z.string().trim().url('Please enter a valid URL').or(z.literal('')),
    portalBaseUrl: z.string().trim().url('Please enter a valid URL').or(z.literal('')),
    updateCheckEnabled: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.portalBaseUrl && !/^https?:\/\//i.test(values.appUrl))
      context.addIssue({
        code: 'custom',
        path: ['appUrl'],
        message: 'A valid Application URL is required while a Portal Base URL is configured',
      });
  });

type SettingsFormData = z.infer<typeof settingsSchema>;

const retentionSchema = z.object({
  retentionDays: z
    .number({ error: 'Enter a number of days' })
    .int('Enter a whole number of days')
    .min(0, 'Must be 0 or more')
    .max(3650, 'Must be 3650 or less'),
});

type RetentionFormData = z.infer<typeof retentionSchema>;

/** Only the fields the user changed, so a save never overwrites settings edited elsewhere. */
function dirtyValues<T extends object>(
  data: T,
  dirtyFields: Partial<Record<keyof T, unknown>>
): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(data) as (keyof T)[]) {
    if (dirtyFields[key]) changes[key] = data[key];
  }
  return changes;
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-12">
        <Spinner className="mx-auto text-primary" />
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const saved = useMemo<SettingsFormData | undefined>(
    () =>
      settings && {
        appName: settings.appName || '',
        appUrl: settings.appUrl || '',
        portalBaseUrl: settings.portalBaseUrl || '',
        updateCheckEnabled: settings.updateCheckEnabled ?? true,
      },
    [settings]
  );
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      appName: '',
      appUrl: '',
      portalBaseUrl: '',
      updateCheckEnabled: true,
    },
    // Reloaded settings replace only the fields the user has not edited.
    values: saved,
    resetOptions: { keepDirtyValues: true },
  });

  const mutation = useUpdateSettings({ successMessage: 'Settings saved successfully' });

  // Saved values become the new baseline at once, so the save bar closes without waiting for the
  // settings to reload.
  const saveForm = async (data: SettingsFormData) => {
    await mutation.mutateAsync(dirtyValues(data, dirtyFields));
    void queryClient.invalidateQueries({ queryKey: ['version'] });
    reset(data);
  };

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <UnsavedChangesGuard
        isDirty={isDirty}
        onSave={() => submitForm(handleSubmit, saveForm).catch(() => false)}
        onDiscard={() => reset()}
      />
      <CardContent className="pt-6">
        <SettingRows>
          <SettingRow
            label={
              <>
                Application Name <span className="text-destructive">*</span>
              </>
            }
            htmlFor="app-name"
            description="Used as the sender name in email notifications."
            controlClassName="@sm:w-80"
          >
            <Input
              id="app-name"
              placeholder="BugPin"
              {...register('appName')}
              aria-invalid={!!errors.appName}
            />
            {errors.appName && <p className="text-xs text-destructive">{errors.appName.message}</p>}
          </SettingRow>
          <SettingRow
            label="Application URL"
            htmlFor="app-url"
            description="Used for links in email notifications and GitHub issues."
            controlClassName="@sm:w-80"
          >
            <Input
              id="app-url"
              type="url"
              placeholder="https://bugpin.example.com"
              {...register('appUrl')}
              aria-invalid={!!errors.appUrl}
            />
            {errors.appUrl && <p className="text-xs text-destructive">{errors.appUrl.message}</p>}
          </SettingRow>
          <SettingRow
            label="Portal Base URL"
            htmlFor="portal-base-url"
            description="Optional separate origin for the Reporter Portal. Requires an Application URL on a different host. Leave blank to use the Application URL."
            controlClassName="@sm:w-80"
          >
            <Input
              id="portal-base-url"
              type="url"
              placeholder="https://feedback.example.com"
              {...register('portalBaseUrl')}
              aria-invalid={!!errors.portalBaseUrl}
            />
            {errors.portalBaseUrl && (
              <p className="text-xs text-destructive">{errors.portalBaseUrl.message}</p>
            )}
          </SettingRow>
          <SettingRow
            label="Check for Updates"
            htmlFor="update-check"
            description="Checks once a day for new releases and shows administrators a banner when an update is available."
          >
            <Controller
              control={control}
              name="updateCheckEnabled"
              render={({ field }) => (
                <Switch id="update-check" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </SettingRow>
        </SettingRows>
      </CardContent>
    </Card>
  );
}

export function DataRetention() {
  const { data: settings, isLoading } = useSettings();
  const saved = useMemo<RetentionFormData | undefined>(
    () => settings && { retentionDays: settings.retentionDays ?? 90 },
    [settings]
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<RetentionFormData>({
    resolver: zodResolver(retentionSchema),
    defaultValues: { retentionDays: 90 },
    values: saved,
    resetOptions: { keepDirtyValues: true },
  });

  const mutation = useUpdateSettings({ successMessage: 'Data retention saved' });

  const saveRetention = async (data: RetentionFormData) => {
    await mutation.mutateAsync({ retentionDays: data.retentionDays });
    reset(data);
  };

  if (isLoading) return <LoadingCard />;

  return (
    <SettingsCard
      title="Data Retention"
      description="How long reports and their files are kept. Conversations and their files are deleted with their report."
    >
      <UnsavedChangesGuard
        isDirty={isDirty}
        onSave={() => submitForm(handleSubmit, saveRetention).catch(() => false)}
        onDiscard={() => reset()}
      />
      <SettingRows>
        <SettingRow
          label={
            <>
              Retention Period <span className="text-destructive">*</span>
            </>
          }
          htmlFor="retention-days"
          description="Days to keep bug reports before they are deleted automatically. Up to 3650 days, 0 keeps them forever."
          controlClassName="@sm:w-28"
        >
          <Input
            id="retention-days"
            type="number"
            min={0}
            max={3650}
            {...register('retentionDays', { valueAsNumber: true })}
            aria-invalid={!!errors.retentionDays}
          />
          {errors.retentionDays && (
            <p className="text-xs text-destructive">{errors.retentionDays.message}</p>
          )}
        </SettingRow>
      </SettingRows>
    </SettingsCard>
  );
}
