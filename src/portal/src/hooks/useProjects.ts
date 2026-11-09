import { useQuery } from '@tanstack/react-query';
import { portalApi } from '../api/reports';

export function useProjects() {
  return useQuery({
    queryKey: ['portal', 'projects'],
    queryFn: ({ signal }) => portalApi.projects(signal),
  });
}
