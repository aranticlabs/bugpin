import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TwoFactorStatus } from '@shared/types';

export const TWO_FACTOR_STATUS_KEY = ['two-factor-status'];

/** Enabled explicitly so it also loads while a required two-factor setup pauses other queries */
export function useTwoFactorStatus() {
  return useQuery({
    queryKey: TWO_FACTOR_STATUS_KEY,
    queryFn: async () => {
      const response = await api.get<{ success: boolean; status: TwoFactorStatus }>(
        '/auth/two-factor'
      );
      return response.data.status;
    },
    enabled: true,
  });
}
