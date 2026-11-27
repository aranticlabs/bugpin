import { useQuery } from '@tanstack/react-query';
import { portalApi } from '../api/reports';

export function useProjects(enabled = true) {
  return useQuery({
    queryKey: ['portal', 'projects'],
    queryFn: ({ signal }) => portalApi.projects(signal),
    enabled,
  });
}
