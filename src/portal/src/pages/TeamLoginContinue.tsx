import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import { maskEmail } from '@shared/mask-email';
import type { PortalOperator } from '@shared/portal-types';
import { PortalApiError, portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, useTeamPage } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/catalog';
import { AuthCard } from '../components/AuthCard';
import { teamErrorMessages } from './TeamLogin';

type Preview =
  | { state: 'valid'; maskedEmail: string }
  | { state: 'expired'; maskedEmail: string }
  | { state: 'invalid' };

export function TeamLoginContinue({
  token,
  clearToken,
}: {
  token: string;
  clearToken: () => void;
}) {
  const auth = useAuth();
  const { signInOperator, reconcileSession } = auth;
  useTeamPage();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    const abort = new AbortController();
    setPreview(null);
    setError(null);
    void portalFetch<Preview>('/auth/team/verify/preview', {
      method: 'POST',
      body: JSON.stringify({ token }),
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) setPreview(result);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) {
          const code = failure instanceof PortalApiError ? failure.code : '';
          setError(teamErrorMessages[code] ?? 'requestFailed');
        }
      });
    return () => {
      generation.current++;
      abort.abort();
    };
  }, [token]);

  async function proceed() {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestGeneration = generation.current;
    const isCurrent = () => requestGeneration === generation.current;
    setPending(true);
    setError(null);
    try {
      const result = await portalFetch<{ operator: PortalOperator }>('/auth/team/verify/exchange', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      if (!isCurrent()) {
        await reconcileSession();
        return;
      }
      await signInOperator(result.operator);
      if (!isCurrent()) {
        await reconcileSession();
        return;
      }
      navigate('/reports', { replace: true });
      clearToken();
    } catch (failure) {
      if (!isCurrent()) {
        await reconcileSession();
        return;
      }
      if (failure instanceof PortalApiError && failure.code === 'INVALID_TOKEN')
        setPreview({ state: 'invalid' });
      else {
        const code = failure instanceof PortalApiError ? failure.code : '';
        setError(teamErrorMessages[code] ?? 'requestFailed');
      }
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  const activeEmail = auth.reporter?.email ?? auth.operator?.email;

  return (
    <AuthCard
      title={
        preview?.state === 'valid'
          ? t('teamConfirmTitle', { email: preview.maskedEmail })
          : t('teamLoginTitle')
      }
    >
      {!preview && !error && <p role="status">{t('loading')}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {t(error)}
        </p>
      )}
      {preview?.state === 'valid' && activeEmail && (
        <p>{t('switchAccount', { email: maskEmail(activeEmail) })}</p>
      )}
      {preview?.state === 'expired' && <p>{t('teamLinkExpired')}</p>}
      {preview?.state === 'invalid' && <p role="alert">{t('linkInvalid')}</p>}
      {preview?.state === 'valid' && (
        <Button
          className="h-11 w-full whitespace-normal"
          disabled={pending}
          onClick={() => void proceed()}
        >
          {pending ? t('loading') : t('continue')}
        </Button>
      )}
      <Button
        asChild
        variant="link"
        className="h-auto whitespace-normal px-0 underline dark:text-foreground"
      >
        <Link to="/team-login" onClick={clearToken}>
          {t('signInAgain')}
        </Link>
      </Button>
    </AuthCard>
  );
}
