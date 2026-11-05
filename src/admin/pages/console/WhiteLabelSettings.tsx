import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { brandingApi } from '../../api/branding';
import { licenseApi } from '../../api/license';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Spinner } from '../../components/ui/spinner';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';

function showError(error: Error) {
  toast.error(
    axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message
  );
}

function WhiteLabelSettings() {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['white-label'],
    queryFn: async () =>
      (await api.get('/white-label/config')).data.config as {
        hideFooterBranding: boolean;
        hideEmailBranding: boolean;
        customCopyright?: string;
      },
  });
  const save = useMutation({
    mutationFn: (form: FormData) =>
      api.put('/white-label/config', {
        hideFooterBranding: form.has('footer'),
        hideEmailBranding: form.has('email'),
        customCopyright: String(form.get('copyright') || ''),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['white-label'] });
      await client.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('White-label settings saved');
    },
    onError: showError,
  });
  return (
    <Card>
      {isLoading ? (
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      ) : error || !data ? (
        <CardContent className="pt-6">
          <p role="alert" className="text-sm text-destructive">
            Unable to load white-label settings.
          </p>
        </CardContent>
      ) : (
        <form
          key={JSON.stringify(data)}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(new FormData(event.currentTarget));
          }}
        >
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="hide-footer-branding">Hide admin footer branding</Label>
              <Switch
                id="hide-footer-branding"
                name="footer"
                defaultChecked={data.hideFooterBranding}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="hide-email-branding">Hide email footer branding</Label>
              <Switch
                id="hide-email-branding"
                name="email"
                defaultChecked={data.hideEmailBranding}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="white-label-copyright">Copyright text</Label>
              <Input
                id="white-label-copyright"
                name="copyright"
                maxLength={500}
                defaultValue={data.customCopyright || ''}
              />
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save white-label settings'
                )}
              </Button>
            </div>
          </CardContent>
        </form>
      )}
    </Card>
  );
}

function WidgetBrandingSettings() {
  const client = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });
  const save = useMutation({
    mutationFn: (showBranding: boolean) =>
      api.put('/white-label/config', { hidePoweredBy: !showBranding }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['branding-config'] });
      await client.invalidateQueries({ queryKey: ['white-label'] });
      toast.success('Widget branding updated');
    },
    onError: () => toast.error('Failed to update widget branding'),
  });

  if (!isLoading && !config?.whiteLabel) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget Branding</CardTitle>
        <CardDescription>The branding line in the widget dialog footer.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !config ? (
          <Spinner className="mx-auto text-primary" />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="show-widget-branding">Show BugPin branding</Label>
              <p className="text-sm text-muted-foreground">
                Display “Powered by BugPin” in the widget footer. Changes save automatically.
              </p>
            </div>
            <Switch
              id="show-widget-branding"
              checked={!config.whiteLabel?.hidePoweredBy}
              onCheckedChange={(checked) => save.mutate(checked)}
              disabled={save.isPending}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WhiteLabel() {
  const { data: featureStatus, isLoading } = useQuery({
    queryKey: ['license-features'],
    queryFn: licenseApi.getFeatures,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!featureStatus?.features['white-label']) {
    return (
      <UpgradePrompt
        feature="white-label"
        title="White-label"
        description="Remove BugPin branding from the Admin Console, email notifications, and the widget."
      />
    );
  }

  return (
    <>
      <WhiteLabelSettings />
      <WidgetBrandingSettings />
    </>
  );
}
