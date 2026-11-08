import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { dashboardKeys } from '../../hooks/useDashboard';
import { gamificationKeys, useGamificationSettings } from '../../hooks/useGamification';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { useUserMutation } from './useUserMutation';
import type { GamificationSettings, User } from '@shared/types';

function gamificationNote(user: User, settings: GamificationSettings): string {
  if (user.role === 'viewer') return 'Viewers have a read-only role and never take part.';
  if (!settings.enabled) return 'Gamification is turned off for the whole workspace.';
  const entry = settings.users.find((candidate) => candidate.id === user.id);
  if (entry?.enabled && entry.optedOut && settings.allowOptOut) {
    return 'On, but they turned it off for themselves in their profile.';
  }
  return 'Levels, achievements and their place in the team ranking.';
}

export function UserGamificationSection({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const { data: settings } = useGamificationSettings();
  const setEnabled = useUserMutation(
    (enabled: boolean) => api.put('/gamification', { users: { [user.id]: enabled } }),
    'Gamification updated',
    'Failed to update gamification',
    () => {
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    }
  );

  if (!settings) return null;
  const isViewer = user.role === 'viewer';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gamification</CardTitle>
        <CardDescription>
          Workspace rules are in{' '}
          <Link to="/settings/gamification" className="underline underline-offset-4">
            Gamification settings
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="user-gamification">Enable gamification</Label>
            <p className="text-xs text-muted-foreground">{gamificationNote(user, settings)}</p>
          </div>
          <Switch
            id="user-gamification"
            checked={!isViewer && user.gamificationEnabled !== false}
            disabled={isViewer || setEnabled.isPending}
            onCheckedChange={(enabled) => setEnabled.mutate(enabled)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
