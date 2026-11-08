import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { browserTimeZone, OPEN_STATUS_FILTER } from '../lib/dashboard';
import { ASSIGNED_TO_ME_FILTER } from '@shared/types';
import type {
  DashboardOverview,
  DashboardPersonal,
  DashboardRange,
  GamificationTeam,
  Report,
  TeamPeriod,
  ReportStatus,
} from '@shared/types';

const REFRESH_MS = 30_000;

type ReportListKind = 'mine' | 'recent';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: (projectId: string | undefined, range: DashboardRange) =>
    [...dashboardKeys.all, 'overview', projectId ?? null, range] as const,
  /** Keyed by user so one account never renders another account's numbers from the cache */
  personal: (userId: string | undefined) =>
    [...dashboardKeys.all, 'personal', userId ?? null] as const,
  team: (period: TeamPeriod) => [...dashboardKeys.all, 'team', period] as const,
  reports: (projectId: string | undefined, kind: ReportListKind) =>
    [...dashboardKeys.all, 'reports', projectId ?? null, kind] as const,
};

export function useDashboardOverview(projectId: string | undefined, range: DashboardRange) {
  return useQuery({
    queryKey: dashboardKeys.overview(projectId, range),
    queryFn: async () => {
      const response = await api.get('/dashboard/overview', {
        params: { projectId, range, timeZone: browserTimeZone() },
      });
      return response.data.overview as DashboardOverview;
    },
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardPersonal(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.personal(userId),
    queryFn: async () => {
      const response = await api.get('/dashboard/me', {
        params: { timeZone: browserTimeZone() },
      });
      return response.data.personal as DashboardPersonal;
    },
    enabled: enabled && userId !== undefined,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardTeam(period: TeamPeriod) {
  return useQuery({
    queryKey: dashboardKeys.team(period),
    queryFn: async () => {
      const response = await api.get('/dashboard/team', { params: { period } });
      return response.data.team as GamificationTeam;
    },
    placeholderData: keepPreviousData,
  });
}

export interface DashboardReportList {
  reports: Report[];
  /** Every matching report; the list holds only the first page */
  total: number;
}

interface ReportListOptions {
  projectId?: string;
  assignedToMe?: boolean;
  enabled?: boolean;
}

export function useDashboardReports({
  projectId,
  assignedToMe,
  enabled = true,
}: ReportListOptions) {
  return useQuery({
    queryKey: dashboardKeys.reports(projectId, assignedToMe ? 'mine' : 'recent'),
    queryFn: async () => {
      const params: Record<string, string> = assignedToMe
        ? {
            assignedTo: ASSIGNED_TO_ME_FILTER,
            status: OPEN_STATUS_FILTER,
            sortBy: 'priority',
            sortOrder: 'desc',
            limit: '10',
          }
        : { sortBy: 'createdAt', sortOrder: 'desc', limit: '6' };
      if (projectId) params.projectId = projectId;
      const response = await api.get('/reports', { params });
      return {
        reports: response.data.data as Report[],
        total: response.data.total as number,
      } satisfies DashboardReportList;
    },
    enabled,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}

interface ReportChange {
  id: string;
  status?: ReportStatus;
  assignedTo?: string;
}

export function useUpdateDashboardReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...changes }: ReportChange) => {
      await api.patch(`/reports/${id}`, changes);
    },
    onSuccess: (_, change) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['report', change.id] });
      toast.success(change.status === 'resolved' ? 'Report resolved' : 'Report assigned');
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to update the report');
    },
  });
}
