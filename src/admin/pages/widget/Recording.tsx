import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_RECORDING_QUALITY } from '@shared/recording-quality';
import { api } from '../../api/client';
import {
  SectionCard,
  SectionLoading,
  SettingsFormActions,
} from '../../components/settings/SectionCard';
import { RecordingSettingsForm } from '../../components/RecordingSettingsForm';
import type { AppSettings, ScreenshotSettings } from '@shared/types';

const fromSettings = (stored: AppSettings['screenshot']): ScreenshotSettings => ({
  maxVideoUploadSizeMb: stored.maxVideoUploadSizeMb || 50,
  maxVideoUploadMbPerDay: stored.maxVideoUploadMbPerDay ?? 2048,
  enableScreenRecording: stored.enableScreenRecording ?? false,
  allowRecordingMicrophone: stored.allowRecordingMicrophone ?? false,
  maxRecordingDurationSeconds: stored.maxRecordingDurationSeconds ?? 180,
  recordingQuality: stored.recordingQuality ?? DEFAULT_RECORDING_QUALITY,
});

export function Recording() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ScreenshotSettings>({
    maxVideoUploadSizeMb: 50,
    maxVideoUploadMbPerDay: 2048,
    enableScreenRecording: false,
    allowRecordingMicrophone: false,
    maxRecordingDurationSeconds: 180,
    recordingQuality: DEFAULT_RECORDING_QUALITY,
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
      toast.success('Recording settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleChange = (next: ScreenshotSettings) => {
    const enabledChanged = !!next.enableScreenRecording !== !!formData.enableScreenRecording;
    setFormData(next);
    // The on/off switch saves by itself: while recording is off the form is locked, so it could
    // not be saved afterwards.
    if (enabledChanged && settings) {
      const enabled = !!next.enableScreenRecording;
      mutation.mutate({
        screenshot: {
          ...settings.screenshot,
          enableScreenRecording: enabled,
          ...(enabled ? {} : { allowRecordingMicrophone: false }),
        },
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    mutation.mutate({
      // Recording and screenshot settings share one stored object that is replaced on save.
      screenshot: {
        ...settings.screenshot,
        maxVideoUploadSizeMb: formData.maxVideoUploadSizeMb || 50,
        maxVideoUploadMbPerDay: formData.maxVideoUploadMbPerDay ?? 2048,
        enableScreenRecording: formData.enableScreenRecording ?? false,
        allowRecordingMicrophone: formData.allowRecordingMicrophone ?? false,
        maxRecordingDurationSeconds: formData.maxRecordingDurationSeconds ?? 180,
        recordingQuality: formData.recordingQuality ?? DEFAULT_RECORDING_QUALITY,
      },
    });
  };

  if (isLoading) {
    return (
      <SectionCard section="recording">
        <SectionLoading />
      </SectionCard>
    );
  }

  return (
    <SectionCard section="recording">
      <form onSubmit={handleSubmit} className="space-y-6">
        <RecordingSettingsForm
          value={formData}
          onChange={handleChange}
          disabled={mutation.isPending}
        />
        <SettingsFormActions
          isPending={mutation.isPending}
          isDirty={isDirty}
          locked={!formData.enableScreenRecording}
        />
      </form>
    </SectionCard>
  );
}
