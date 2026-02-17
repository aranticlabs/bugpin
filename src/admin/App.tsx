import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Spinner } from './components/ui/spinner';

// Lazy load pages for code splitting
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const ReportDetail = lazy(() =>
  import('./pages/ReportDetail').then((m) => ({ default: m.ReportDetail })),
);
const Projects = lazy(() => import('./pages/Projects').then((m) => ({ default: m.Projects })));
const Settings = lazy(() =>
  import('./pages/globalsettings').then((m) => ({ default: m.Settings })),
);
const TestWidgetPage = lazy(() =>
  import('./pages/TestWidgetPage').then((m) => ({ default: m.TestWidgetPage })),
);
const AcceptInvitation = lazy(() =>
  import('./pages/AcceptInvitation').then((m) => ({ default: m.AcceptInvitation })),
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
              path="globalsettings"
              element={
                <AdminRoute>
                  <Settings />
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
