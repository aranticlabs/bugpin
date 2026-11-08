import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { apiErrorMessage } from '../../lib/apiError';
import type { DefaultProjectReference, User, UserRole } from '@shared/types';

export const USERS_QUERY_KEY = ['users'] as const;
const DEFAULT_PROJECTS_MUTATION_KEY = ['users', 'default-projects'] as const;

/** All users. With `enabled: false` it only reads what another component already loaded. */
export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => (await api.get('/users')).data.users as User[],
    enabled,
  });
}

interface UserUpdate {
  id: string;
  role?: UserRole;
  isActive?: boolean;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UserUpdate) => api.patch(`/users/${id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('User updated');
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update the user')),
  });
}

interface DefaultProjectsChange {
  userId: string;
  projects: DefaultProjectReference[];
}

/**
 * Toggles default projects with an optimistic cache update. Each click builds on the cached list
 * including still pending clicks, and the requests run one after another, so quick successive
 * clicks never drop an assignment.
 */
export function useToggleDefaultProject() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: DEFAULT_PROJECTS_MUTATION_KEY,
    scope: { id: DEFAULT_PROJECTS_MUTATION_KEY.join(':') },
    mutationFn: ({ userId, projects }: DefaultProjectsChange) =>
      api.patch(`/users/${userId}`, { defaultProjectIds: projects.map((project) => project.id) }),
    onMutate: async ({ userId, projects }) => {
      await queryClient.cancelQueries({ queryKey: USERS_QUERY_KEY });
      const previous = queryClient.getQueryData<User[]>(USERS_QUERY_KEY);
      queryClient.setQueryData<User[]>(USERS_QUERY_KEY, (users) =>
        users?.map((user) => (user.id === userId ? { ...user, defaultProjects: projects } : user))
      );
      return { previous };
    },
    onError: (error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(USERS_QUERY_KEY, context.previous);
      toast.error(apiErrorMessage(error, 'Failed to update default projects'));
    },
    onSuccess: () => toast.success('Default projects updated'),
    onSettled: () => {
      // A refetch while later clicks are still queued would overwrite their optimistic state.
      if (queryClient.isMutating({ mutationKey: DEFAULT_PROJECTS_MUTATION_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return (user: User, project: DefaultProjectReference, checked: boolean) => {
    const latest =
      queryClient.getQueryData<User[]>(USERS_QUERY_KEY)?.find((item) => item.id === user.id) ??
      user;
    const others = (latest.defaultProjects ?? []).filter((item) => item.id !== project.id);
    mutation.mutate({
      userId: user.id,
      projects: checked ? [...others, { id: project.id, name: project.name }] : others,
    });
  };
}
