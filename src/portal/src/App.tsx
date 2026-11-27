import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Button } from '@shared-ui/components/ui/button';
import { useAuth } from './auth/AuthProvider';
import { takeLoginToken, type LoginToken } from './auth/login-token';
import { useBranding } from './branding/BrandingProvider';
import { useI18n } from './i18n/I18nProvider';
import { AuthCard } from './components/AuthCard';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { TeamStrip } from './components/TeamStrip';
import { LoginRequest } from './pages/LoginRequest';
import { MyReports } from './pages/MyReports';
import { ReportDetail } from './pages/ReportDetail';
import { NewReport } from './pages/NewReport';
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
  const { locale, t } = useI18n();
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
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:p-3">
        {t('skipContent')}
      </a>
      {auth.operator && !auth.loading && <TeamStrip />}
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-8 outline-none sm:px-6"
      >
        {offline && (
          <p role="status" className="mb-4 rounded-md border bg-background p-3">
            {t('reconnecting')}
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
            <Route path="/reports" element={auth.signedIn ? <MyReports /> : <LoginRequest />} />
            <Route
              path="/reports/:id"
              element={auth.signedIn ? <ReportDetail /> : <LoginRequest />}
            />
            <Route
              path="/new"
              element={
                auth.reporter ? (
                  <NewReport />
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
      <Footer />
    </div>
  );
}
