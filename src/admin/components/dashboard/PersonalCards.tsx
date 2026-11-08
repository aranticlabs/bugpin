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
import { Progress } from '../ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { ReportPriorityLabel } from '../report/ReportStatusPriority';
import {
  SeriesLegend,
  TrendChart,
  toneBackground,
  trendChartHeightClass,
  type ChartSeries,
} from './DashboardCharts';
import { TrendBadge } from './TrendBadge';
import {
  ACHIEVEMENTS,
  AchievementBadge,
  ProgressDialog,
  levelTitle,
  type ProgressTab,
} from './HuntersLog';
import { cn } from '../../lib/utils';
import {
  daysSince,
  formatDay,
  formatHours,
  levelProgressPercent,
  unlockedCount,
} from '../../lib/dashboard';
import {
  RESOLVE_HISTORY_DAYS,
  RESOLVE_TREND_WEEKS,
  RESOLVE_WINDOW_DAYS,
  type DashboardPersonal,
  type ResolveTimeSummary,
} from '@shared/types';

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
    <StripTile icon={Timer} tone="bg-info/10 text-info">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">
          {medianHours === null ? 'No resolutions yet' : `${formatHours(medianHours)} to resolve`}
        </p>
        {Math.round(change) !== 0 && (
          <TrendBadge good={faster} className="px-1.5">
            {faster ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
            {formatHours(Math.abs(change))}
          </TrendBadge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {medianHours === null
          ? `In the last ${RESOLVE_WINDOW_DAYS} days`
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
  /** Appended to the visible text, so the accessible name still starts with what is shown. */
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left outline-none transition-colors hover:bg-primary-tint focus-visible:bg-primary-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {children}
      <span className="sr-only">, {label}</span>
    </button>
  );
}

export function ImpactStrip({ personal }: { personal: DashboardPersonal }) {
  const [progressTab, setProgressTab] = useState<ProgressTab | null>(null);
  const game = personal.gamification;
  const tiles: { key: string; node: ReactNode }[] = [];

  if (game) {
    tiles.push({
      key: 'level',
      node: (
        <TileButton onClick={() => setProgressTab('levels')} label="show levels">
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
              <Progress value={levelProgressPercent(game)} className="h-1.5" aria-hidden />
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
    tiles.push({
      key: 'achievements',
      node: (
        <TileButton onClick={() => setProgressTab('achievements')} label="show achievements">
          <StripTile icon={Trophy} tone="bg-success/10 text-success">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">Achievements</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {unlockedCount(game)} of {game.achievements.length}
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
                          decorative
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
          <StripTile icon={CircleCheck} tone="bg-success/10 text-success">
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

const TREND_BASIS =
  'Median hours from assignment to resolution, per week. Reports never assigned to you count from arrival.';

function trendSummary(summary: ResolveTimeSummary): string {
  const known = summary.weekly.filter((week) => week.mine !== null);
  if (known.length < 2) return TREND_BASIS;
  const first = known[0].mine as number;
  const latest = known[known.length - 1].mine as number;
  const direction = latest < first ? 'Down' : latest > first ? 'Up' : 'Steady';
  return direction === 'Steady'
    ? `${TREND_BASIS} Steady at ${formatHours(latest)}.`
    : `${TREND_BASIS} ${direction} from ${formatHours(first)} to ${formatHours(latest)} in ${RESOLVE_TREND_WEEKS} weeks.`;
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
    { label: `Resolved, ${RESOLVE_WINDOW_DAYS} days`, value: String(summary.resolvedLast30Days) },
  ];
  const round = (value: number) => Math.round(value * 10) / 10;
  const hasTrend = summary.weekly.some((week) => week.mine !== null || week.team !== null);
  const series: ChartSeries[] = [
    {
      label: 'Team',
      tone: 'muted-foreground',
      values: summary.weekly.map((week) => (week.team === null ? null : round(week.team))),
      dashed: true,
      format: formatHours,
    },
    {
      label: 'You',
      tone: 'chart-1',
      values: summary.weekly.map((week) => (week.mine === null ? null : round(week.mine))),
      area: true,
      format: formatHours,
    },
  ];

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Your time to resolve</CardTitle>
          <CardDescription>{trendSummary(summary)}</CardDescription>
        </div>
        <SeriesLegend series={series} />
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
              title="Your time to resolve compared with the team, per week"
              size="compact"
              labels={summary.weekly.map((week) => formatDay(week.weekStart))}
              series={series}
            />
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-md border border-dashed px-6 text-center text-sm text-muted-foreground',
                trendChartHeightClass('compact')
              )}
            >
              You resolved no reports in the last {RESOLVE_TREND_WEEKS} weeks.
            </div>
          )}
        </div>
        <div className="flex h-full flex-col justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">
            By priority, last {RESOLVE_HISTORY_DAYS} days
          </p>
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
                    className={cn('h-full rounded-full', toneBackground('chart-1'))}
                    style={{ width: `${(row.mine / max) * 100}%` }}
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
