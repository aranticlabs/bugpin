export interface ReportOrigin {
  path: string;
  label: string;
}

const DEFAULT_ORIGIN: ReportOrigin = { path: '/reports', label: 'Reports' };

export function reportOriginState(origin: ReportOrigin): { reportOrigin: ReportOrigin } {
  return { reportOrigin: origin };
}

export function readReportOrigin(state: unknown): ReportOrigin {
  if (typeof state !== 'object' || state === null || !('reportOrigin' in state)) {
    return DEFAULT_ORIGIN;
  }
  const origin = (state as { reportOrigin: unknown }).reportOrigin;
  if (
    typeof origin === 'object' &&
    origin !== null &&
    'path' in origin &&
    'label' in origin &&
    typeof origin.path === 'string' &&
    origin.path.startsWith('/') &&
    !origin.path.startsWith('//') &&
    typeof origin.label === 'string' &&
    origin.label.length > 0
  ) {
    return { path: origin.path, label: origin.label };
  }
  return DEFAULT_ORIGIN;
}
