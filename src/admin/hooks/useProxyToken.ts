import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { proxyTokenApi } from '../api/proxy-token';
import type { ProxyTokenStatus } from '../api/proxy-token';
import { apiErrorMessage } from '../lib/apiError';

const proxyTokenKey = ['proxy-token'] as const;

export function useProxyToken() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: proxyTokenKey,
    queryFn: ({ signal }) => proxyTokenApi.get(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const regenerate = useMutation({
    gcTime: 0,
    retry: false,
    onMutate: () => queryClient.cancelQueries({ queryKey: proxyTokenKey }),
    mutationFn: async () => {
      const status = await proxyTokenApi.regenerate();
      await queryClient.cancelQueries({ queryKey: proxyTokenKey });
      if (status.enabled && status.warning) toast.warning(status.warning);
      // Keep the token only in the query, not in the mutation's result cache.
      queryClient.setQueryData<ProxyTokenStatus>(proxyTokenKey, (current) =>
        current ? status : undefined
      );
    },
    onSuccess: () => {
      const status = queryClient.getQueryData<ProxyTokenStatus>(proxyTokenKey);
      if (status?.enabled && !status.warning) toast.success('Proxy token regenerated');
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to regenerate proxy token')),
  });

  return { ...query, regenerate };
}
