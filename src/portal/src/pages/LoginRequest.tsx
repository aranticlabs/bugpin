import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck } from 'lucide-react';
import { Button } from '@shared-ui/components/ui/button';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import { portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useBranding } from '../branding/BrandingProvider';
import { useI18n } from '../i18n/I18nProvider';
import type { Catalog } from '../i18n/catalog';
import { errorKey } from '../i18n/error-key';
import { AuthCard } from '../components/AuthCard';

export function LoginRequest() {
  const { expired } = useAuth();
  const { locale, t } = useI18n();
  const branding = useBranding();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<keyof Catalog | null>(null);
  const inFlight = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await portalFetch('/auth/request', {
        method: 'POST',
        body: JSON.stringify({ email, locale }),
      });
      setSent(true);
    } catch (err) {
      setError(errorKey(err));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <AuthCard
      title={t('loginTitle')}
      description={t('loginIntro')}
      footer={
        branding?.teamSignIn && (
          <p className="text-center text-sm text-muted-foreground">
            <Link
              to="/team-login"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t('teamSignInLink')}
            </Link>
          </p>
        )
      }
    >
      {expired && <p role="status">{t('sessionExpired')}</p>}
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MailCheck className="size-6" aria-hidden />
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {t('linkSent')}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={pending}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive">
              {t(error)}
            </p>
          )}
          <Button className="w-full whitespace-normal" disabled={pending}>
            {!pending && <Mail />}
            {pending ? t('loading') : t('sendLink')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t('loginHint')}</p>
        </form>
      )}
    </AuthCard>
  );
}
