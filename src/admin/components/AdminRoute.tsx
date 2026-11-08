import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SETTINGS_HOME_PATH, isSettingsPath } from '../lib/settingsNavigation';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (user?.role !== 'admin') {
    return <Navigate to={isSettingsPath(pathname) ? SETTINGS_HOME_PATH : '/'} replace />;
  }

  return <>{children}</>;
}
