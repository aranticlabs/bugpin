import React, { Suspense, lazy, type ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Spinner } from './components/ui/spinner';

// Wrapper around React.lazy that reloads the page once when a chunk fails to load.
// This handles stale tabs after deployments where old chunk filenames no longer exist.
function lazyWithRetry(
  factory: () => Promise<{ default: ComponentType }>
): React.LazyExoticComponent<ComponentType> {
  return lazy(() =>
    factory().catch((error: unknown) => {
      const isChunkError =
        error instanceof Error &&
        (error.message.includes('dynamically imported module') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('Loading chunk'));

      if (isChunkError && !sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {}); // Never resolves — page is reloading
      }

      sessionStorage.removeItem('chunk_reload');
      throw error;
    })
  );
}

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
const Projects = lazyWithRetry(() =>
  import('./pages/workspace/Projects').then((m) => ({ default: m.Projects }))
);
const SettingsPage = lazyWithRetry(() =>
  import('./pages/console/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const NotificationsPage = lazyWithRetry(() =>
  import('./pages/console/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const Users = lazyWithRetry(() =>
  import('./pages/console/Users').then((m) => ({ default: m.Users }))
);
const SecurityPrivacy = lazyWithRetry(() =>
  import('./pages/console/SecurityPrivacy').then((m) => ({ default: m.SecurityPrivacy }))
);
const Branding = lazyWithRetry(() =>
  import('./pages/console/Branding').then((m) => ({ default: m.Branding }))
);
const License = lazyWithRetry(() =>
  import('./pages/console/License').then((m) => ({ default: m.License }))
);
const WidgetButton = lazyWithRetry(() =>
  import('./pages/widget/Button').then((m) => ({ default: m.Button }))
);
const WidgetDialog = lazyWithRetry(() =>
  import('./pages/widget/Dialog').then((m) => ({ default: m.Dialog }))
);
const Screenshot = lazyWithRetry(() =>
  import('./pages/widget/Screenshot').then((m) => ({ default: m.Screenshot }))
);
const Language = lazyWithRetry(() =>
  import('./pages/widget/Language').then((m) => ({ default: m.Language }))
);
const TestWidgetPage = lazyWithRetry(() =>
  import('./pages/TestWidgetPage').then((m) => ({ default: m.TestWidgetPage }))
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

  return <>{children}</>;
}

// Admin-only route wrapper
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
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
            <Route
              path="projects"
              element={
                <AdminRoute>
                  <Projects />
                </AdminRoute>
              }
            />
            <Route
              path="settings"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />
            <Route
              path="notifications"
              element={
                <AdminRoute>
                  <NotificationsPage />
                </AdminRoute>
              }
            />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <Users />
                </AdminRoute>
              }
            />
            <Route
              path="security-privacy"
              element={
                <AdminRoute>
                  <SecurityPrivacy />
                </AdminRoute>
              }
            />
            <Route
              path="branding"
              element={
                <AdminRoute>
                  <Branding />
                </AdminRoute>
              }
            />
            <Route
              path="license"
              element={
                <AdminRoute>
                  <License />
                </AdminRoute>
              }
            />
            <Route
              path="button"
              element={
                <AdminRoute>
                  <WidgetButton />
                </AdminRoute>
              }
            />
            <Route
              path="dialog"
              element={
                <AdminRoute>
                  <WidgetDialog />
                </AdminRoute>
              }
            />
            <Route
              path="screenshot"
              element={
                <AdminRoute>
                  <Screenshot />
                </AdminRoute>
              }
            />
            <Route
              path="language"
              element={
                <AdminRoute>
                  <Language />
                </AdminRoute>
              }
            />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
