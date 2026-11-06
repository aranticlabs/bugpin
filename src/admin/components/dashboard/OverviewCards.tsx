import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Bug, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  REPORT_PRIORITY_LABELS,
  REPORT_STATUS_LABELS,
  ReportPriorityLabel,
  reportPriorityBarClass,
} from '../report/ReportStatusPriority';
import { MiniChart, SeriesLegend, TrendChart, type ChartSeries } from './charts';
import { TrendBadge } from './TrendBadge';
import { cn } from '../../lib/utils';
import { reportOriginState } from '../../lib/reportOrigin';
import { formatDay, formatHours, formatTimeAgo, initials } from '../../lib/dashboard';
import {
  REPORT_PRIORITIES,
  type DashboardActivityItem,
  type DashboardDayCount,
  type DashboardKpi,
  type DashboardOverview,
  type DashboardRange,
  type ReportPriority,
  type ReportStatus,
} from '@shared/types';

export const DASHBOARD_ORIGIN = { path: '/', label: 'Dashboard' };

type KpiDelta = 'count' | 'percent' | 'hours';

interface KpiDefinition {
  key: keyof DashboardOverview['kpis'];
  label: string;
  hint: string;
  delta: KpiDelta;
  /** True when a rising value is good news */
  upIsGood: boolean;
  format: (value: number | null) => string;
  chart: 'bar' | 'line';
  /** Name of the value in the chart tooltip */
  pointName: string;
  /** How the previous period is described, after "vs" */
  compareTo: string;
}

const KPIS: KpiDefinition[] = [
  {
    key: 'backlog',
    label: 'Active reports',
    hint: 'Reports that are Open or In Progress, compared with 7 days ago',
    delta: 'count',
    upIsGood: false,
    format: (value) => String(value ?? 0),
    chart: 'line',
    pointName: 'Active',
    compareTo: 'a week ago',
  },
  {
    key: 'created',
    label: 'New this week',
    hint: 'Reports received in the last 7 days, compared with the 7 days before',
    delta: 'percent',
    upIsGood: false,
    format: (value) => String(value ?? 0),
    chart: 'bar',
    pointName: 'New',
    compareTo: 'the week before',
  },
  {
    key: 'resolved',
    label: 'Resolved this week',
    hint: 'Moved to resolved or closed in the last 7 days, compared with the 7 days before',
    delta: 'percent',
    upIsGood: true,
    format: (value) => String(value ?? 0),
    chart: 'bar',
    pointName: 'Resolved',
    compareTo: 'the week before',
  },
  {
    key: 'resolveHours',
    label: 'Median time to resolve',
    hint: 'From report received to resolved or closed, last 30 days, compared with the 30 days before',
    delta: 'hours',
    upIsGood: false,
    format: formatHours,
    chart: 'line',
    pointName: 'Median',
    compareTo: 'the 30 days before',
  },
];

function deltaLabel(kpi: DashboardKpi, kind: KpiDelta): string | null {
  if (kpi.value === null || kpi.previous === null) return null;
  const change = kpi.value - kpi.previous;
  if (change === 0) return null;
  const sign = change > 0 ? '+' : '-';
  if (kind === 'count') return `${sign}${Math.abs(change)}`;
  if (kind === 'hours') return `${sign}${formatHours(Math.abs(change))}`;
  if (kpi.previous === 0) return null;
  return `${sign}${Math.round(Math.abs(change / kpi.previous) * 100)}%`;
}

/** Calendar days of the KPI series, oldest first, matching the server's 14-day window */
function seriesDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (count - 1 - index));
    return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  });
}

