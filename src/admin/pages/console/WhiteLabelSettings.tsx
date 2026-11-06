import { useState } from 'react';
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
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';

function showError(error: Error) {
  toast.error(
    axios.isAxiosError(error) ? error.response?.data?.message || error.message : error.message
  );
}

interface WhiteLabelConfig {
  hideFooterBranding: boolean;
  hideEmailBranding: boolean;
  customCopyright: string;
}

function WhiteLabelSettings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['white-label'],
    queryFn: async () =>
      (await api.get('/white-label/config')).data.config as {
        hideFooterBranding: boolean;
        hideEmailBranding: boolean;
        customCopyright?: string;
      },
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
        <WhiteLabelForm
          key={JSON.stringify(data)}
          saved={{ ...data, customCopyright: data.customCopyright || '' }}
        />
      )}
    </Card>
  );
}

function WhiteLabelForm({ saved }: { saved: WhiteLabelConfig }) {
  const client = useQueryClient();
  const [form, setForm] = useState(saved);
  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);
  const save = useMutation({
    mutationFn: (config: WhiteLabelConfig) => api.put('/white-label/config', config),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['white-label'] });
      await client.invalidateQueries({ queryKey: ['branding-config'] });
      toast.success('White-label settings saved');
    },
    onError: showError,
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(form);
      }}
    >
      <UnsavedChangesGuard isDirty={isDirty} onSave={() => save.mutateAsync(form)} />
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="hide-footer-branding">Hide admin footer branding</Label>
          <Switch
            id="hide-footer-branding"
            checked={form.hideFooterBranding}
            onCheckedChange={(checked) => setForm({ ...form, hideFooterBranding: checked })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="hide-email-branding">Hide email footer branding</Label>
          <Switch
            id="hide-email-branding"
            checked={form.hideEmailBranding}
            onCheckedChange={(checked) => setForm({ ...form, hideEmailBranding: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="white-label-copyright">Copyright text</Label>
          <Input
            id="white-label-copyright"
            maxLength={500}
            value={form.customCopyright}
            onChange={(event) => setForm({ ...form, customCopyright: event.target.value })}
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
