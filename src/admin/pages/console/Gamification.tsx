import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  useGamificationSettings,
  useUpdateGamificationSettings,
} from '../../hooks/useGamification';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { SettingsCard } from '../../components/ui/settings-card';
import { SettingRow, SettingRows } from '../../components/ui/setting-row';
import { Spinner } from '../../components/ui/spinner';
import { Switch } from '../../components/ui/switch';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { cn } from '../../lib/utils';
import { gamificationStatus } from '@shared/gamification';
import type { GamificationSettings, GamificationUser } from '@shared/types';

function changedUsers(draft: GamificationSettings, saved: GamificationSettings) {
  const before = new Map(saved.users.map((user) => [user.id, user.enabled]));
  return Object.fromEntries(
    draft.users
      .filter((user) => before.get(user.id) !== user.enabled)
      .map((user) => [user.id, user.enabled])
  );
}

export function Gamification() {
  const { data: saved, isLoading } = useGamificationSettings();
  // Holds only unsaved edits; while null the page shows the saved settings, so a refetch
  // never overwrites what the admin is changing.
  const [edits, setDraft] = useState<GamificationSettings | null>(null);
  const mutation = useUpdateGamificationSettings();

  if (isLoading || !saved) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  const draft = edits ?? saved;
  const users = changedUsers(draft, saved);
  const workspaceChanges = (
    ['enabled', 'newUsersDefault', 'allowOptOut', 'showRanking'] as const
  ).filter((key) => draft[key] !== saved[key]);
  const isDirty = workspaceChanges.length > 0 || Object.keys(users).length > 0;
  const off = !draft.enabled;
  const eligible = draft.users.filter((user) => user.role !== 'viewer');
  const statusOf = (user: GamificationUser) => gamificationStatus(user, draft);
  const activeCount = eligible.filter((user) => statusOf(user) === 'on').length;
  const turnedOff = eligible.filter((user) => !user.enabled).length;
  const optedOut = eligible.filter((user) => statusOf(user) === 'opted-out').length;
  const viewers = draft.users.length - eligible.length;
  // People whose own opt-out stops counting once opting out is no longer allowed
  const returning =
    saved.allowOptOut && !draft.allowOptOut && draft.enabled
      ? eligible.filter((user) => user.enabled && user.optedOut).length
      : 0;

  const save = async () => {
    try {
      await mutation.mutateAsync({
        ...Object.fromEntries(workspaceChanges.map((key) => [key, draft[key]])),
        ...(Object.keys(users).length > 0 && { users }),
      });
      setDraft(null);
      return true;
    } catch {
      return false;
    }
  };
  const setAll = (enabled: boolean) =>
    setDraft({
      ...draft,
      users: draft.users.map((user) => (user.role === 'viewer' ? user : { ...user, enabled })),
    });

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard isDirty={isDirty} onSave={save} onDiscard={() => setDraft(null)} />

      <SettingsCard
        title="Gamification"
        description="Levels and achievements on the dashboard. Time to resolve is always shown. People who are turned off or opted out are left out of the team figures."
        badge={
          <Badge variant="outline" className={draft.enabled ? 'status-active' : 'status-inactive'}>
            {draft.enabled ? 'On' : 'Off'}
          </Badge>
        }
      >
        <SettingRows>
          <SettingRow
            label="Enable gamification"
            htmlFor="gamification-enabled"
            description="When off, nobody sees levels or achievements."
          >
            <Switch
              id="gamification-enabled"
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          </SettingRow>
          <SettingRow
            label="Show team ranking"
            htmlFor="gamification-ranking"
            description="Ranks teammates by XP in the Team tab, over the last 30 days, the last 90 days or all time. When off, the Team tab lists everyone alphabetically."
          >
            <Switch
              id="gamification-ranking"
              disabled={off}
              checked={draft.showRanking}
              onCheckedChange={(showRanking) => setDraft({ ...draft, showRanking })}
            />
          </SettingRow>
        </SettingRows>
      </SettingsCard>

      <SettingsCard
        title="People"
        description="Rules for everyone. Turn it on or off for one person on their page in Settings › Users."
        className={cn(off && 'opacity-60')}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={off} onClick={() => setAll(true)}>
              Turn on for all
            </Button>
            <Button variant="outline" size="sm" disabled={off} onClick={() => setAll(false)}>
              Turn off for all
            </Button>
          </div>
        }
      >
        <SettingRows className="mb-4">
          <SettingRow
            label="Turn on for new users"
            htmlFor="gamification-new-users"
            description="Applies to users created or invited from now on."
          >
            <Switch
              id="gamification-new-users"
              disabled={off}
              checked={draft.newUsersDefault}
              onCheckedChange={(newUsersDefault) => setDraft({ ...draft, newUsersDefault })}
            />
          </SettingRow>
          <SettingRow
            label="Let users turn it off for themselves"
            htmlFor="gamification-opt-out"
            description="Adds a switch to Account › Profile. Users can opt out, but not back in if you turned them off."
          >
            <Switch
              id="gamification-opt-out"
              disabled={off}
              checked={draft.allowOptOut}
              onCheckedChange={(allowOptOut) => setDraft({ ...draft, allowOptOut })}
            />
          </SettingRow>
        </SettingRows>
        {returning > 0 && (
          <Alert className="mb-4">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertDescription>
              {returning === 1
                ? '1 person turned gamification off for themselves. Once you save, they take part again and appear in the team ranking.'
                : `${returning} people turned gamification off for themselves. Once you save, they take part again and appear in the team ranking.`}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3 rounded-md border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {off ? 'Off for everyone' : `On for ${activeCount} of ${eligible.length} people`}
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                `${turnedOff} turned off by an admin`,
                `${optedOut} turned it off for themselves`,
                `${viewers} ${viewers === 1 ? 'viewer' : 'viewers'}, who never take part`,
              ].join(' · ')}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/users">Manage people in Users</Link>
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
