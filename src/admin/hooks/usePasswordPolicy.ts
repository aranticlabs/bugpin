import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from '@shared/password-policy';

/**
 * The admin-configured password strength policy. Public, and enabled explicitly so it
 * also loads while other queries are paused for a required setup step.
 */
export function usePasswordPolicy(): PasswordPolicy {
  const { data } = useQuery({
    queryKey: ['password-policy'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; policy: PasswordPolicy }>(
        '/auth/password-policy'
      );
      return response.data.policy;
    },
    enabled: true,
    staleTime: 60_000,
  });
  return data ?? DEFAULT_PASSWORD_POLICY;
}
