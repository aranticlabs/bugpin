import {
  dashboardRepo,
  type AttentionRow,
  type ReportTimelineRow,
  type ResolutionRow,
} from '../database/repositories/dashboard.repo.js';
import { enrichHistoryEntry } from './report-history.service.js';
import { gamificationService, xpFor } from './gamification.service.js';
import { Result } from '../utils/result.js';
import {
  REPORT_PRIORITIES,
  type AttentionReason,
  type DashboardAttentionItem,
  type DashboardDayCount,
  type DashboardKpi,
  type DashboardOverview,
  type DashboardPersonal,
  type DashboardRange,
  type GamificationTeam,
  type TeamMember,
  type TeamPeriod,
  type ReportPriority,
  type ResolveTimeSummary,
  type User,
} from '@shared/types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SERIES_DAYS = 14;
const KPI_WINDOW_DAYS = 7;
const RESOLVE_WINDOW_DAYS = 30;
const RESOLVE_TREND_WEEKS = 12;
const PERSONAL_HISTORY_DAYS = 90;
const STALE_AFTER_DAYS = 14;
const REOPENED_WITHIN_DAYS = 14;
const ATTENTION_LIMIT = 10;
const ACTIVITY_LIMIT = 30;
const TEAM_PERIOD_DAYS: Record<Exclude<TeamPeriod, 'all'>, number> = { '30d': 30, '90d': 90 };

const ATTENTION_ORDER: AttentionReason[] = ['reopened', 'unassigned', 'stale'];
const PRIORITY_RANK: Record<ReportPriority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

export interface OverviewQuery {
  projectId?: string;
  range: DashboardRange;
  timeZone?: string;
}

function safeTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

function dayKeyer(timeZone: string): (iso: string | Date) => string {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (value) => format.format(typeof value === 'string' ? new Date(value) : value);
}

function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Calendar days ending today, oldest first */
function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDay(today, index - count + 1));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

function sumOver(counts: Map<string, number>, days: string[]): number {
  return days.reduce((sum, day) => sum + (counts.get(day) ?? 0), 0);
}

function countByDay(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}

interface DatedTimeline {
  created: string;
  done: string | null;
  hours: number | null;
}

function dateTimeline(rows: ReportTimelineRow[], key: (iso: string) => string): DatedTimeline[] {
  return rows.map((row) => ({
    created: key(row.createdAt),
    done: row.doneAt ? key(row.doneAt) : null,
    hours: row.doneAt ? (Date.parse(row.doneAt) - Date.parse(row.createdAt)) / HOUR_MS : null,
  }));
}

function windowKpi(counts: Map<string, number>, today: string): DashboardKpi {
  const current = lastDays(today, KPI_WINDOW_DAYS);
  const previous = lastDays(shiftDay(today, -KPI_WINDOW_DAYS), KPI_WINDOW_DAYS);
  return {
    value: sumOver(counts, current),
    previous: sumOver(counts, previous),
    series: lastDays(today, SERIES_DAYS).map((day) => counts.get(day) ?? 0),
  };
}

function backlogKpi(active: number, timeline: DatedTimeline[], today: string): DashboardKpi {
  // Walks back from today's count: undo what was created after the day, add back what was finished after it
  const backlogAt = (day: string) =>
    timeline.reduce((count, row) => {
      if (row.created > day) return row.done === null ? count - 1 : count;
      if (row.done !== null && row.done > day) return count + 1;
      return count;
    }, active);
  return {
    value: active,
    previous: backlogAt(shiftDay(today, -KPI_WINDOW_DAYS)),
    series: lastDays(today, SERIES_DAYS).map(backlogAt),
  };
}

function resolveHoursKpi(timeline: DatedTimeline[], today: string): DashboardKpi {
  const medianEnding = (day: string) => {
    const from = shiftDay(day, -RESOLVE_WINDOW_DAYS + 1);
    return median(
      timeline
        .filter((row) => row.done !== null && row.done >= from && row.done <= day)
        .map((row) => row.hours ?? 0)
    );
  };
  return {
    value: medianEnding(today),
    previous: medianEnding(shiftDay(today, -RESOLVE_WINDOW_DAYS)),
    series: lastDays(today, SERIES_DAYS).map(medianEnding),
  };
}

