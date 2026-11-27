import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import { maskEmail } from '@shared/mask-email';
import type { PortalMe } from '@shared/portal-types';
import { PortalApiError, portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { Catalog } from '../i18n/catalog';
import { AuthCard } from '../components/AuthCard';

type Preview =
  | { state: 'valid'; maskedEmail: string }
  | { state: 'expired'; maskedEmail: string }
  | { state: 'invalid' };

function failureKey(error: unknown): keyof Catalog {
  return error instanceof PortalApiError && error.code === 'RATE_LIMITED'
    ? 'rateLimited'
    : 'requestFailed';
}

export function LoginContinue({ token, clearToken }: { token: string; clearToken: () => void }) {
  const auth = useAuth();
  const { signIn, reconcileSession } = auth;
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<keyof Catalog | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    const abort = new AbortController();
    setPreview(null);
    setSent(false);
    setError(null);
    void portalFetch<Preview>('/auth/preview', {
      method: 'POST',
      body: JSON.stringify({ token }),
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) setPreview(result);
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setError(failureKey(failure));
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
      if (preview?.state === 'expired') {
        await portalFetch('/auth/resend', {
          method: 'POST',
          body: JSON.stringify({ token, locale }),
        });
        if (isCurrent()) setSent(true);
      } else {
        const result = await portalFetch<{ reporter: PortalMe; targetReportId?: string }>(
          '/auth/exchange',
          { method: 'POST', body: JSON.stringify({ token }) }
        );
        if (!isCurrent()) {
          await reconcileSession();
          return;
        }
        await signIn(result.reporter);
        if (!isCurrent()) {
          await reconcileSession();
          return;
        }
        navigate(
          result.targetReportId
            ? `/reports/${encodeURIComponent(result.targetReportId)}`
            : '/reports',
          { replace: true }
        );
        clearToken();
      }
    } catch (failure) {
      if (!isCurrent()) {
        if (preview?.state === 'valid') await reconcileSession();
        return;
      }
      if (failure instanceof PortalApiError && failure.code === 'INVALID_TOKEN')
        setPreview({ state: 'invalid' });
      else setError(failureKey(failure));
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  const masked = preview && preview.state !== 'invalid' ? preview.maskedEmail : '';
  const activeEmail = auth.reporter?.email ?? auth.operator?.email;
  return (
    <AuthCard
      title={preview?.state === 'valid' ? t('confirmSignIn') : t('loginTitle')}
      description={preview?.state === 'valid' ? t('signingInAs', { email: masked }) : undefined}
    >
      {!preview && !error && <p role="status">{t('loading')}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {t(error)}
        </p>
      )}
      {sent ? (
        <p role="status">{t('linkSent')}</p>
      ) : (
        <>
          {preview?.state === 'valid' && activeEmail && (
            <p>{t('switchAccount', { email: maskEmail(activeEmail) })}</p>
          )}
          {preview?.state === 'expired' && <p>{t('linkExpired', { email: masked })}</p>}
          {preview?.state === 'invalid' && <p role="alert">{t('linkInvalid')}</p>}
          {preview && (preview.state === 'valid' || preview.state === 'expired') && (
            <Button
              className="h-11 w-full whitespace-normal"
              disabled={pending}
              onClick={() => void proceed()}
            >
              {pending ? t('loading') : t(preview.state === 'expired' ? 'resend' : 'continue')}
            </Button>
          )}
        </>
      )}
      <Button
        asChild
        variant="link"
        className="mx-auto flex h-auto w-fit whitespace-normal px-0 underline dark:text-foreground"
      >
        <Link to="/" onClick={clearToken}>
          {t('requestNewLink')}
        </Link>
      </Button>
    </AuthCard>
  );
}
