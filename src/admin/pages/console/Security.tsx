import type { ReactNode } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Switch } from '../../components/ui/switch';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { SettingRow, SettingRows } from '../../components/ui/setting-row';
import { SettingsCard } from '../../components/ui/settings-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { SettingsNumberInput } from '../../components/SettingsNumberInput';
import type { AppSettings, TwoFactorPolicy } from '@shared/types';
import {
  DEFAULT_PASSWORD_POLICY,
  PASSWORD_MIN_LENGTH_CEILING,
  PASSWORD_MIN_LENGTH_FLOOR,
  type PasswordPolicy,
} from '@shared/password-policy';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import {
  useDraft,
  useSettings,
  useUpdateSettings,
  type SettingsUpdate,
} from '../../hooks/useSettings';

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-12">
        <Spinner className="mx-auto text-primary" />
      </CardContent>
    </Card>
  );
}

/**
 * Edits one card's slice of the settings. The draft holds only this card's own edits, so saving
 * the cards one after another, with the settings reloaded in between, never sends another card's
 * values or overwrites them with stale ones.
 */
function useSettingsSection<T extends object>({
  select,
  toPayload,
  successMessage,
}: {
  select: (settings: AppSettings) => T;
  toPayload: (changes: Partial<T>, value: T) => SettingsUpdate;
  successMessage: string;
}) {
  const { data: settings } = useSettings();
  const draft = useDraft(settings && select(settings));
  const mutation = useUpdateSettings({ successMessage });

  const save = async () => {
    if (!draft.value) return false;
    try {
      await mutation.mutateAsync(toPayload(draft.changes, draft.value));
      draft.reset();
      return true;
    } catch {
      return false;
    }
  };

  const guard: ReactNode = (
    <UnsavedChangesGuard isDirty={draft.isDirty} onSave={save} onDiscard={draft.reset} />
  );

  return { value: draft.value, set: draft.set, guard };
}

export function SessionSettingsCard() {
  const { value, set, guard } = useSettingsSection({
    select: (settings) => ({ sessionMaxAgeDays: settings.sessionMaxAgeDays || 7 }),
    toPayload: (changes) => changes,
    successMessage: 'Session settings saved',
  });

  if (!value) return <LoadingCard />;

  return (
    <SettingsCard title="Sessions" description="How long users stay signed in.">
      {guard}
      <SettingRows>
        <SettingRow
          label="Session Duration"
          htmlFor="session-max-age"
          controlClassName="@sm:w-28"
          description="Days until users must sign in again. Between 1 and 365 days."
        >
          <SettingsNumberInput
            id="session-max-age"
            min={1}
            max={365}
            value={value.sessionMaxAgeDays}
            onChange={(days) => set('sessionMaxAgeDays', days)}
          />
        </SettingRow>
      </SettingRows>
    </SettingsCard>
  );
}

export function InvitationSettingsCard() {
  const { value, set, guard } = useSettingsSection({
    select: (settings) => ({ invitationExpirationDays: settings.invitationExpirationDays || 7 }),
    toPayload: (changes) => changes,
    successMessage: 'Invitation settings saved',
  });

  if (!value) return <LoadingCard />;

  return (
    <SettingsCard title="Invitations" description="How long invitation links stay valid.">
      {guard}
      <SettingRows>
        <SettingRow
          label="Invitation Expiration"
          htmlFor="invitation-expiration"
          controlClassName="@sm:w-28"
          description="Days until an invitation link expires. Between 1 and 30 days."
        >
          <SettingsNumberInput
            id="invitation-expiration"
            min={1}
            max={30}
            value={value.invitationExpirationDays}
            onChange={(days) => set('invitationExpirationDays', days)}
          />
        </SettingRow>
      </SettingRows>
    </SettingsCard>
  );
}

