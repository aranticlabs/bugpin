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
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import type { AppSettings, TwoFactorPolicy } from '@shared/types';
import {
  DEFAULT_PASSWORD_POLICY,
  PASSWORD_MIN_LENGTH_CEILING,
  PASSWORD_MIN_LENGTH_FLOOR,
  type PasswordPolicy,
} from '@shared/password-policy';

export function Security() {
  return (
    <div className="max-w-4xl space-y-6">
      <SecuritySettingsCard />
    </div>
  );
}

export function TwoFactor() {
  return (
    <div className="max-w-4xl space-y-6">
      <TwoFactorPolicyCard />
    </div>
  );
}

export function PasswordPolicySettings() {
  return (
    <div className="max-w-4xl space-y-6">
      <PasswordPolicyCard />
    </div>
  );
}

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });
}

function useSaveSettings(successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['password-policy'] });
      toast.success(successMessage);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });
}

function SaveButton({ isPending }: { isPending: boolean }) {
  return (
    <Button type="submit" disabled={isPending}>
      {isPending ? (
        <>
          <Spinner size="sm" className="mr-2" />
          Saving...
        </>
      ) : (
        'Save Changes'
      )}
    </Button>
  );
}

function SecuritySettingsCard() {
  const [formData, setFormData] = useState({
    enforceHttps: false,
    rateLimitPerMinute: 60,
    sessionMaxAgeDays: 7,
    invitationExpirationDays: 7,
  });

  const { data: settings, isLoading } = useSettings();

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

  const mutation = useSaveSettings('Security settings saved successfully');

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
                <p className="text-xs text-muted-foreground">
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
              Rate limiting helps prevent abuse by limiting the number of widget submissions from a
              single IP address. Each project is counted separately.
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
            <p className="text-xs text-muted-foreground">
              Maximum number of widget submissions allowed per minute from a single IP address for
              each project (1-1000)
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
            <p className="text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
              Number of days before an invitation link expires (1-30)
            </p>
          </div>

          <SaveButton isPending={mutation.isPending} />
        </CardContent>
      </form>
    </Card>
  );
}

const TWO_FACTOR_POLICY_LABELS: Record<TwoFactorPolicy, string> = {
  off: 'Off',
  admins: 'Admins only',
  everyone: 'All users',
};

function TwoFactorPolicyCard() {
  const { data: settings } = useSettings();
  const [policy, setPolicy] = useState<TwoFactorPolicy>('off');
  const mutation = useSaveSettings('Two-factor policy saved');

  useEffect(() => {
    if (settings) setPolicy(settings.twoFactorPolicy ?? 'off');
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-Factor Authentication</CardTitle>
        <CardDescription>
          Require an authenticator app or a passkey in addition to the password
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ twoFactorPolicy: policy });
        }}
      >
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="two-factor-policy">Require for</Label>
            <Select value={policy} onValueChange={(value) => setPolicy(value as TwoFactorPolicy)}>
              <SelectTrigger id="two-factor-policy" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TWO_FACTOR_POLICY_LABELS) as TwoFactorPolicy[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {TWO_FACTOR_POLICY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Users the policy covers who have no second factor yet must set one up at their next
              sign-in. Users can always add one themselves in their profile.
            </p>
          </div>
          <SaveButton isPending={mutation.isPending} />
        </CardContent>
      </form>
    </Card>
  );
}

const PASSWORD_RULE_OPTIONS: {
  key: 'requireUppercase' | 'requireLowercase' | 'requireNumber' | 'requireSymbol';
  label: string;
}[] = [
  { key: 'requireUppercase', label: 'Uppercase letter' },
  { key: 'requireLowercase', label: 'Lowercase letter' },
  { key: 'requireNumber', label: 'Number' },
  { key: 'requireSymbol', label: 'Special character' },
];

function PasswordPolicyCard() {
  const { data: settings } = useSettings();
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);
  const mutation = useSaveSettings('Password policy saved');

  useEffect(() => {
    if (settings?.passwordPolicy) setPolicy(settings.passwordPolicy);
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password Policy</CardTitle>
        <CardDescription>
          Strength rules for new passwords. Existing passwords keep working until they are changed.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate({ passwordPolicy: policy });
        }}
      >
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password-min-length">Minimum length</Label>
            <Input
              id="password-min-length"
              type="number"
              min={PASSWORD_MIN_LENGTH_FLOOR}
              max={PASSWORD_MIN_LENGTH_CEILING}
              className="w-32"
              value={policy.minLength}
              onChange={(event) =>
                setPolicy({
                  ...policy,
                  minLength: parseInt(event.target.value) || PASSWORD_MIN_LENGTH_FLOOR,
                })
              }
              required
            />
            <p className="text-xs text-muted-foreground">
              Number of characters ({PASSWORD_MIN_LENGTH_FLOOR}-{PASSWORD_MIN_LENGTH_CEILING})
            </p>
          </div>

          <div className="space-y-3">
            <Label>Must contain</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PASSWORD_RULE_OPTIONS.map((option) => (
                <div key={option.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`password-${option.key}`}
                    checked={policy[option.key]}
                    onCheckedChange={(checked) =>
                      setPolicy({ ...policy, [option.key]: checked === true })
                    }
                  />
                  <Label htmlFor={`password-${option.key}`} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <SaveButton isPending={mutation.isPending} />
        </CardContent>
      </form>
    </Card>
  );
}
