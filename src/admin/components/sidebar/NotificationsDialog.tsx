import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Spinner } from '../ui/spinner';
import { NotificationSettingsForm } from '../NotificationSettingsForm';
import type { NotificationDefaultSettings } from '@shared/types';

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<NotificationDefaultSettings>>({
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
  });

  const handleFormChange = (value: Partial<NotificationDefaultSettings>) => {
    setFormData((prev) => ({ ...prev, ...value }));
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        emailEnabled: settings.notificationDefaultEmailEnabled ?? true,
        notifyOnNewReport: settings.notificationDefaultNotifyOnNewReport ?? true,
        notifyOnStatusChange: settings.notificationDefaultNotifyOnStatusChange ?? true,
        notifyOnPriorityChange: settings.notificationDefaultNotifyOnPriorityChange ?? true,
        notifyOnAssignment: settings.notificationDefaultNotifyOnAssignment ?? true,
      });
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: {
      notificationDefaultEmailEnabled: boolean;
      notificationDefaultNotifyOnNewReport: boolean;
      notificationDefaultNotifyOnStatusChange: boolean;
      notificationDefaultNotifyOnPriorityChange: boolean;
      notificationDefaultNotifyOnAssignment: boolean;
    }) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Notification preferences saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      notificationDefaultEmailEnabled: formData.emailEnabled ?? true,
      notificationDefaultNotifyOnNewReport: formData.notifyOnNewReport ?? true,
      notificationDefaultNotifyOnStatusChange: formData.notifyOnStatusChange ?? true,
      notificationDefaultNotifyOnPriorityChange: formData.notifyOnPriorityChange ?? true,
      notificationDefaultNotifyOnAssignment: formData.notifyOnAssignment ?? true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notification Preferences</DialogTitle>
          <DialogDescription>
            Default notification preferences for all projects. Projects can override these settings
            individually.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Spinner className="text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 py-4">
            <NotificationSettingsForm value={formData} onChange={handleFormChange} />

            <DialogFooter>
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
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
