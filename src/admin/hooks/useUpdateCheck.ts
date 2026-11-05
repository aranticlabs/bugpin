import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { usePreference } from './useUserPreferences';

const STALE_TIME_MS = 60 * 60 * 1000;

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

const keepLegacyValue = (raw: string) => raw;

export function useUpdateCheck() {
  const { user, canLoadData } = useAuth();
  const isAdmin = user?.role === 'admin';

  const query = useQuery({
    queryKey: ['version'],
    queryFn: async () => {
      const response = await api.get('/version');
      return response.data as VersionResponse;
    },
    enabled: isAdmin && canLoadData,
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

  const [dismissedVersion, setDismissedVersion] = usePreference('dismissedUpdateVersion', null, {
    legacyKey: 'bugpin.updateBanner.dismissedVersion',
    parseLegacy: keepLegacyValue,
  });
  const [dismissedWidgetWarningId, setDismissedWidgetWarningId] = usePreference(
    'dismissedWidgetWarningId',
    null,
    { legacyKey: 'bugpin.widgetPackageWarning.dismissedId', parseLegacy: keepLegacyValue }
  );
  const hasWidgetWarning = widgetPackage.incompatible && widgetPackage.warningId !== null;

  // A resolved warning forgets its dismissal, so a later warning shows again.
  useEffect(() => {
    if (query.data && !hasWidgetWarning && dismissedWidgetWarningId !== null) {
      setDismissedWidgetWarningId(null);
    }
  }, [query.data, hasWidgetWarning, dismissedWidgetWarningId, setDismissedWidgetWarningId]);

  const isDismissed = latest !== null && dismissedVersion === latest;
  const isWidgetWarningDismissed =
    widgetPackage.warningId !== null && dismissedWidgetWarningId === widgetPackage.warningId;

  const dismiss = () => {
    if (latest) setDismissedVersion(latest);
  };

  const dismissWidgetWarning = () => {
    if (widgetPackage.warningId) setDismissedWidgetWarningId(widgetPackage.warningId);
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
