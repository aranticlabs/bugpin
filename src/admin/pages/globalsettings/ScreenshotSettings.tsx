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
import type { AppSettings } from '@shared/types';

interface ScreenshotFormData {
  useScreenCaptureAPI?: boolean;
  maxScreenshotSizeMb?: number;
}

export function ScreenshotSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ScreenshotFormData>({
    maxScreenshotSizeMb: 10,
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
        maxScreenshotSizeMb: settings.screenshot.maxScreenshotSize || 10,
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
        maxScreenshotSize: formData.maxScreenshotSizeMb || 10,
        useScreenCaptureAPI: formData.useScreenCaptureAPI || false,
      },
    });
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
