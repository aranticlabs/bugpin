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
import { takeLoginToken, type LoginToken } from './auth/login-token';
import { useBranding } from './branding/BrandingProvider';
import { useI18n } from './i18n/I18nProvider';
import { normalizeLocale } from './i18n/catalog';
import { AuthCard } from './components/AuthCard';
import { LoginRequest } from './pages/LoginRequest';
import { ProfileMenu, languages } from './components/ProfileMenu';
import { MyFeedback } from './pages/MyFeedback';
import { ReportDetail } from './pages/ReportDetail';
import { NewFeedback } from './pages/NewFeedback';
import { usePortalEvents } from './hooks/usePortalEvents';
import { LoginContinue } from './pages/LoginContinue';
import { TeamLogin } from './pages/TeamLogin';
import { TeamLoginContinue } from './pages/TeamLoginContinue';

export function App({ initialToken = null }: { initialToken?: LoginToken | null }) {
  const [loginToken, setLoginToken] = useState<LoginToken | null>(initialToken);
  const token = loginToken?.kind === 'reporter' ? loginToken.token : '';
  const teamToken = loginToken?.kind === 'team' ? loginToken.token : '';
  const [tokenGeneration, setTokenGeneration] = useState(0);
  const offline = usePortalEvents();
  const auth = useAuth();
  const branding = useBranding();
  const { locale, setLocale, t } = useI18n();
  const location = useLocation();
  useEffect(() => {
    const capture = () => {
      const next = takeLoginToken();
      if (next) {
        setLoginToken(next);
        setTokenGeneration((generation) => generation + 1);
      }
    };
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, []);
  useEffect(() => {
    document.getElementById('main-content')?.focus();
  }, [location.pathname, auth.reporter?.id, auth.operator?.id]);
  useEffect(() => {
    if (location.pathname !== '/reports' || !auth.signedIn)
      document.title = `${t('portalTitle')} | ${branding?.appName ?? 'BugPin'}`;
  }, [location.pathname, branding?.appName, locale, auth.signedIn]);
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
          {auth.signedIn ? (
            <ProfileMenu />
          ) : location.pathname.startsWith('/team-login') ? null : (
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
        {offline && (
          <p role="status" className="mb-4 rounded-md border p-3">
            {t('reconnecting')}
          </p>
        )}
        {auth.operator && !auth.loading && (
          <p role="status" className="mb-4 rounded-md border bg-muted p-3 text-sm">
            {t('teamViewBanner')}
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
                    clearToken={() => setLoginToken(null)}
                  />
                ) : (
                  <LoginRequest />
                )
              }
            />
            <Route
              path="/team-login"
              element={auth.signedIn ? <Navigate to="/reports" replace /> : <TeamLogin />}
            />
            <Route
              path="/team-login/verify"
              element={
                teamToken ? (
                  <TeamLoginContinue
                    key={tokenGeneration}
                    token={teamToken}
                    clearToken={() => setLoginToken(null)}
                  />
                ) : (
                  <Navigate to="/team-login" replace />
                )
              }
            />
            <Route
              path="/"
              element={auth.signedIn ? <Navigate to="/reports" replace /> : <LoginRequest />}
            />
            <Route path="/reports" element={auth.signedIn ? <MyFeedback /> : <LoginRequest />} />
            <Route
              path="/reports/:id"
              element={auth.signedIn ? <ReportDetail /> : <LoginRequest />}
            />
            <Route
              path="/new"
              element={
                auth.reporter ? (
                  <NewFeedback />
                ) : auth.operator ? (
                  <Navigate to="/reports" replace />
                ) : (
                  <LoginRequest />
                )
              }
            />
            <Route
              path="*"
              element={
                <AuthCard title={t('notFound')}>
                  <Button asChild variant="link" className="underline dark:text-foreground">
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
