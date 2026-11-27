import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { usePreference } from './useUserPreferences';
import { useSnooze } from './useSnooze';

const STALE_TIME_MS = 60 * 60 * 1000;
const UPDATE_SNOOZE_KEY = 'bugpin.updateBanner.snoozedUntil';
const WIDGET_SNOOZE_KEY = 'bugpin.widgetPackageWarning.snoozedUntil';

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

export type ReleaseType = 'major' | 'minor' | 'patch';

function parseVersion(version: string): [number, number, number] | null {
  const parts = version.split('-')[0]!.split('.').map(Number);
  if (parts.length < 3 || parts.some((part) => !Number.isInteger(part))) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

function getReleaseType(current: string, latest: string): ReleaseType | null {
  const from = parseVersion(current);
  const to = parseVersion(latest);
  if (!from || !to) return null;
  if (to[0] !== from[0]) return 'major';
  if (to[1] !== from[1]) return 'minor';
  return 'patch';
}

// A dismissal covers the whole release line of its type: every 2.x for a major
// upgrade, every 1.4.x for a minor one, and only the exact version for a patch.
function isSameReleaseLine(dismissed: string, latest: string, type: ReleaseType): boolean {
  const a = parseVersion(dismissed);
  const b = parseVersion(latest);
  if (!a || !b) return false;
  if (type === 'major') return a[0] === b[0];
  if (type === 'minor') return a[0] === b[0] && a[1] === b[1];
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

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
  const current = query.data?.current ?? null;
  const releaseType = current !== null && latest !== null ? getReleaseType(current, latest) : null;
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
  const { isSnoozed, snooze } = useSnooze(UPDATE_SNOOZE_KEY);
  const { isSnoozed: isWidgetWarningSnoozed, snooze: snoozeWidgetWarning } =
    useSnooze(WIDGET_SNOOZE_KEY);
  const hasWidgetWarning = widgetPackage.incompatible && widgetPackage.warningId !== null;

  // A resolved warning forgets its dismissal, so a later warning shows again.
  useEffect(() => {
    if (query.data && !hasWidgetWarning && dismissedWidgetWarningId !== null) {
      setDismissedWidgetWarningId(null);
    }
  }, [query.data, hasWidgetWarning, dismissedWidgetWarningId, setDismissedWidgetWarningId]);

  const isDismissed =
    latest !== null &&
    releaseType !== null &&
    dismissedVersion !== null &&
    isSameReleaseLine(dismissedVersion, latest, releaseType);
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
    releaseType,
    latest,
    releaseUrl,
    isDismissed,
    dismiss,
    isSnoozed,
    snooze,
    widgetPackage,
    isWidgetWarningDismissed,
    dismissWidgetWarning,
    isWidgetWarningSnoozed,
    snoozeWidgetWarning,
  };
}
