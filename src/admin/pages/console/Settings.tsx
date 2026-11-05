import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
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
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { Switch } from '../../components/ui/switch';
import type { AppSettings } from '@shared/types';

const settingsSchema = z.object({
  appName: z.string().min(1, 'Application name is required'),
  appUrl: z.string().url('Please enter a valid URL').or(z.literal('')),
  updateCheckEnabled: z.boolean(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

const retentionSchema = z.object({
  retentionDays: z.number().min(0, 'Must be 0 or more').max(3650, 'Must be 3650 or less'),
});

type RetentionFormData = z.infer<typeof retentionSchema>;

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });
}

function useSaveSettings(successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['version'] });
      toast.success(successMessage);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });
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

function SaveButton({ isPending }: { isPending: boolean }) {
  return (
    <Button type="submit" disabled={isPending}>
      {isPending ? (
        <>
          <Spinner size="sm" className="mr-2" />
          Saving...
        </>
      ) : (
        'Save Changes'
      )}
    </Button>
  );
}

export function Settings() {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      appName: '',
      appUrl: '',
      updateCheckEnabled: true,
    },
  });

  const { data: settings, isLoading } = useSettings();

  useEffect(() => {
    if (settings) {
      reset({
        appName: settings.appName || '',
        appUrl: settings.appUrl || '',
        updateCheckEnabled: settings.updateCheckEnabled ?? true,
      });
    }
  }, [settings, reset]);

  const mutation = useSaveSettings('Settings saved successfully');

  const onSubmit = (data: SettingsFormData) => {
    mutation.mutate({
      appName: data.appName,
      appUrl: data.appUrl,
      updateCheckEnabled: data.updateCheckEnabled,
    });
  };

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="app-name">
              Application Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="app-name"
              placeholder="BugPin"
              {...register('appName')}
              aria-invalid={!!errors.appName}
            />
            {errors.appName && <p className="text-xs text-destructive">{errors.appName.message}</p>}
            <p className="text-xs text-muted-foreground">
              Used as the sender name in email notifications
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-url">Application URL</Label>
            <Input
              id="app-url"
              type="url"
              placeholder="https://bugpin.example.com"
              {...register('appUrl')}
              aria-invalid={!!errors.appUrl}
            />
            {errors.appUrl && <p className="text-xs text-destructive">{errors.appUrl.message}</p>}
            <p className="text-xs text-muted-foreground">
              Used for generating links in email notifications and GitHub issues
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="update-check">Check for updates</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, BugPin checks once a day for new releases and shows a banner to
                administrators when an update is available.
              </p>
            </div>
            <Controller
              control={control}
              name="updateCheckEnabled"
              render={({ field }) => (
                <Switch id="update-check" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <SaveButton isPending={mutation.isPending} />
        </CardContent>
      </form>
    </Card>
  );
}

export function DataRetention() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RetentionFormData>({
    resolver: zodResolver(retentionSchema),
    defaultValues: { retentionDays: 90 },
  });

  const { data: settings, isLoading } = useSettings();

  useEffect(() => {
    if (settings) reset({ retentionDays: settings.retentionDays ?? 90 });
  }, [settings, reset]);

  const mutation = useSaveSettings('Data retention saved');

  if (isLoading) return <LoadingCard />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Retention</CardTitle>
        <CardDescription>How long reports and their files are kept</CardDescription>
      </CardHeader>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate({ retentionDays: data.retentionDays }))}
        noValidate
      >
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="retention-days">
              Data Retention (days) <span className="text-destructive">*</span>
            </Label>
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
            <p className="text-xs text-muted-foreground">
              Time to keep bug reports before automatic deletion. (1-3650 days) Set to 0 to never
              delete.
            </p>
          </div>

          <SaveButton isPending={mutation.isPending} />
        </CardContent>
      </form>
    </Card>
  );
}
