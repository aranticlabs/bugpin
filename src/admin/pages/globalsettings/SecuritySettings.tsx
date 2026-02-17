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
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Switch } from '../../components/ui/switch';
import { Shield, AlertCircle, AlertTriangle } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import type { AppSettings } from '@shared/types';

export function SecuritySettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    enforceHttps: false,
    rateLimitPerMinute: 60,
    sessionMaxAgeDays: 7,
    invitationExpirationDays: 7,
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
        enforceHttps: settings.enforceHttps || false,
        rateLimitPerMinute: settings.rateLimitPerMinute || 60,
        sessionMaxAgeDays: settings.sessionMaxAgeDays || 7,
        invitationExpirationDays: settings.invitationExpirationDays || 7,
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
      toast.success('Security settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
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
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <CardTitle>Security Settings</CardTitle>
        </div>
        <CardDescription>Configure rate limiting and session settings</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {/* HTTPS Enforcement */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enforce-https">Enforce HTTPS</Label>
                <p className="text-sm text-muted-foreground">
                  Redirect HTTP requests to HTTPS and enable HSTS header
                </p>
              </div>
              <Switch
                id="enforce-https"
                checked={formData.enforceHttps}
                onCheckedChange={(checked) => setFormData({ ...formData, enforceHttps: checked })}
              />
            </div>

            {formData.enforceHttps && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Requires a TLS-terminating reverse proxy.</strong> Your proxy must set the{' '}
                  <code className="bg-muted px-1 rounded">x-forwarded-proto</code> header. Without
                  proper proxy configuration, this setting will not provide HTTPS protection.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <hr className="border-border" />

          {/* Rate Limiting */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Rate limiting helps prevent abuse by limiting the number of requests from a single IP
              address. This applies globally to all projects.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="rate-limit">Requests per Minute per IP</Label>
            <Input
              id="rate-limit"
              type="number"
              min={1}
              max={1000}
              value={formData.rateLimitPerMinute}
              onChange={(e) =>
                setFormData({ ...formData, rateLimitPerMinute: parseInt(e.target.value) || 60 })
              }
              required
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of API requests allowed per minute from a single IP address (1-1000)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-max-age">Session Duration (Days)</Label>
            <Input
              id="session-max-age"
              type="number"
              min={1}
              max={365}
              value={formData.sessionMaxAgeDays}
              onChange={(e) =>
                setFormData({ ...formData, sessionMaxAgeDays: parseInt(e.target.value) || 7 })
              }
              required
            />
            <p className="text-sm text-muted-foreground">
              Number of days before a user session expires and requires re-login (1-365)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invitation-expiration">Invitation Expiration (Days)</Label>
            <Input
              id="invitation-expiration"
              type="number"
              min={1}
              max={30}
              value={formData.invitationExpirationDays}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  invitationExpirationDays: parseInt(e.target.value) || 7,
                })
              }
              required
            />
            <p className="text-sm text-muted-foreground">
              Number of days before an invitation link expires (1-30)
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
