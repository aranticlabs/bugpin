import { useQuery } from '@tanstack/react-query';
import { portalApi } from '../api/reports';
import { useAuth } from '../auth/AuthProvider';

/** Reports with replies the reporter has not seen yet, across all projects and statuses */
export function useUnreadCount(): number {
  const { reporter } = useAuth();
  const query = useQuery({
    queryKey: ['portal', 'reports', 'unread'],
    queryFn: ({ signal }) => portalApi.list({ limit: 1 }, signal),
    enabled: Boolean(reporter),
    select: (list) => list.unreadCount,
  });
  return reporter ? (query.data ?? 0) : 0;
}
