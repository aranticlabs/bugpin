import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { Switch } from '../../components/ui/switch';
import type { AppSettings, PrivacySettings } from '@shared/types';

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  euPrivacyMode: false,
};

export function Privacy() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<PrivacySettings>(DEFAULT_PRIVACY_SETTINGS);

  const {
    data: settings,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings.privacy ?? DEFAULT_PRIVACY_SETTINGS);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (privacy: PrivacySettings) => {
      const response = await api.put('/settings', { privacy });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Privacy settings saved successfully');
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to save privacy settings');
    },
  });

  const handleEuPrivacyModeChange = (enabled: boolean) => {
    setFormData({ euPrivacyMode: enabled });
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

  if (isError) {
    return (
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>EU Privacy Mode</CardTitle>
          <CardDescription>
            Control user activity trails across this BugPin instance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Privacy settings could not be loaded. No changes can be saved until the current
              setting is available.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Retrying...
              </>
            ) : (
              'Retry'
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>EU Privacy Mode</CardTitle>
          <CardDescription>
            Control user activity trails across this BugPin instance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <Label htmlFor="eu-privacy-mode">Enable EU Privacy Mode</Label>
              <p className="text-sm text-muted-foreground">
                Disable user activity trails for every project.
              </p>
            </div>
            <Switch
              id="eu-privacy-mode"
              checked={formData.euPrivacyMode}
              onCheckedChange={handleEuPrivacyModeChange}
            />
          </div>

          {formData.euPrivacyMode ? (
            <Alert className="[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0">
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>Activity trails are disabled for all projects.</AlertDescription>
            </Alert>
          ) : (
            <Alert className="[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Activity trails are available. You are responsible for any required authorization
                under EU regulations.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => mutation.mutate(formData)} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
            <a
              href="https://docs.bugpin.io/privacy/eu-privacy-mode"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Learn how EU Privacy Mode works
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
