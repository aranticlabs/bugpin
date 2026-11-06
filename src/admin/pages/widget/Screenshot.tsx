import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  SectionCard,
  SectionLoading,
  SettingsFormActions,
} from '../../components/settings/SectionCard';
import { ScreenshotSettingsForm } from '../../components/ScreenshotSettingsForm';
import type { AppSettings, ScreenshotSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

const fromSettings = (stored: AppSettings['screenshot']): ScreenshotSettings => ({
  maxScreenshotSize: stored.maxScreenshotSize || 10,
  maxImageUploadSizeMb: stored.maxImageUploadSizeMb || 10,
  useScreenCaptureAPI: stored.useScreenCaptureAPI || false,
});

export function Screenshot() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ScreenshotSettings>({
    maxScreenshotSize: 10,
    maxImageUploadSizeMb: 10,
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
    if (settings) setFormData(fromSettings(settings.screenshot));
  }, [settings]);

  const isDirty =
    !!settings && JSON.stringify(formData) !== JSON.stringify(fromSettings(settings.screenshot));

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

  const buildPayload = (current: AppSettings): Partial<AppSettings> => ({
    // Screenshot and recording settings share one stored object that is replaced on save.
    screenshot: {
      ...current.screenshot,
      maxScreenshotSize: formData.maxScreenshotSize || 10,
      maxImageUploadSizeMb: formData.maxImageUploadSizeMb || 10,
      useScreenCaptureAPI: formData.useScreenCaptureAPI || false,
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    mutation.mutate(buildPayload(settings));
  };

  if (isLoading) {
    return (
      <SectionCard section="screenshot">
        <SectionLoading />
      </SectionCard>
    );
  }

  return (
    <SectionCard section="screenshot">
      <UnsavedChangesGuard
        isDirty={isDirty}
        onSave={() =>
          settings ? mutation.mutateAsync(buildPayload(settings)) : Promise.resolve(false)
        }
      />
      <form onSubmit={handleSubmit} className="space-y-6">
        <ScreenshotSettingsForm
          value={formData}
          onChange={setFormData}
          disabled={mutation.isPending}
        />
        <SettingsFormActions isPending={mutation.isPending} isDirty={isDirty} />
      </form>
    </SectionCard>
  );
}
