import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_RECORDING_QUALITY } from '@shared/recording-quality';
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
import { RecordingSettingsForm } from '../../components/RecordingSettingsForm';
import type { AppSettings, ScreenshotSettings } from '@shared/types';

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
    if (settings) {
      setFormData({
        maxVideoUploadSizeMb: settings.screenshot.maxVideoUploadSizeMb || 50,
        maxVideoUploadMbPerDay: settings.screenshot.maxVideoUploadMbPerDay ?? 2048,
        enableScreenRecording: settings.screenshot.enableScreenRecording ?? false,
        allowRecordingMicrophone: settings.screenshot.allowRecordingMicrophone ?? false,
        maxRecordingDurationSeconds: settings.screenshot.maxRecordingDurationSeconds ?? 180,
        recordingQuality: settings.screenshot.recordingQuality ?? DEFAULT_RECORDING_QUALITY,
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
      toast.success('Recording settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

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
        <CardTitle>Recording Settings</CardTitle>
        <CardDescription>Configure screen recording and video uploads</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <RecordingSettingsForm
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
