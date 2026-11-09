import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared-ui/components/ui/select';
import { useAuth } from './auth/AuthProvider';
import { takeLoginToken } from './auth/login-token';
import { useBranding } from './branding/BrandingProvider';
import { useI18n } from './i18n/I18nProvider';
import { normalizeLocale } from './i18n/catalog';
import { AuthCard } from './components/AuthCard';
import { LoginRequest } from './pages/LoginRequest';
import { LoginContinue } from './pages/LoginContinue';

const languages = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  nl: 'Nederlands',
  zh: '中文',
};

export function App({ initialToken = '' }: { initialToken?: string }) {
  const [token, setToken] = useState(initialToken);
  const [tokenGeneration, setTokenGeneration] = useState(0);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const auth = useAuth();
  const branding = useBranding();
  const { locale, setLocale, t } = useI18n();
  const location = useLocation();
  useEffect(() => {
    const capture = () => {
      const next = takeLoginToken();
      if (next) {
        setToken(next);
        setTokenGeneration((generation) => generation + 1);
      }
    };
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, []);
  useEffect(() => {
    document.getElementById('main-content')?.focus();
    document.title = `${t('portalTitle')} | ${branding?.appName ?? 'BugPin'}`;
  }, [location.pathname, branding?.appName, locale]);
  async function logout() {
    setSigningOut(true);
    setLogoutFailed(false);
    try {
      await auth.signOut();
    } catch {
      setLogoutFailed(true);
    } finally {
      setSigningOut(false);
    }
  }
  const logo = branding?.branding;
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:p-3">
        {t('skipContent')}
      </a>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="min-w-0 max-w-full" aria-label={branding?.appName ?? 'BugPin'}>
            <picture>
              <source
                media="(prefers-color-scheme: dark)"
                srcSet={logo?.logoDarkUrl ?? '/branding/dark/logo-dark.svg'}
              />
              <img
                src={logo?.logoLightUrl ?? '/branding/light/logo-light.svg'}
                alt={branding?.appName ?? 'BugPin'}
                className="h-8 max-w-full object-contain"
              />
            </picture>
          </Link>
          {auth.reporter ? (
            <div className="flex min-w-0 max-w-full items-center gap-3">
              <span className="truncate">{auth.reporter.displayName}</span>
              <Button
                variant="outline"
                className="h-11 shrink-0"
                disabled={signingOut}
                onClick={() => void logout()}
              >
                {t('signOut')}
              </Button>
            </div>
          ) : (
            <Select
              value={locale}
              onValueChange={(value) => {
                const next = normalizeLocale(value);
                if (next) setLocale(next);
              }}
            >
              <SelectTrigger className="h-11 w-36" aria-label={t('language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(languages).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 sm:py-12"
      >
        {logoutFailed && (
          <p role="alert" className="mb-4 text-destructive">
            {t('requestFailed')}
          </p>
        )}
        {auth.loading ? (
          <p role="status">{t('loading')}</p>
        ) : auth.error ? (
          <AuthCard title={t('requestFailed')}>
            <Button className="h-11" onClick={auth.refresh}>
              {t('retry')}
            </Button>
          </AuthCard>
        ) : (
          <Routes>
            <Route
              path="/login"
              element={
                token ? (
                  <LoginContinue
                    key={tokenGeneration}
                    token={token}
                    clearToken={() => setToken('')}
                  />
                ) : (
                  <LoginRequest />
                )
              }
            />
            <Route
              path="/"
              element={auth.reporter ? <Navigate to="/reports" replace /> : <LoginRequest />}
            />
            <Route
              path="/reports/*"
              element={
                auth.reporter ? (
                  <h1 className="text-2xl font-semibold">{t('myFeedback')}</h1>
                ) : (
                  <LoginRequest />
                )
              }
            />
            <Route
              path="*"
              element={
                <AuthCard title={t('notFound')}>
                  <Button asChild variant="link">
                    <Link to="/">{t('backHome')}</Link>
                  </Button>
                </AuthCard>
              }
            />
          </Routes>
        )}
      </main>
      {!branding?.hideFooterBranding && (
        <footer className="border-t px-4 py-5 text-center text-sm text-muted-foreground">
          <a
            href="https://bugpin.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center"
          >
            {t('poweredBy')}
          </a>
        </footer>
      )}
    </div>
  );
}
