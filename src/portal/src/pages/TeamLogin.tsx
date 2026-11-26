import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import type { PortalTeamLoginResult } from '@shared/portal-types';
import { PortalApiError, portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, useTeamPage } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/catalog';
import { AuthCard } from '../components/AuthCard';

type Step =
  | { kind: 'credentials' }
  | { kind: 'twoFactor'; challengeToken: string; totp: boolean }
  | { kind: 'verificationSent'; maskedEmail: string };

const errorMessages: Record<string, MessageKey> = {
  INVALID_CREDENTIALS: 'invalidCredentials',
  PASSWORD_CHANGE_REQUIRED: 'teamSetupRequired',
  TWO_FACTOR_SETUP_REQUIRED: 'teamSetupRequired',
  INVALID_CODE: 'invalidCode',
  CHALLENGE_EXPIRED: 'challengeExpired',
  TOO_MANY_ATTEMPTS: 'rateLimited',
  RATE_LIMITED: 'rateLimited',
  EMAIL_DELIVERY_FAILED: 'emailDeliveryFailed',
  NOT_FOUND: 'teamSignInUnavailable',
};

export function TeamLogin() {
  const { signInOperator } = useAuth();
  useTeamPage();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function handle(result: PortalTeamLoginResult) {
    if (result.status === 'signedIn') {
      await signInOperator(result.operator);
      navigate('/reports', { replace: true });
    } else if (result.status === 'twoFactorRequired') {
      setCode('');
      setUseRecovery(!result.methods.totp);
      setStep({
        kind: 'twoFactor',
        challengeToken: result.challengeToken,
        totp: result.methods.totp,
      });
    } else {
      setStep({ kind: 'verificationSent', maskedEmail: result.maskedEmail });
    }
  }

  async function submit(event: FormEvent, request: () => Promise<PortalTeamLoginResult>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await handle(await request());
    } catch (failure) {
      const code = failure instanceof PortalApiError ? failure.code : '';
      setError(errorMessages[code] ?? 'requestFailed');
      if (code === 'CHALLENGE_EXPIRED' || code === 'TOO_MANY_ATTEMPTS')
        setStep({ kind: 'credentials' });
    } finally {
      setPending(false);
      setPassword('');
    }
  }

  const errorMessage = error && (
    <p role="alert" className="text-destructive">
      {t(error)}
    </p>
  );
  const back = (
    <Button
      asChild
      variant="link"
      className="h-auto whitespace-normal px-0 underline dark:text-foreground"
    >
      <Link to="/">{t('backToEmailSignIn')}</Link>
    </Button>
  );

  if (step.kind === 'verificationSent')
    return (
      <AuthCard title={t('teamLoginTitle')}>
        <p role="status">{t('teamVerificationSent', { email: step.maskedEmail })}</p>
        {back}
      </AuthCard>
    );

  if (step.kind === 'twoFactor')
    return (
      <AuthCard title={t('twoFactorTitle')}>
        <form
          className="space-y-4"
          onSubmit={(event) =>
            void submit(event, () =>
              portalFetch<PortalTeamLoginResult>('/auth/team/two-factor', {
                method: 'POST',
                body: JSON.stringify({
                  challengeToken: step.challengeToken,
                  ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() }),
                }),
              })
            )
          }
        >
          <div className="space-y-2">
            <Label htmlFor="team-code">
              {t(useRecovery ? 'recoveryCode' : 'authenticatorCode')}
            </Label>
            <Input
              id="team-code"
              autoComplete="one-time-code"
              inputMode={useRecovery ? 'text' : 'numeric'}
              required
              maxLength={useRecovery ? 20 : 10}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-11"
            />
          </div>
          {errorMessage}
          <Button className="h-11 w-full whitespace-normal" disabled={pending}>
            {pending ? t('loading') : t('verify')}
          </Button>
          {step.totp && (
            <Button
              type="button"
              variant="link"
              className="h-auto whitespace-normal px-0 underline dark:text-foreground"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode('');
                setError(null);
              }}
            >
              {t(useRecovery ? 'useAuthenticatorCode' : 'useRecoveryCode')}
            </Button>
          )}
        </form>
        {back}
      </AuthCard>
    );

  return (
    <AuthCard title={t('teamLoginTitle')}>
      <form
        className="space-y-4"
        onSubmit={(event) =>
          void submit(event, () =>
            portalFetch<PortalTeamLoginResult>('/auth/team/login', {
              method: 'POST',
              body: JSON.stringify({ email, password }),
            })
          )
        }
      >
        <div className="space-y-2">
          <Label htmlFor="team-email">{t('email')}</Label>
          <Input
            id="team-email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-password">{t('password')}</Label>
          <Input
            id="team-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11"
          />
        </div>
        {errorMessage}
        <Button className="h-11 w-full whitespace-normal" disabled={pending}>
          {pending ? t('loading') : t('signIn')}
        </Button>
      </form>
      {back}
    </AuthCard>
  );
}
