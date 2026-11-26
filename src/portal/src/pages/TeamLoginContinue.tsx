import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import type { PortalOperator } from '@shared/portal-types';
import { PortalApiError, portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n, useTeamPage } from '../i18n/I18nProvider';
import { AuthCard } from '../components/AuthCard';

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
  const { signInOperator } = useAuth();
  useTeamPage();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    setPreview(null);
    setFailed(false);
    void portalFetch<Preview>('/auth/team/verify/preview', {
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
    return () => abort.abort();
  }, [token]);

  async function proceed() {
    setPending(true);
    setFailed(false);
    try {
      const result = await portalFetch<{ operator: PortalOperator }>('/auth/team/verify/exchange', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      await signInOperator(result.operator);
      navigate('/reports', { replace: true });
      clearToken();
    } catch (error) {
      if (error instanceof PortalApiError && error.code === 'INVALID_TOKEN')
        setPreview({ state: 'invalid' });
      else setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={
        preview?.state === 'valid'
          ? t('teamConfirmTitle', { email: preview.maskedEmail })
          : t('teamLoginTitle')
      }
    >
      {!preview && !failed && <p role="status">{t('loading')}</p>}
      {failed && (
        <p role="alert" className="text-destructive">
          {t('requestFailed')}
        </p>
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
