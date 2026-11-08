import { useState, type ReactNode } from 'react';
import { Card, CardContent } from '../ui/card';
import { SettingsCard } from '../ui/settings-card';
import { Spinner } from '../ui/spinner';
import { GamificationPreferenceCard } from './GamificationPreferenceCard';
import { LoadError } from '../dashboard/LoadError';
import { HuntersLogTabs, progressSummary, type ProgressTab } from '../dashboard/HuntersLog';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardPersonal } from '../../hooks/useDashboard';
import { useGamificationSelf } from '../../hooks/useGamification';

function Message({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <Card>
      <CardContent className="py-12">
        <Spinner className="mx-auto text-primary" label="Loading" />
      </CardContent>
    </Card>
  );
}

const OFF_MESSAGE =
  'Gamification is off for you. Turn it on to see your level, your achievements and the team ranking.';

/** The user's own switch, and while it is on, the same Hunter's log as on the dashboard */
export function HuntersLogTab() {
  const { user } = useAuth();
  const self = useGamificationSelf();
  const active = self.data?.active === true;
  const personal = useDashboardPersonal(user?.id, active);
  const [tab, setTab] = useState<ProgressTab>('levels');
  const game = personal.data?.gamification;

  const content = () => {
    if (self.isError) {
      return (
        <Card>
          <LoadError what="your gamification settings" onRetry={() => void self.refetch()} />
        </Card>
      );
    }
    if (!self.data) return <Loading />;
    if (!active) return <Message>{OFF_MESSAGE}</Message>;
    if (!personal.data && personal.isError) {
      return (
        <Card>
          <LoadError what="your Hunter's log" onRetry={() => void personal.refetch()} />
        </Card>
      );
    }
    if (!personal.data) return <Loading />;
    if (!game) return <Message>{OFF_MESSAGE}</Message>;
    return (
      <SettingsCard title="Hunter's log" description={progressSummary(game)}>
        <HuntersLogTabs game={game} tab={tab} onTabChange={setTab} />
      </SettingsCard>
    );
  };

  return (
    <div className="space-y-6">
      <GamificationPreferenceCard />
      {content()}
    </div>
  );
}
