import { useEffect } from 'react';
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
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import type { AppSettings } from '@shared/types';

const systemSettingsSchema = z.object({
  appName: z.string().min(1, 'Application name is required'),
  appUrl: z.string().url('Please enter a valid URL').or(z.literal('')),
  retentionDays: z.number().min(0, 'Must be 0 or more').max(3650, 'Must be 3650 or less'),
});

type SystemSettingsFormData = z.infer<typeof systemSettingsSchema>;

export function SystemSettings() {
  return <SystemSettingsSection />;
}

function SystemSettingsSection() {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SystemSettingsFormData>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      appName: '',
      appUrl: '',
      retentionDays: 90,
    },
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        appName: settings.appName || '',
        appUrl: settings.appUrl || '',
        retentionDays: settings.retentionDays || 90,
      });
    }
  }, [settings, reset]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('System settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const onSubmit = (data: SystemSettingsFormData) => {
    mutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>Configure application settings and data retention</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
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
            {errors.appName && <p className="text-sm text-destructive">{errors.appName.message}</p>}
            <p className="text-sm text-muted-foreground">
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
            {errors.appUrl && <p className="text-sm text-destructive">{errors.appUrl.message}</p>}
            <p className="text-sm text-muted-foreground">
              Used for generating links in email notifications and GitHub issues
            </p>
          </div>

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
              <p className="text-sm text-destructive">{errors.retentionDays.message}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Time to keep bug reports before automatic deletion. (1-3650 days) Set to 0 to never
              delete.
            </p>
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
