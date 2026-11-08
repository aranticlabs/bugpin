import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '../../lib/apiError';
import { USERS_QUERY_KEY } from './useUsers';

/** A user action that refreshes the user list and reports the outcome in a toast */
export function useUserMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  successMessage: string,
  failureMessage: string,
  onSuccess?: () => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success(successMessage);
      onSuccess?.();
    },
    onError: (error) => toast.error(apiErrorMessage(error, failureMessage)),
  });
}
