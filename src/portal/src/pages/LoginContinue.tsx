import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import type { PortalMe } from '@shared/portal-types';
import { PortalApiError, portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { AuthCard } from '../components/AuthCard';

type Preview =
  | { state: 'valid'; maskedEmail: string }
  | { state: 'expired'; maskedEmail: string; canResend: boolean }
  | { state: 'invalid' };

export function LoginContinue({ token, clearToken }: { token: string; clearToken: () => void }) {
  const { reporter, signIn, reconcileSession } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    const abort = new AbortController();
    setPreview(null);
    setSent(false);
    setFailed(false);
    void portalFetch<Preview>('/auth/preview', {
      method: 'POST',
      body: JSON.stringify({ token }),
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) setPreview(result);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => {
      generation.current++;
      abort.abort();
    };
  }, [token]);

  async function proceed() {
    const requestGeneration = generation.current;
    const isCurrent = () => requestGeneration === generation.current;
    setPending(true);
    setFailed(false);
    try {
      if (preview?.state === 'expired') {
        await portalFetch('/auth/resend', {
          method: 'POST',
          body: JSON.stringify({ token, locale }),
        });
        setSent(true);
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
    } catch (error) {
      if (!isCurrent()) {
        if (preview?.state === 'valid') await reconcileSession();
        return;
      }
      if (error instanceof PortalApiError && error.code === 'INVALID_TOKEN')
        setPreview({ state: 'invalid' });
      else setFailed(true);
    } finally {
      if (isCurrent()) setPending(false);
    }
  }

  const masked = preview && preview.state !== 'invalid' ? preview.maskedEmail : '';
  const current = reporter?.email.replace(/^(.).*(@.*)$/, '$1***$2') ?? '';
  return (
    <AuthCard
      title={preview?.state === 'valid' ? t('signInAs', { email: masked }) : t('loginTitle')}
    >
      {!preview && !failed && <p role="status">{t('loading')}</p>}
      {failed && (
        <p role="alert" className="text-destructive">
          {t('requestFailed')}
        </p>
      )}
      {sent ? (
        <p role="status">{t('linkSent')}</p>
      ) : (
        <>
          {preview?.state === 'valid' && reporter && (
            <p>{t('switchAccount', { email: current })}</p>
          )}
          {preview?.state === 'expired' && (
            <p>
              {t(preview.canResend ? 'linkExpired' : 'requestedLinkExpired', { email: masked })}
            </p>
          )}
          {preview?.state === 'invalid' && <p role="alert">{t('linkInvalid')}</p>}
          {preview &&
            (preview.state === 'valid' || (preview.state === 'expired' && preview.canResend)) && (
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
      <Button asChild variant="link" className="h-auto whitespace-normal px-0">
        <Link to="/" onClick={clearToken}>
          {t('requestNewLink')}
        </Link>
      </Button>
    </AuthCard>
  );
}
