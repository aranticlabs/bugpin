import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Spinner } from '../ui/spinner';
import { GamificationPreferenceCard } from './GamificationPreferenceCard';
import { HunterLogTabs, levelTitle, type ProgressTab } from '../dashboard/achievements';
import { useDashboardPersonal, useGamificationSelf } from '../../hooks/useDashboard';

/** The user's own switch, and while it is on, the same Hunter's log as on the dashboard */
export function HuntersLogTab() {
  const { data: self } = useGamificationSelf();
  const active = !!self?.available && !(self.canOptOut && self.optedOut);
  const personal = useDashboardPersonal(active);
  const [tab, setTab] = useState<ProgressTab>('levels');
  const game = personal.data?.gamification;

  return (
    <div className="space-y-6">
      <GamificationPreferenceCard />
      {!active ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Gamification is off for you. Turn it on to see your level, your achievements and the
            team ranking.
          </CardContent>
        </Card>
      ) : !game ? (
        <Card>
          <CardContent className="py-12">
            <Spinner className="mx-auto text-primary" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Hunter&apos;s log</CardTitle>
            <CardDescription>
              Level {game.level} · {levelTitle(game.level)} ·{' '}
              {game.achievements.filter((item) => item.unlockedAt).length} of{' '}
              {game.achievements.length} achievements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HunterLogTabs game={game} tab={tab} onTabChange={setTab} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
