import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Spinner } from '../../components/ui/spinner';
import { ScreenshotSettingsForm } from '../../components/ScreenshotSettingsForm';
import type { AppSettings, ScreenshotSettings } from '@shared/types';

export function Screenshot() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ScreenshotSettings>({
    maxScreenshotSize: 10,
    maxImageUploadSizeMb: 10,
    maxVideoUploadSizeMb: 50,
    maxVideoUploadMbPerDay: 2048,
    useScreenCaptureAPI: false,
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
      setFormData({
        maxScreenshotSize: settings.screenshot.maxScreenshotSize || 10,
        maxImageUploadSizeMb: settings.screenshot.maxImageUploadSizeMb || 10,
        maxVideoUploadSizeMb: settings.screenshot.maxVideoUploadSizeMb || 50,
        maxVideoUploadMbPerDay: settings.screenshot.maxVideoUploadMbPerDay ?? 2048,
        useScreenCaptureAPI: settings.screenshot.useScreenCaptureAPI || false,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Screenshot settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      screenshot: {
        maxScreenshotSize: formData.maxScreenshotSize || 10,
        maxImageUploadSizeMb: formData.maxImageUploadSizeMb || 10,
        maxVideoUploadSizeMb: formData.maxVideoUploadSizeMb || 50,
        maxVideoUploadMbPerDay: formData.maxVideoUploadMbPerDay ?? 2048,
        useScreenCaptureAPI: formData.useScreenCaptureAPI || false,
      },
    });
  };

  if (isLoading) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Screenshot Settings</CardTitle>
        <CardDescription>Configure screenshot capture settings</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <ScreenshotSettingsForm
            value={formData}
            onChange={setFormData}
            disabled={mutation.isPending}
          />

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
