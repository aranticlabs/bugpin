import type {
  PortalMe,
  PortalProject,
  PortalReportBoard,
  PortalReportDetail,
  PortalReportList,
} from '@shared/portal-types';
import type { ReportStatus } from '@shared/types';
import { portalFetch } from './client';

function reportQuery(filters: {
  projectId?: string;
  status?: ReportStatus;
  cursor?: string;
  groupByStatus?: boolean;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) query.set(key, String(value));
  return `/reports?${query}`;
}

export const portalApi = {
  projects: async (signal?: AbortSignal) =>
    (await portalFetch<{ projects: PortalProject[] }>('/projects', { signal })).projects,
  list: (filters: Parameters<typeof reportQuery>[0], signal?: AbortSignal) =>
    portalFetch<PortalReportList>(reportQuery(filters), { signal }),
  board: (filters: Parameters<typeof reportQuery>[0], signal?: AbortSignal) =>
    portalFetch<PortalReportBoard>(reportQuery({ ...filters, groupByStatus: true }), { signal }),
  detail: async (id: string, signal?: AbortSignal) =>
    (
      await portalFetch<{ report: PortalReportDetail }>(`/reports/${encodeURIComponent(id)}`, {
        signal,
      })
    ).report,
  profile: async (changes: Partial<Pick<PortalMe, 'displayName' | 'locale' | 'emailUpdates'>>) =>
    (
      await portalFetch<{ reporter: PortalMe }>('/me', {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })
    ).reporter,
};
