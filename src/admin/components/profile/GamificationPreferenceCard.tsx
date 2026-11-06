import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { SettingsCard } from '../ui/settings-card';
import { SettingRow, SettingRows } from '../ui/setting-row';
import { Switch } from '../ui/switch';
import { useGamificationSelf } from '../../hooks/useDashboard';
import type { GamificationSelf } from '@shared/types';

const QUERY_KEY = ['gamification', 'me'];

/** Shown only while the workspace lets this user turn gamification off for themselves */
export function GamificationPreferenceCard() {
  const queryClient = useQueryClient();
  const { data } = useGamificationSelf();

  const mutation = useMutation({
    mutationFn: async (optedOut: boolean) =>
      (await api.patch('/gamification/me', { optedOut })).data.gamification as GamificationSelf,
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(next.optedOut ? 'Gamification turned off' : 'Gamification turned on');
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Failed to save your choice');
    },
  });

  if (!data?.canOptOut) return null;

  return (
    <SettingsCard title="Gamification" description="Levels, achievements and the team ranking">
      <SettingRows>
        <SettingRow
          label="Enable gamification"
          htmlFor="gamification-self"
          description="When off, you don't see levels or achievements and you don't appear in the team ranking. Your past work still counts if you turn it back on. Your time to resolve is always shown."
        >
          <Switch
            id="gamification-self"
            checked={!data.optedOut}
            disabled={mutation.isPending}
            onCheckedChange={(shown) => mutation.mutate(!shown)}
          />
        </SettingRow>
      </SettingRows>
    </SettingsCard>
  );
}
