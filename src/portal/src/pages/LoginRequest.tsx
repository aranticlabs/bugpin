import { useState, type FormEvent } from 'react';
import { Button } from '@shared-ui/components/ui/button';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import { portalFetch } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { AuthCard } from '../components/AuthCard';

export function LoginRequest() {
  const { expired } = useAuth();
  const { locale, t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    try {
      await portalFetch('/auth/request', {
        method: 'POST',
        body: JSON.stringify({ email, locale }),
      });
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <AuthCard title={t('loginTitle')}>
      {expired && <p role="status">{t('sessionExpired')}</p>}
      {sent ? (
        <p role="status">{t('linkSent')}</p>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11"
            />
          </div>
          {failed && (
            <p role="alert" className="text-destructive">
              {t('requestFailed')}
            </p>
          )}
          <Button className="h-11 w-full whitespace-normal" disabled={pending}>
            {pending ? t('loading') : t('sendLink')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