export function NetworkSettingsCard() {
  const { value, set, guard } = useSettingsSection({
    select: (settings) => ({
      enforceHttps: settings.enforceHttps || false,
      rateLimitPerMinute: settings.rateLimitPerMinute || 60,
    }),
    toPayload: (changes) => changes,
    successMessage: 'Network settings saved',
  });

  if (!value) return <LoadingCard />;

  return (
    <Card>
      {guard}
      <CardContent className="space-y-4 pt-6">
        <SettingRows>
          <SettingRow
            label="Enforce HTTPS"
            htmlFor="enforce-https"
            description="Redirect HTTP requests to HTTPS and send the HSTS header."
          >
            <Switch
              id="enforce-https"
              checked={value.enforceHttps}
              onCheckedChange={(checked) => set('enforceHttps', checked)}
            />
          </SettingRow>
          {value.enforceHttps && (
            <div className="py-3">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Requires a TLS-terminating reverse proxy.</strong> Your proxy must set the{' '}
                  <code className="bg-muted px-1 rounded">x-forwarded-proto</code> header. Without
                  proper proxy configuration, this setting will not provide HTTPS protection.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <SettingRow
            label="Requests per Minute per IP"
            htmlFor="rate-limit"
            controlClassName="@sm:w-28"
            description="Limits widget submissions from a single IP address to prevent abuse. Each project is counted separately. Between 1 and 1000 requests."
          >
            <SettingsNumberInput
              id="rate-limit"
              min={1}
              max={1000}
              value={value.rateLimitPerMinute}
              onChange={(limit) => set('rateLimitPerMinute', limit)}
            />
          </SettingRow>
        </SettingRows>
      </CardContent>
    </Card>
  );
}

const TWO_FACTOR_POLICY_OPTIONS: Record<TwoFactorPolicy, { label: string; effect: string }> = {
  off: { label: 'Nobody', effect: 'Nobody has to use a second factor.' },
  admins: {
    label: 'Admins Only',
    effect: 'Admins without a second factor set one up at their next sign-in.',
  },
  everyone: {
    label: 'All Users',
    effect: 'Every user without a second factor sets one up at their next sign-in.',
  },
};

function isTwoFactorPolicy(value: string): value is TwoFactorPolicy {
  return value in TWO_FACTOR_POLICY_OPTIONS;
}

export function TwoFactorPolicyCard() {
  const { value, set, guard } = useSettingsSection({
    select: (settings) => ({ twoFactorPolicy: settings.twoFactorPolicy ?? 'off' }),
    toPayload: (changes) => changes,
    successMessage: 'Two-factor policy saved',
  });

  if (!value) return <LoadingCard />;
  const policy = value.twoFactorPolicy;

  return (
    <SettingsCard
      title="Two-Factor Authentication"
      description="Require an authenticator app or a passkey in addition to the password."
    >
      {guard}
      <SettingRows>
        <SettingRow
          label="Required For"
          htmlFor="two-factor-policy"
          description={`${TWO_FACTOR_POLICY_OPTIONS[policy].effect} Anyone can add a second factor in their profile.`}
        >
          <Select
            value={policy}
            onValueChange={(next) => {
              if (isTwoFactorPolicy(next)) set('twoFactorPolicy', next);
            }}
          >
            <SelectTrigger id="two-factor-policy" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TWO_FACTOR_POLICY_OPTIONS) as TwoFactorPolicy[]).map((option) => (
                <SelectItem key={option} value={option}>
                  {TWO_FACTOR_POLICY_OPTIONS[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingRows>
    </SettingsCard>
  );
}

type PasswordRuleKey = 'requireUppercase' | 'requireLowercase' | 'requireNumber' | 'requireSymbol';

const PASSWORD_RULE_OPTIONS: {
  key: PasswordRuleKey;
  label: string;
  hint: string;
  summary: string;
}[] = [
  {
    key: 'requireUppercase',
    label: 'Require Uppercase Letter',
    hint: 'A to Z',
    summary: 'an uppercase letter',
  },
  {
    key: 'requireLowercase',
    label: 'Require Lowercase Letter',
    hint: 'a to z',
    summary: 'a lowercase letter',
  },
  { key: 'requireNumber', label: 'Require Number', hint: '0 to 9', summary: 'a number' },
  {
    key: 'requireSymbol',
    label: 'Require Special Character',
    hint: 'For example ! ? # or %',
    summary: 'a special character',
  },
];

function passwordPolicySummary(policy: PasswordPolicy): string {
  const required = PASSWORD_RULE_OPTIONS.filter((rule) => policy[rule.key]).map(
    (rule) => rule.summary
  );
  const base = `New passwords need at least ${policy.minLength} characters`;
  if (required.length === 0) return `${base}.`;
  const last = required[required.length - 1];
  const list = required.length === 1 ? last : `${required.slice(0, -1).join(', ')} and ${last}`;
  return `${base}, including ${list}.`;
}

export function PasswordPolicyCard() {
  const {
    value: policy,
    set,
    guard,
  } = useSettingsSection<PasswordPolicy>({
    select: (settings) => settings.passwordPolicy ?? DEFAULT_PASSWORD_POLICY,
    // The stored policy is replaced as a whole, so the save sends the complete policy.
    toPayload: (_changes, value) => ({ passwordPolicy: value }),
    successMessage: 'Password policy saved',
  });

  if (!policy) return <LoadingCard />;

  return (
    <SettingsCard
      title="Password Policy"
      description="Strength rules for new passwords. Existing passwords keep working until they are changed."
    >
      {guard}
      <div className="space-y-4">
        <SettingRows>
          <SettingRow
            label="Minimum Length"
            htmlFor="password-min-length"
            controlClassName="@sm:w-28"
            description={`Between ${PASSWORD_MIN_LENGTH_FLOOR} and ${PASSWORD_MIN_LENGTH_CEILING} characters.`}
          >
            <SettingsNumberInput
              id="password-min-length"
              min={PASSWORD_MIN_LENGTH_FLOOR}
              max={PASSWORD_MIN_LENGTH_CEILING}
              value={policy.minLength}
              onChange={(minLength) => set('minLength', minLength)}
            />
          </SettingRow>
          {PASSWORD_RULE_OPTIONS.map((rule) => (
            <SettingRow
              key={rule.key}
              label={rule.label}
              htmlFor={`password-${rule.key}`}
              description={rule.hint}
            >
              <Switch
                id={`password-${rule.key}`}
                checked={policy[rule.key]}
                onCheckedChange={(checked) => set(rule.key, checked)}
              />
            </SettingRow>
          ))}
        </SettingRows>
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>{passwordPolicySummary(policy)}</AlertDescription>
        </Alert>
      </div>
    </SettingsCard>
  );
}
