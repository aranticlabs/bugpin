import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
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
import { Send } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import type { AppSettings } from '@shared/types';

export function SMTPSettings() {
  return <SMTPSettingsSection />;
}
function SMTPSettingsSection() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    smtpConfig: {
      host: '',
      port: 587,
      user: '',
      password: '',
      from: '',
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
      setFormData({
        smtpConfig: {
          host: settings.smtpConfig?.host || '',
          port: settings.smtpConfig?.port || 587,
          user: settings.smtpConfig?.user || '',
          password: settings.smtpConfig?.password || '',
          from: settings.smtpConfig?.from || '',
        },
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
      toast.success('Email settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/settings/test-email', {
        smtpConfig: formData.smtpConfig,
        testEmail: user?.email,
        appName: settings?.appName || 'BugPin',
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success(`Test email sent successfully to ${user?.email}`);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to send test email');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Always enable SMTP when saving settings
    mutation.mutate({ ...formData, smtpEnabled: true });
  };

  const handleTestEmail = () => {
    if (!formData.smtpConfig.host || !formData.smtpConfig.from) {
      toast.error('Please fill in SMTP host and from address first');
      return;
    }
    if (!user?.email) {
      toast.error('User email not found');
      return;
    }
    testEmailMutation.mutate();
  };

  const canTestEmail = formData.smtpConfig.host && formData.smtpConfig.from && user?.email;

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
        <CardTitle>SMTP Server</CardTitle>
        <CardDescription>
          Configure SMTP server settings for sending email notifications
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="smtp-host">SMTP Host</Label>
            <Input
              id="smtp-host"
              value={formData.smtpConfig.host}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  smtpConfig: { ...formData.smtpConfig, host: e.target.value },
                })
              }
              placeholder="smtp.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-port">SMTP Port</Label>
            <Input
              id="smtp-port"
              type="number"
              min={1}
              max={65535}
              value={formData.smtpConfig.port}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  smtpConfig: { ...formData.smtpConfig, port: parseInt(e.target.value) || 587 },
                })
              }
              placeholder="587"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-user">SMTP Username</Label>
            <Input
              id="smtp-user"
              value={formData.smtpConfig.user}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  smtpConfig: { ...formData.smtpConfig, user: e.target.value },
                })
              }
              placeholder="user@example.com"
            />
            <p className="text-sm text-muted-foreground">Leave blank if not required</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-password">SMTP Password</Label>
            <Input
              id="smtp-password"
              type="password"
              value={formData.smtpConfig.password}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  smtpConfig: { ...formData.smtpConfig, password: e.target.value },
                })
              }
              placeholder="Enter password"
            />
            <p className="text-sm text-muted-foreground">Leave blank if not required</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-from">From Email Address</Label>
            <Input
              id="smtp-from"
              type="email"
              value={formData.smtpConfig.from}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  smtpConfig: { ...formData.smtpConfig, from: e.target.value },
                })
              }
              placeholder="bugs@example.com"
            />
          </div>

          <div className="flex gap-3 pt-4">
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

            <Button
              type="button"
              variant="outline"
              onClick={handleTestEmail}
              disabled={!canTestEmail || testEmailMutation.isPending}
            >
              {testEmailMutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Email
                </>
              )}
            </Button>
          </div>

          {user?.email && (
            <p className="text-xs text-muted-foreground pt-2">
              Test email will be sent to: <strong>{user.email}</strong>
            </p>
          )}
        </CardContent>
      </form>
    </Card>
  );
}
