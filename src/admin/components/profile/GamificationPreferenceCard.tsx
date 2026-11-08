import { SettingsCard } from '../ui/settings-card';
import { SettingRow, SettingRows } from '../ui/setting-row';
import { Switch } from '../ui/switch';
import { useGamificationSelf, useSetGamificationOptOut } from '../../hooks/useGamification';

/** Shown only while the workspace lets this user turn gamification off for themselves */
export function GamificationPreferenceCard() {
  const { data } = useGamificationSelf();
  const mutation = useSetGamificationOptOut();

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
