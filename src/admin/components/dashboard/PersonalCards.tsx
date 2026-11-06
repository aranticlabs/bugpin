import { useState, type ReactNode } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleCheck,
  ListChecks,
  Medal,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { ReportPriorityLabel } from '../report/ReportStatusPriority';
import { ChartLegend, TrendChart } from './charts';
import {
  ACHIEVEMENTS,
  AchievementBadge,
  ProgressDialog,
  levelTitle,
  type ProgressTab,
} from './achievements';
import { cn } from '../../lib/utils';
import { daysSince, formatDay, formatHours } from '../../lib/dashboard';
import type { DashboardPersonal, ResolveTimeSummary } from '@shared/types';

const STRIP_COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

function StripTile({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tone)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ResolveTimeTile({ summary }: { summary: ResolveTimeSummary }) {
  const { medianHours, previousMedianHours } = summary;
  const change =
    medianHours !== null && previousMedianHours !== null ? medianHours - previousMedianHours : 0;
  const faster = change < 0;
  return (
    <StripTile icon={Timer} tone="bg-sky-500/10 text-sky-600 dark:text-sky-400">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">
          {medianHours === null ? 'No resolutions yet' : `${formatHours(medianHours)} to resolve`}
        </p>
        {Math.round(change) !== 0 && (
          <Badge
            variant="outline"
            className={cn(
              'gap-0.5 border-transparent px-1.5',
              faster
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400'
            )}
          >
            {faster ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
            {formatHours(Math.abs(change))}
          </Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {medianHours === null
          ? 'In the last 30 days'
          : `Your median · team ${formatHours(summary.teamMedianHours)} · best ${formatHours(summary.bestHours)}`}
      </p>
    </StripTile>
  );
}

function TileButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="block w-full text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

export function ImpactStrip({ personal }: { personal: DashboardPersonal }) {
  const [progressTab, setProgressTab] = useState<ProgressTab | null>(null);
  const game = personal.gamification;
  const tiles: { key: string; node: ReactNode }[] = [];

  if (game) {
    const span = game.nextLevelXp === null ? 1 : game.nextLevelXp - game.levelStartXp;
    const progress = game.nextLevelXp === null ? 100 : ((game.xp - game.levelStartXp) / span) * 100;
    tiles.push({
      key: 'level',
      node: (
        <TileButton onClick={() => setProgressTab('levels')} label="Show levels">
          <StripTile icon={Medal} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">
                  Level {game.level} · {levelTitle(game.level)}
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {game.xp.toLocaleString()} XP
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
              <p className="truncate text-xs text-muted-foreground">
                {game.nextLevelXp === null
                  ? 'Top level reached'
                  : `${(game.nextLevelXp - game.xp).toLocaleString()} XP to ${levelTitle(game.level + 1)}`}
              </p>
            </div>
          </StripTile>
        </TileButton>
      ),
    });
  }

  tiles.push({ key: 'ttr', node: <ResolveTimeTile summary={personal.resolveTime} /> });

  if (game) {
    const unlocked = game.achievements.filter((item) => item.unlockedAt).length;
    tiles.push({
      key: 'achievements',
      node: (
        <TileButton onClick={() => setProgressTab('achievements')} label="Show achievements">
          <StripTile icon={Trophy} tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">Achievements</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {unlocked} of {game.achievements.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {game.achievements.map((achievement) => (
                  <Tooltip key={achievement.id}>
                    <TooltipTrigger asChild>
                      <span>
                        <AchievementBadge
                          achievement={achievement.id}
                          unlocked={achievement.unlockedAt !== undefined}
                          className="size-6"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{ACHIEVEMENTS[achievement.id].title}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          </StripTile>
        </TileButton>
      ),
    });
  } else {
    const change = personal.resolvedThisMonth - personal.resolvedLastMonth;
    tiles.push(
      {
        key: 'resolved',
        node: (
          <StripTile
            icon={CircleCheck}
            tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          >
            <p className="text-sm font-medium">{personal.resolvedThisMonth} resolved this month</p>
            <p className="text-xs text-muted-foreground">
              {change === 0
                ? 'Same as last month'
                : `${Math.abs(change)} ${change > 0 ? 'more' : 'fewer'} than last month`}
            </p>
          </StripTile>
        ),
      },
      {
        key: 'assigned',
        node: (
          <StripTile icon={ListChecks} tone="bg-muted text-muted-foreground">
            <p className="text-sm font-medium">{personal.assignedOpen} assigned to you</p>
            <p className="text-xs text-muted-foreground">
              {personal.oldestAssignedAt
                ? `Oldest waiting ${daysSince(personal.oldestAssignedAt)} days`
                : 'Nothing waiting'}
            </p>
          </StripTile>
        ),
      }
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent
        className={cn(
          'grid grid-cols-1 divide-y p-0 md:divide-x md:divide-y-0',
          STRIP_COLUMNS[tiles.length]
        )}
      >
        {tiles.map((tile) => (
          <div key={tile.key} className="min-w-0">
            {tile.node}
          </div>
        ))}
      </CardContent>
      {game && (
        <ProgressDialog
          game={game}
          tab={progressTab ?? 'levels'}
          onTabChange={setProgressTab}
          open={progressTab !== null}
          onOpenChange={(open) => !open && setProgressTab(null)}
        />
      )}
    </Card>
  );
}

function trendSummary(summary: ResolveTimeSummary): string {
  const known = summary.weekly.filter((week) => week.mine !== null);
  if (known.length < 2) return 'Median hours from assignment to resolution, per week.';
  const first = known[0].mine as number;
  const latest = known[known.length - 1].mine as number;
  const direction = latest < first ? 'Down' : latest > first ? 'Up' : 'Steady';
  return direction === 'Steady'
    ? `Median hours from assignment to resolution, per week. Steady at ${formatHours(latest)}.`
    : `Median hours from assignment to resolution, per week. ${direction} from ${formatHours(first)} to ${formatHours(latest)} in 12 weeks.`;
}

export function ResolveTimeCard({
  summary,
  className,
}: {
  summary: ResolveTimeSummary;
  className?: string;
}) {
  const max = Math.max(1, ...summary.byPriority.flatMap((row) => [row.mine ?? 0, row.team ?? 0]));
  const stats = [
    { label: 'Your median', value: formatHours(summary.medianHours) },
    { label: 'Team median', value: formatHours(summary.teamMedianHours) },
    { label: 'Your best', value: formatHours(summary.bestHours) },
    { label: 'Resolved, 30 days', value: String(summary.resolvedLast30Days) },
  ];
  const round = (value: number) => Math.round(value * 10) / 10;
  const hasTrend = summary.weekly.some((week) => week.mine !== null || week.team !== null);

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Your time to resolve</CardTitle>
          <CardDescription>{trendSummary(summary)}</CardDescription>
        </div>
        <ChartLegend
          items={[
            { label: 'You', color: 'var(--chart-1)' },
            { label: 'Team', color: 'var(--muted-foreground)' },
          ]}
        />
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="flex flex-col justify-between gap-0.5">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-semibold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>
          {hasTrend ? (
            <TrendChart
              height={200}
              labels={summary.weekly.map((week) => formatDay(week.weekStart))}
              series={[
                {
                  label: 'Team',
                  color: 'var(--muted-foreground)',
                  values: summary.weekly.map((week) =>
                    week.team === null ? null : round(week.team)
                  ),
                  dashed: true,
                  format: formatHours,
                },
                {
                  label: 'You',
                  color: 'var(--chart-1)',
                  values: summary.weekly.map((week) =>
                    week.mine === null ? null : round(week.mine)
                  ),
                  area: true,
                  format: formatHours,
                },
              ]}
            />
          ) : (
            <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed px-6 text-center text-sm text-muted-foreground">
              No reports were resolved after assignment in the last 12 weeks.
            </div>
          )}
        </div>
        <div className="flex h-full flex-col justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">By priority, last 90 days</p>
          {summary.byPriority.map((row) => (
            <div key={row.priority} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <ReportPriorityLabel priority={row.priority} />
                <span className="tabular-nums">
                  {formatHours(row.mine)}{' '}
                  <span className="text-xs text-muted-foreground">
                    / team {formatHours(row.team)}
                  </span>
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-muted">
                {row.mine !== null && (
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(row.mine / max) * 100}%`, background: 'var(--chart-1)' }}
                  />
                )}
                {row.team !== null && (
                  <div
                    className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-muted-foreground"
                    style={{ left: `${(row.team / max) * 100}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