function attentionItems(groups: Record<AttentionReason, AttentionRow[]>): DashboardAttentionItem[] {
  const seen = new Set<string>();
  const items: DashboardAttentionItem[] = [];
  for (const reason of ATTENTION_ORDER) {
    for (const row of groups[reason]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push({ ...row, reason });
    }
  }
  return items
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        ATTENTION_ORDER.indexOf(a.reason) - ATTENTION_ORDER.indexOf(b.reason) ||
        a.since.localeCompare(b.since)
    )
    .slice(0, ATTENTION_LIMIT);
}

interface TimedResolution {
  resolvedBy: string;
  resolvedAt: number;
  hours: number;
  priority: ReportPriority;
}

function timedResolutions(rows: ResolutionRow[]): TimedResolution[] {
  return rows
    .filter((row) => row.assignedAt !== null)
    .map((row) => ({
      resolvedBy: row.resolvedBy,
      resolvedAt: Date.parse(row.resolvedAt),
      hours: (Date.parse(row.resolvedAt) - Date.parse(row.assignedAt as string)) / HOUR_MS,
      priority: row.priority,
    }));
}

function summarizeResolveTime(
  rows: ResolutionRow[],
  userId: string,
  now: number
): ResolveTimeSummary {
  const all = timedResolutions(rows);
  const mine = all.filter((row) => row.resolvedBy === userId);
  const between = (list: TimedResolution[], fromDaysAgo: number, toDaysAgo: number) =>
    list.filter(
      (row) =>
        row.resolvedAt > now - fromDaysAgo * DAY_MS && row.resolvedAt <= now - toDaysAgo * DAY_MS
    );
  const hours = (list: TimedResolution[]) => list.map((row) => row.hours);
  const mineRecent = between(mine, RESOLVE_WINDOW_DAYS, 0);

  return {
    medianHours: median(hours(mineRecent)),
    previousMedianHours: median(hours(between(mine, RESOLVE_WINDOW_DAYS * 2, RESOLVE_WINDOW_DAYS))),
    teamMedianHours: median(hours(between(all, RESOLVE_WINDOW_DAYS, 0))),
    bestHours: mine.length ? Math.round(Math.min(...hours(mine)) * 10) / 10 : null,
    resolvedLast30Days: mineRecent.length,
    weekly: Array.from({ length: RESOLVE_TREND_WEEKS }, (_, index) => {
      const fromDaysAgo = (RESOLVE_TREND_WEEKS - index) * 7;
      return {
        weekStart: new Date(now - fromDaysAgo * DAY_MS).toISOString(),
        mine: median(hours(between(mine, fromDaysAgo, fromDaysAgo - 7))),
        team: median(hours(between(all, fromDaysAgo, fromDaysAgo - 7))),
      };
    }),
    byPriority: REPORT_PRIORITIES.map((priority) => ({
      priority,
      mine: median(hours(mine.filter((row) => row.priority === priority))),
      team: median(hours(all.filter((row) => row.priority === priority))),
    })),
  };
}

