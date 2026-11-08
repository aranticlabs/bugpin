import { useState } from 'react';
import { UserAvatar } from './UserAvatar';
import { Badge } from '../ui/badge';
import { Spinner } from '../ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useAuth } from '../../contexts/AuthContext';
import { useDashboardTeam } from '../../hooks/useDashboard';
import { LoadError } from './LoadError';
import { cn } from '../../lib/utils';
import { AchievementBadge, levelTitle } from './HuntersLog';
import { TEAM_PERIODS, type TeamPeriod } from '@shared/types';

const PERIOD_LABEL: Record<TeamPeriod, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

const PODIUM = [
  'bg-yellow-400/20 text-yellow-700 dark:text-yellow-400',
  'bg-slate-400/20 text-slate-600 dark:text-slate-300',
  'bg-amber-700/20 text-amber-800 dark:text-amber-500',
];

export function TeamTab() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<TeamPeriod>('30d');
  const { data, isLoading, isError, refetch } = useDashboardTeam(period);

  if (isLoading) return <Spinner className="mx-auto my-10 text-primary" label="Loading" />;
  if (isError || !data) return <LoadError what="the team" onRetry={() => void refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {data.ranking
            ? `Ranked by XP earned ${period === 'all' ? 'in total' : `in the ${PERIOD_LABEL[period].toLowerCase()}`}.`
            : 'Everyone taking part, in alphabetical order.'}
        </p>
        {data.ranking && (
          <Select value={period} onValueChange={(value) => setPeriod(value as TeamPeriod)}>
            <SelectTrigger className="h-8 w-36" aria-label="Ranking period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_PERIODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {PERIOD_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <ol className="divide-y rounded-md border">
        {data.members.map((member, index) => (
          <li key={member.id}>
            <div
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5',
                member.id === user?.id && 'bg-primary/5'
              )}
            >
              {data.ranking && (
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    PODIUM[index] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {index + 1}
                </span>
              )}
              <UserAvatar name={member.name} avatarUrl={member.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{member.name}</span>
                  {member.id === user?.id && (
                    <Badge variant="secondary" size="sm">
                      You
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Level {member.level} · {levelTitle(member.level)}
                </p>
              </div>
              <div className="hidden shrink-0 gap-0.5 md:flex">
                {member.achievements.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement.id}
                    unlocked={achievement.unlockedAt !== undefined}
                    className="size-5"
                  />
                ))}
              </div>
              <div className="w-24 shrink-0 text-right">
                <p className="text-sm font-medium tabular-nums">
                  {(data.ranking ? member.periodXp : member.xp).toLocaleString()} XP
                </p>
                <p className="text-2xs text-muted-foreground">
                  {data.ranking && period !== 'all' ? PERIOD_LABEL[period].toLowerCase() : 'total'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