function KpiCard({ definition, kpi }: { definition: KpiDefinition; kpi: DashboardKpi }) {
  const delta = deltaLabel(kpi, definition.delta);
  const rising = kpi.value !== null && kpi.previous !== null && kpi.value > kpi.previous;
  const good = rising === definition.upIsGood;
  const TrendIcon = rising ? ArrowUpRight : ArrowDownRight;
  const days = seriesDays(kpi.series.length);
  const points = kpi.series.map((value, index) => ({ label: days[index], value }));
  const chartFormat =
    definition.key === 'resolveHours' ? (value: number) => formatHours(value) : undefined;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{definition.label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${definition.label}`}
                className="-m-1.5 rounded-sm p-1.5 text-muted-foreground hover:text-foreground focus-visible:focus-ring"
              >
                <Info className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{definition.hint}</TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-1">
          <div className="flex items-end justify-between gap-3">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">
              {definition.format(kpi.value)}
            </span>
            {delta && (
              <TrendBadge good={good}>
                <TrendIcon className="size-3" />
                {delta}
              </TrendBadge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {kpi.previous === null
              ? `No data for ${definition.compareTo}`
              : `vs ${definition.format(kpi.previous)} ${definition.compareTo}`}
          </p>
        </div>
        <div className="space-y-1">
          <MiniChart
            points={points}
            kind={definition.chart}
            name={definition.pointName}
            format={chartFormat}
          />
          <div className="flex justify-between text-2xs text-muted-foreground">
            <span>{days.length} days ago</span>
            <span>Today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiRow({ kpis }: { kpis: DashboardOverview['kpis'] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((definition) => (
        <KpiCard key={definition.key} definition={definition} kpi={kpis[definition.key]} />
      ))}
    </div>
  );
}

function weeklyBuckets(days: DashboardDayCount[]) {
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, index) => {
    const week = days.slice(index * 7, index * 7 + 7);
    return {
      label: formatDay(week[0].date),
      created: week.reduce((total, day) => total + day.created, 0),
      resolved: week.reduce((total, day) => total + day.resolved, 0),
    };
  });
}

export function IntakeChartCard({
  intake,
  range,
  className,
}: {
  intake: DashboardDayCount[];
  range: DashboardRange;
  className?: string;
}) {
  const created = intake.reduce((total, day) => total + day.created, 0);
  const resolved = intake.reduce((total, day) => total + day.resolved, 0);
  const buckets =
    range === 90
      ? weeklyBuckets(intake)
      : intake.map((day) => ({
          label: formatDay(day.date),
          created: day.created,
          resolved: day.resolved,
        }));
  const series: ChartSeries[] = [
    {
      label: 'Received',
      tone: 'chart-1',
      values: buckets.map((bucket) => bucket.created),
      area: true,
    },
    {
      label: 'Resolved',
      tone: 'chart-2',
      values: buckets.map((bucket) => bucket.resolved),
      area: true,
      dashed: true,
    },
  ];
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Intake vs resolution</CardTitle>
          <CardDescription>
            {created} received, {resolved} resolved in the last {range} days
            {range === 90 && ', per week'}
          </CardDescription>
        </div>
        <SeriesLegend series={series} />
      </CardHeader>
      <CardContent>
        <TrendChart
          title="Reports received and resolved"
          labels={buckets.map((bucket) => bucket.label)}
          series={series}
        />
      </CardContent>
    </Card>
  );
}

export function BacklogPriorityCard({
  backlog,
  className,
}: {
  backlog: Record<ReportPriority, number>;
  className?: string;
}) {
  const total = REPORT_PRIORITIES.reduce((sum, priority) => sum + backlog[priority], 0);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Active reports by priority</CardTitle>
        <CardDescription>{total} open or in progress</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* The list below carries the same counts, so the bar is hidden from assistive tech */}
        <div className="flex h-3 gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
          {REPORT_PRIORITIES.filter((priority) => backlog[priority] > 0).map((priority) => (
            <Tooltip key={priority}>
              <TooltipTrigger asChild>
                <div
                  className={reportPriorityBarClass(priority)}
                  style={{ width: `${(backlog[priority] / total) * 100}%` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {backlog[priority]} {REPORT_PRIORITY_LABELS[priority]}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="space-y-3.5">
          {REPORT_PRIORITIES.map((priority) => (
            <div key={priority} className="flex items-center gap-2 text-sm">
              <ReportPriorityLabel priority={priority} />
              <span className="ml-auto tabular-nums text-muted-foreground">
                {backlog[priority]}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function statusName(value: string | undefined): string {
  return value && value in REPORT_STATUS_LABELS
    ? REPORT_STATUS_LABELS[value as ReportStatus].toLowerCase()
    : (value ?? 'unknown');
}

function describeActivity(item: DashboardActivityItem): string {
  switch (item.action) {
    case 'created':
      return 'reported';
    case 'status_changed':
      if (item.newValue === 'resolved') return 'resolved';
      if (item.newValue === 'closed') return 'closed';
      if (item.newValue === 'in_progress') return 'started work on';
      if (item.oldValue === 'resolved' || item.oldValue === 'closed') return 'reopened';
      return `moved to ${statusName(item.newValue)}`;
    case 'priority_changed':
      return `set priority to ${item.newValue ?? 'unknown'} on`;
    case 'assignee_changed':
      return item.newValue ? `assigned ${item.newDisplay ?? 'someone'} to` : 'unassigned';
  }
}

export function ActivityCard({
  activity,
  fillHeight = false,
  className,
}: {
  activity: DashboardActivityItem[];
  /** Match the height of the card next to it and scroll the rest, instead of growing */
  fillHeight?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', fillHeight && 'h-[28rem] xl:h-auto', className)}>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Latest changes to reports</CardDescription>
      </CardHeader>
      <CardContent className="relative min-h-0 flex-1 p-0">
        <div className={fillHeight ? 'absolute inset-x-0 top-0 bottom-5' : 'h-96 pb-5'}>
          <ScrollArea type="hover" aria-label="Activity" className="h-full">
            <div className="space-y-4 px-6 pb-1">
              {activity.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
              )}
              {activity.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-2xs">
                      {item.userName ? initials(item.userName) : <Bug className="size-3.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 text-sm">
                    <p className="line-clamp-2">
                      <span className="font-medium">{item.userName ?? 'Widget'}</span>{' '}
                      <span className="text-muted-foreground">{describeActivity(item)}</span>{' '}
                      <Link
                        to={`/reports/${item.reportId}`}
                        state={reportOriginState(DASHBOARD_ORIGIN)}
                        className="hover:underline"
                      >
                        {item.reportTitle}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatTimeAgo(item.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