export const dashboardService = {
  async getOverview(query: OverviewQuery, now = Date.now()): Promise<Result<DashboardOverview>> {
    const key = dayKeyer(safeTimeZone(query.timeZone));
    const today = key(new Date(now));
    const lookbackDays = Math.max(query.range, RESOLVE_WINDOW_DAYS * 2 + SERIES_DAYS) + 2;
    const since = new Date(now - lookbackDays * DAY_MS).toISOString();
    const timeline = dateTimeline(dashboardRepo.listTimeline(query.projectId, since), key);

    const created = countByDay(timeline.map((row) => row.created));
    const resolved = countByDay(timeline.flatMap((row) => (row.done === null ? [] : [row.done])));
    const intake: DashboardDayCount[] = lastDays(today, query.range).map((date) => ({
      date,
      created: created.get(date) ?? 0,
      resolved: resolved.get(date) ?? 0,
    }));

    const backlogByPriority = Object.fromEntries(
      REPORT_PRIORITIES.map((priority) => [priority, 0])
    ) as Record<ReportPriority, number>;
    for (const row of dashboardRepo.countActiveByPriority(query.projectId)) {
      backlogByPriority[row.priority] = row.count;
    }

    const reopenedSince = new Date(now - REOPENED_WITHIN_DAYS * DAY_MS).toISOString();
    const staleBefore = new Date(now - STALE_AFTER_DAYS * DAY_MS).toISOString();
    const needsAttention = attentionItems({
      reopened: dashboardRepo.listReopened(query.projectId, reopenedSince, ATTENTION_LIMIT),
      unassigned: dashboardRepo.listUnassignedUrgent(query.projectId, ATTENTION_LIMIT),
      stale: dashboardRepo.listStale(query.projectId, staleBefore, ATTENTION_LIMIT),
    });
    const needsAttentionTotal = dashboardRepo.countNeedsAttention(
      query.projectId,
      reopenedSince,
      staleBefore
    );

    const activity = await Promise.all(
      dashboardRepo.listActivity(query.projectId, ACTIVITY_LIMIT).map(async (row) => ({
        ...(await enrichHistoryEntry(row)),
        reportTitle: row.reportTitle,
      }))
    );

    return Result.ok({
      kpis: {
        backlog: backlogKpi(dashboardRepo.countActive(query.projectId), timeline, today),
        created: windowKpi(created, today),
        resolved: windowKpi(resolved, today),
        resolveHours: resolveHoursKpi(timeline, today),
      },
      intake,
      backlogByPriority,
      needsAttention,
      needsAttentionTotal,
      activity,
    });
  },

  async getPersonal(
    user: User,
    timeZone: string | undefined,
    now = Date.now()
  ): Promise<Result<DashboardPersonal>> {
    const key = dayKeyer(safeTimeZone(timeZone));
    const thisMonth = key(new Date(now)).slice(0, 7);
    const lastMonth = shiftDay(`${thisMonth}-01`, -1).slice(0, 7);
    const resolutions = dashboardRepo.listUserResolutions(user.id);
    const monthOf = (iso: string) => key(iso).slice(0, 7);
    const assigned = dashboardRepo.summarizeAssigned(user.id);
    const since = new Date(now - PERSONAL_HISTORY_DAYS * DAY_MS).toISOString();

    return Result.ok({
      assignedOpen: assigned.count,
      oldestAssignedAt: assigned.oldestAssignedAt,
      resolvedThisMonth: resolutions.filter((row) => monthOf(row.resolvedAt) === thisMonth).length,
      resolvedLastMonth: resolutions.filter((row) => monthOf(row.resolvedAt) === lastMonth).length,
      resolveTime: summarizeResolveTime(dashboardRepo.listResolutions(since), user.id, now),
      gamification: (await gamificationService.isActiveFor(user))
        ? gamificationService.progressFor(user.id, resolutions, now)
        : null,
    });
  },

  async getTeam(
    viewer: User,
    period: TeamPeriod,
    now = Date.now()
  ): Promise<Result<GamificationTeam>> {
    const team = await gamificationService.teamFor(viewer);
    if (!team.success) return team;
    const since = period === 'all' ? null : now - TEAM_PERIOD_DAYS[period] * DAY_MS;
    const inPeriod = (iso: string) => since === null || Date.parse(iso) >= since;

    const members: TeamMember[] = team.value.members.map((user) => {
      const resolutions = dashboardRepo.listUserResolutions(user.id);
      const progress = gamificationService.progressFor(user.id, resolutions, now);
      const messages = dashboardRepo.listReporterMessageTimes(user.id).filter(inPeriod).length;
      return {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        level: progress.level,
        xp: progress.xp,
        periodXp:
          since === null
            ? progress.xp
            : xpFor(
                resolutions.filter((row) => inPeriod(row.resolvedAt)),
                messages
              ),
        achievements: progress.achievements,
      };
    });

    members.sort((a, b) =>
      team.value.ranking
        ? b.periodXp - a.periodXp || b.xp - a.xp || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
    );
    return Result.ok({ ranking: team.value.ranking, period, members });
  },
};
