import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { dashboardKeys } from './useDashboard';
import type { GamificationSelf, GamificationSettings } from '@shared/types';

export const gamificationKeys = {
  all: ['gamification'] as const,
  settings: () => [...gamificationKeys.all, 'settings'] as const,
  self: () => [...gamificationKeys.all, 'me'] as const,
};

type ApiError = Error & { response?: { data?: { message?: string } } };

export type GamificationSettingsChanges = Partial<Omit<GamificationSettings, 'users'>> & {
  users?: Record<string, boolean>;
};

/** Whether gamification is available to the signed-in user and whether they opted out */
export function useGamificationSelf() {
  return useQuery({
    queryKey: gamificationKeys.self(),
    queryFn: async () => (await api.get('/gamification/me')).data.gamification as GamificationSelf,
  });
}

export function useGamificationSettings() {
  return useQuery({
    queryKey: gamificationKeys.settings(),
    queryFn: async () => (await api.get('/gamification')).data.gamification as GamificationSettings,
  });
}

export function useUpdateGamificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: GamificationSettingsChanges) =>
      (await api.put('/gamification', changes)).data.gamification as GamificationSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(gamificationKeys.settings(), next);
      queryClient.invalidateQueries({ queryKey: gamificationKeys.self() });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Gamification settings saved');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to save gamification settings');
    },
  });
}

export function useSetGamificationOptOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (optedOut: boolean) =>
      (await api.patch('/gamification/me', { optedOut })).data.gamification as GamificationSelf,
    onSuccess: (next) => {
      queryClient.setQueryData(gamificationKeys.self(), next);
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      toast.success(next.optedOut ? 'Gamification turned off' : 'Gamification turned on');
    },
    onError: (error: ApiError) => {
      toast.error(error.response?.data?.message || 'Failed to save your choice');
    },
  });
}
