import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const STALE_TIME_MS = 60 * 60 * 1000;
const UPDATE_DISMISS_KEY = 'bugpin.updateBanner.dismissedVersion';
const WIDGET_DISMISS_KEY = 'bugpin.widgetPackageWarning.dismissedId';

interface IncompatibleWidgetProject {
  projectId: string;
  projectName: string;
  observedVersions: string[];
  deploymentCount: number;
}

interface WidgetPackageCompatibilityStatus {
  minimumSupportedVersion: string;
  incompatible: boolean;
  warningId: string | null;
  affectedProjects: IncompatibleWidgetProject[];
}

interface VersionResponse {
  success: boolean;
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
  lastCheckedAt: string | null;
  checkEnabled: boolean;
  widgetPackage: WidgetPackageCompatibilityStatus;
}

function readDismissal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDismissal(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable (private mode, quota); the banner stays dismissed for the session via state.
  }
}

function clearDismissal(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage may be unavailable; state still reflects the server response.
  }
}

export function useUpdateCheck() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const query = useQuery({
    queryKey: ['version'],
    queryFn: async () => {
      const response = await api.get('/version');
      return response.data as VersionResponse;
    },
    enabled: isAdmin,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const latest = query.data?.latest ?? null;
  const releaseUrl = query.data?.releaseUrl ?? null;
  const updateAvailable = query.data?.updateAvailable ?? false;
  const checkEnabled = query.data?.checkEnabled ?? false;
  const widgetPackage = query.data?.widgetPackage ?? {
    minimumSupportedVersion: '',
    incompatible: false,
    warningId: null,
    affectedProjects: [],
  };

  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    readDismissal(UPDATE_DISMISS_KEY)
  );
  const [dismissedWidgetWarningId, setDismissedWidgetWarningId] = useState<string | null>(() =>
    readDismissal(WIDGET_DISMISS_KEY)
  );

  useEffect(() => {
    setDismissedVersion(readDismissal(UPDATE_DISMISS_KEY));
  }, [latest]);

  useEffect(() => {
    if (!query.data) return;
    if (!widgetPackage.incompatible || !widgetPackage.warningId) {
      clearDismissal(WIDGET_DISMISS_KEY);
      setDismissedWidgetWarningId(null);
      return;
    }
    setDismissedWidgetWarningId(readDismissal(WIDGET_DISMISS_KEY));
  }, [query.data, widgetPackage.incompatible, widgetPackage.warningId]);

  const isDismissed = latest !== null && dismissedVersion === latest;
  const isWidgetWarningDismissed =
    widgetPackage.warningId !== null && dismissedWidgetWarningId === widgetPackage.warningId;

  const dismiss = () => {
    if (!latest) return;
    writeDismissal(UPDATE_DISMISS_KEY, latest);
    setDismissedVersion(latest);
  };

  const dismissWidgetWarning = () => {
    if (!widgetPackage.warningId) return;
    writeDismissal(WIDGET_DISMISS_KEY, widgetPackage.warningId);
    setDismissedWidgetWarningId(widgetPackage.warningId);
  };

  return {
    isAdmin,
    checkEnabled,
    updateAvailable,
    latest,
    releaseUrl,
    isDismissed,
    dismiss,
    widgetPackage,
    isWidgetWarningDismissed,
    dismissWidgetWarning,
  };
}
