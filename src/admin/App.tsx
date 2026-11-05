import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ForcePasswordChangeDialog } from './components/ForcePasswordChangeDialog';
import { ForceTwoFactorSetupDialog } from './components/ForceTwoFactorSetupDialog';
import { Spinner } from './components/ui/spinner';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { LEGACY_PATHS, legacySettingsPath } from './lib/legacyRoutes';

// Lazy load pages for code splitting
const Login = lazyWithRetry(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazyWithRetry(() =>
  import('./pages/workspace/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const Reports = lazyWithRetry(() =>
  import('./pages/workspace/Reports').then((m) => ({ default: m.Reports }))
);
const ReportDetail = lazyWithRetry(() =>
  import('./pages/workspace/ReportDetail').then((m) => ({ default: m.ReportDetail }))
);
const ProjectDetail = lazyWithRetry(() =>
  import('./pages/workspace/ProjectDetail').then((m) => ({ default: m.ProjectDetail }))
);
const ProjectsPage = lazyWithRetry(() =>
  import('./pages/workspace/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);
const SettingsRouter = lazyWithRetry(() =>
  import('./pages/settings/SettingsRouter').then((m) => ({ default: m.SettingsRouter }))
);
const TestWidgetPage = lazyWithRetry(() =>
  import('./pages/TestWidgetPage').then((m) => ({ default: m.TestWidgetPage }))
);
const ResetPassword = lazyWithRetry(() =>
  import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const AcceptInvitation = lazyWithRetry(() =>
  import('./pages/AcceptInvitation').then((m) => ({ default: m.AcceptInvitation }))
);

// Loading component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size="lg" className="text-primary" />
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // The console remounts once a required setup step is done so its paused queries start
  // fresh. The password change comes first, then the two-factor setup.
  const pendingStep = user.mustChangePassword
    ? 'password'
    : user.twoFactorSetupRequired
      ? 'two-factor'
      : 'ready';
  return (
    <>
      <React.Fragment key={pendingStep}>{children}</React.Fragment>
      {pendingStep === 'password' && <ForcePasswordChangeDialog />}
      {pendingStep === 'two-factor' && <ForceTwoFactorSetupDialog />}
    </>
  );
}

function LegacyRedirect() {
  const { pathname, hash } = useLocation();
  return <Navigate to={legacySettingsPath(pathname, hash) ?? '/'} replace />;
}

export function App() {
  const { user } = useAuth();

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log errors in production - could be sent to error tracking service
        console.error('[App Error]', error.message, errorInfo.componentStack);
      }}
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/test-widget" element={<TestWidgetPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/:id" element={<ReportDetail />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="settings/*" element={<SettingsRouter />} />
            {LEGACY_PATHS.map((path) => (
              <Route key={path} path={path.slice(1)} element={<LegacyRedirect />} />
            ))}
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
