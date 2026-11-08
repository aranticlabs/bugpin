import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { SettingRow, SettingRows } from '../../components/ui/setting-row';
import { SettingsCard } from '../../components/ui/settings-card';
import { Switch } from '../../components/ui/switch';
import { Info, Send } from 'lucide-react';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { SettingsNumberInput } from '../../components/SettingsNumberInput';
import type { AppSettings } from '@shared/types';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import {
  useDraft,
  useSettings,
  useUpdateSettings,
  type SettingsUpdate,
} from '../../hooks/useSettings';
import { apiErrorMessage } from '../../lib/apiError';

interface SmtpForm {
  smtpEnabled: boolean;
  host: string;
  port: number;
  user: string;
  /** Empty unless the admin types a new password. The stored password is never loaded. */
  password: string;
  from: string;
}

function toSmtpForm(settings: AppSettings): SmtpForm {
  return {
    smtpEnabled: settings.smtpEnabled ?? false,
    host: settings.smtpConfig?.host || '',
    port: settings.smtpConfig?.port || 587,
    user: settings.smtpConfig?.user || '',
    password: '',
    from: settings.smtpConfig?.from || '',
  };
}

function toUpdate({ smtpEnabled, ...smtpConfig }: Partial<SmtpForm>): SettingsUpdate {
  return {
    ...(smtpEnabled !== undefined && { smtpEnabled }),
    ...(Object.keys(smtpConfig).length > 0 && { smtpConfig }),
  };
}

export function SMTP() {
  return <SMTPSettingsSection />;
}

function SMTPSettingsSection() {
  const { user } = useAuth();
  const { data: settings, isLoading } = useSettings();
  const draft = useDraft(settings && toSmtpForm(settings));
  const mutation = useUpdateSettings({ successMessage: 'Email settings saved successfully' });
  const [showErrors, setShowErrors] = useState(false);

  const testEmailMutation = useMutation({
    mutationFn: async (form: SmtpForm) => {
      const response = await api.post('/settings/test-email', {
        smtpConfig: {
          host: form.host,
          port: form.port,
          user: form.user,
          // Without a typed password the server uses the stored one.
          ...(form.password && { password: form.password }),
          from: form.from,
        },
        testEmail: user?.email,
        appName: settings?.appName || 'BugPin',
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success(`Test email sent successfully to ${user?.email}`);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'Failed to send test email'));
    },
  });

  if (isLoading || !draft.value) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  const form = draft.value;
  const errors = {
    host: form.smtpEnabled && !form.host.trim() ? 'Enter the SMTP host to send email.' : undefined,
    from:
      form.smtpEnabled && !form.from.trim() ? 'Enter the sender address to send email.' : undefined,
  };
  const hasErrors = !!errors.host || !!errors.from;
  const passwordSet = settings?.smtpConfig?.passwordSet ?? false;

  const save = async () => {
    if (hasErrors) {
      setShowErrors(true);
      return false;
    }
    try {
      await mutation.mutateAsync(toUpdate(draft.changes));
      draft.reset();
      setShowErrors(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleTestEmail = () => {
    if (!form.host || !form.from) {
      toast.error('Please fill in SMTP host and from address first');
      return;
    }
    if (!user?.email) {
      toast.error('User email not found');
      return;
    }
    testEmailMutation.mutate(form);
  };

  const canTestEmail = form.smtpEnabled && form.host && form.from && user?.email;

  return (
    <SettingsCard
      title="SMTP Server"
      description="The mail server BugPin uses to send email notifications."
      badge={
        !form.smtpEnabled && (
          // The negative margin keeps the badge inside the title's line height.
          <Badge size="sm" className="-my-0.5 px-2 font-medium">
            Off
          </Badge>
        )
      }
      action={
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="smtp-enabled" className="text-sm font-normal text-muted-foreground">
            Enable email
          </Label>
          <Switch
            id="smtp-enabled"
            checked={form.smtpEnabled}
            onCheckedChange={(checked) => draft.set('smtpEnabled', checked)}
          />
        </div>
      }
    >
      <UnsavedChangesGuard
        isDirty={draft.isDirty}
        onSave={save}
        onDiscard={() => {
          draft.reset();
          setShowErrors(false);
        }}
      />
      {!form.smtpEnabled && (
        <Alert role="note" className="mb-4 border-primary/20 bg-primary/10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Email is turned off, so BugPin sends no email. Turn on Enable email to change the server
            settings.
          </AlertDescription>
        </Alert>
      )}
      <SettingRows>
        <SettingRow
          label="SMTP Host"
          htmlFor="smtp-host"
          description="Address of your mail server."
          controlClassName="@sm:w-80"
        >
          <Input
            id="smtp-host"
            value={form.host}
            onChange={(e) => draft.set('host', e.target.value)}
            disabled={!form.smtpEnabled}
            placeholder="smtp.example.com"
            aria-invalid={showErrors && !!errors.host}
            aria-describedby={showErrors && errors.host ? 'smtp-host-error' : undefined}
          />
          {showErrors && errors.host && (
            <p id="smtp-host-error" className="text-xs text-destructive">
              {errors.host}
            </p>
          )}
        </SettingRow>
        <SettingRow
          label="SMTP Port"
          htmlFor="smtp-port"
          description="Usually 587, or 465 for SSL/TLS."
          controlClassName="@sm:w-28"
        >
          <SettingsNumberInput
            id="smtp-port"
            min={1}
            max={65535}
            value={form.port}
            onChange={(port) => draft.set('port', port)}
            disabled={!form.smtpEnabled}
          />
        </SettingRow>
        <SettingRow
          label="SMTP Username"
          htmlFor="smtp-user"
          description="Leave blank if your server does not require sign-in."
          controlClassName="@sm:w-80"
        >
          <Input
            id="smtp-user"
            value={form.user}
            onChange={(e) => draft.set('user', e.target.value)}
            disabled={!form.smtpEnabled}
            placeholder="user@example.com"
          />
        </SettingRow>
        <SettingRow
          label="SMTP Password"
          htmlFor="smtp-password"
          description="Leave blank if your server does not require sign-in."
          controlClassName="@sm:w-80"
        >
          <Input
            id="smtp-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => draft.set('password', e.target.value)}
            disabled={!form.smtpEnabled}
            placeholder={passwordSet ? 'Saved (leave empty to keep)' : 'Enter password'}
          />
        </SettingRow>
        <SettingRow
          label="From Email Address"
          htmlFor="smtp-from"
          description="Sender address of notification emails."
          controlClassName="@sm:w-80"
        >
          <Input
            id="smtp-from"
            type="email"
            value={form.from}
            onChange={(e) => draft.set('from', e.target.value)}
            disabled={!form.smtpEnabled}
            placeholder="bugs@example.com"
            aria-invalid={showErrors && !!errors.from}
            aria-describedby={showErrors && errors.from ? 'smtp-from-error' : undefined}
          />
          {showErrors && errors.from && (
            <p id="smtp-from-error" className="text-xs text-destructive">
              {errors.from}
            </p>
          )}
        </SettingRow>
        <SettingRow
          label="Test Email"
          description={
            user?.email ? (
              <>
                Sends a test email to <strong>{user.email}</strong> with the settings above.
              </>
            ) : (
              'Sends a test email with the settings above.'
            )
          }
        >
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
        </SettingRow>
      </SettingRows>
    </SettingsCard>
  );
}
