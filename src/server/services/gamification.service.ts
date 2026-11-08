import { settingsRepo } from '../database/repositories/settings.repo.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { userPreferencesRepo } from '../database/repositories/user-preferences.repo.js';
import {
  gamificationRepo,
  type UserResolutionRow,
  type UserTimeRow,
} from '../database/repositories/gamification.repo.js';
import { userPreferencesService } from './user-preferences.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { gamificationStatus } from '@shared/gamification';
import {
  ACHIEVEMENT_TARGETS,
  AMBER_WAITED_DAYS,
  DRAGONFLY_TRIAGE_MINUTES,
  EARLY_RESOLVE_MINUTES,
  FIREFLY_RESOLVE_HOURS,
  LADYBUG_STAYS_FIXED_DAYS,
  LEVEL_XP,
  XP_BY_PRIORITY,
  XP_PER_REPORTER_MESSAGE,
  type AchievementId,
  type AchievementProgress,
  type GamificationProgress,
  type GamificationSelf,
  type GamificationSettings,
  type GamificationTeam,
  type GamificationUser,
  type TeamMember,
  type TeamPeriod,
  type User,
} from '@shared/types';

const KEYS = {
  enabled: 'gamification_enabled',
  newUsersDefault: 'gamification_new_users_default',
  allowOptOut: 'gamification_allow_opt_out',
  showRanking: 'gamification_show_ranking',
} as const;

type WorkspaceSettings = Omit<GamificationSettings, 'users'>;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const TEAM_PERIOD_DAYS: Record<Exclude<TeamPeriod, 'all'>, number> = { '30d': 30, '90d': 90 };

export interface UpdateGamificationInput {
  enabled?: boolean;
  newUsersDefault?: boolean;
  allowOptOut?: boolean;
  showRanking?: boolean;
  users?: Record<string, boolean>;
}

export interface PersonalGamification {
  progress: GamificationProgress;
  resolveXp: Record<string, number>;
}

function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / HOUR_MS;
}

/**
 * When the clock for fast resolutions starts: the first assignment to anyone, or arrival when the
 * report was never assigned. Handing a report back and forth does not restart it.
 */
function clockStart(row: Pick<UserResolutionRow, 'firstAssignedAt' | 'createdAt'>): string {
  return row.firstAssignedAt ?? row.createdAt;
}

function groupByUser<T extends { userId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.userId);
    if (list) list.push(row);
    else groups.set(row.userId, [row]);
  }
  return groups;
}

function times(rows: UserTimeRow[] | undefined): string[] {
  return (rows ?? []).map((row) => row.at);
}

function progressFromTimes(id: AchievementId, times: string[]): AchievementProgress {
  const target = ACHIEVEMENT_TARGETS[id];
  return {
    id,
    current: Math.min(times.length, target),
    target,
    unlockedAt: times.length >= target ? times[target - 1] : undefined,
  };
}

function resolvedWithin(
  resolutions: UserResolutionRow[],
  priorities: readonly string[],
  maxHours: number
): string[] {
  return resolutions
    .filter(
      (row) =>
        priorities.includes(row.priority) &&
        hoursBetween(clockStart(row), row.resolvedAt) <= maxHours
    )
    .map((row) => row.resolvedAt);
}

function firstVisitsToNewProjects(resolutions: UserResolutionRow[]): string[] {
  const seen = new Set<string>();
  const times: string[] = [];
  for (const row of resolutions) {
    if (seen.has(row.projectId)) continue;
    seen.add(row.projectId);
    times.push(row.resolvedAt);
  }
  return times;
}

export function levelFor(
  xp: number
): Pick<GamificationProgress, 'level' | 'levelStartXp' | 'nextLevelXp'> {
  let index = 0;
  while (index + 1 < LEVEL_XP.length && xp >= LEVEL_XP[index + 1]) index++;
  return {
    level: index + 1,
    levelStartXp: LEVEL_XP[index],
    nextLevelXp: LEVEL_XP[index + 1] ?? null,
  };
}

/** Resolutions that were not reopened within the window, counted once the window is over */
function staysFixed(resolutions: UserResolutionRow[], now: number): string[] {
  const window = LADYBUG_STAYS_FIXED_DAYS * DAY_MS;
  return resolutions
    .map((row) => ({ row, settledAt: Date.parse(row.resolvedAt) + window }))
    .filter(
      ({ row, settledAt }) =>
        settledAt <= now && (row.reopenedAt === null || Date.parse(row.reopenedAt) > settledAt)
    )
    .map(({ settledAt }) => new Date(settledAt).toISOString())
    .sort();
}

function waitedLong(resolutions: UserResolutionRow[]): string[] {
  return resolutions
    .filter(
      (row) => Date.parse(row.resolvedAt) - Date.parse(row.createdAt) > AMBER_WAITED_DAYS * DAY_MS
    )
    .map((row) => row.resolvedAt);
}

/** Resolved within the early window of its first assignment, or of arrival when never assigned */
export function resolvedEarly(
  row: Pick<UserResolutionRow, 'firstAssignedAt' | 'createdAt' | 'resolvedAt'>
): boolean {
  return Date.parse(row.resolvedAt) - Date.parse(clockStart(row)) <= EARLY_RESOLVE_MINUTES * 60_000;
}

export function xpFor(resolutions: UserResolutionRow[], reporterMessages: number): number {
  const fromResolutions = resolutions.reduce(
    (sum, row) => sum + XP_BY_PRIORITY[row.priority] * (resolvedEarly(row) ? 2 : 1),
    0
  );
  return fromResolutions + reporterMessages * XP_PER_REPORTER_MESSAGE;
}

export function buildProgress(
  resolutions: UserResolutionRow[],
  quickTriageTimes: string[],
  now: number,
  reporterMessages = 0
): GamificationProgress {
  const xp = xpFor(resolutions, reporterMessages);
  const resolvedTimes = resolutions.map((row) => row.resolvedAt);
  const achievements: AchievementProgress[] = [
    progressFromTimes('hatchling', resolvedTimes),
    progressFromTimes('cocoon', resolvedTimes),
    progressFromTimes('butterfly', resolvedTimes),
    progressFromTimes('firefly', resolvedWithin(resolutions, ['highest'], FIREFLY_RESOLVE_HOURS)),
    progressFromTimes('dragonfly', quickTriageTimes),
    progressFromTimes('ladybug', staysFixed(resolutions, now)),
    progressFromTimes('web_weaver', firstVisitsToNewProjects(resolutions)),
    progressFromTimes('amber', waitedLong(resolutions)),
  ];
  return { xp, ...levelFor(xp), achievements };
}

async function workspaceSettings(): Promise<WorkspaceSettings> {
  return {
    enabled: (await settingsRepo.get<boolean>(KEYS.enabled)) ?? false,
    newUsersDefault: (await settingsRepo.get<boolean>(KEYS.newUsersDefault)) ?? true,
    allowOptOut: (await settingsRepo.get<boolean>(KEYS.allowOptOut)) ?? true,
    showRanking: (await settingsRepo.get<boolean>(KEYS.showRanking)) ?? true,
  };
}

function statusFor(user: User, workspace: WorkspaceSettings, optedOut: boolean) {
  return gamificationStatus(
    { role: user.role, enabled: user.gamificationEnabled !== false, optedOut },
    workspace
  );
}

function selfFor(user: User, workspace: WorkspaceSettings, optedOut: boolean): GamificationSelf {
  const status = statusFor(user, workspace, optedOut);
  const available = status === 'on' || status === 'opted-out';
  return {
    available,
    canOptOut: available && workspace.allowOptOut,
    optedOut,
    active: status === 'on',
  };
}

async function isOptedOut(userId: string): Promise<boolean> {
  return (await userPreferencesRepo.get(userId)).gamificationOptedOut === true;
}

function toGamificationUser(user: User, optedOut: boolean): GamificationUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    enabled: user.gamificationEnabled !== false,
    optedOut,
  };
}

/** XP that resolving each open assigned report would earn at this moment */
function resolveXpFor(userId: string, now: number): Record<string, number> {
  const resolvedAt = new Date(now).toISOString();
  return Object.fromEntries(
    gamificationRepo
      .listOpenAssigned(userId, resolvedAt)
      .map((row) => [
        row.reportId,
        row.resolvedBefore
          ? 0
          : XP_BY_PRIORITY[row.priority] * (resolvedEarly({ ...row, resolvedAt }) ? 2 : 1),
      ])
  );
}

export const gamificationService = {
  async getSettings(): Promise<Result<GamificationSettings>> {
    const optOuts = await userPreferencesRepo.listGamificationOptOuts();
    const users = (await usersRepo.findAll())
      .filter((user) => user.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((user) => toGamificationUser(user, optOuts.has(user.id)));
    return Result.ok({ ...(await workspaceSettings()), users });
  },

  async update(input: UpdateGamificationInput): Promise<Result<GamificationSettings>> {
    const changes = Object.entries(input.users ?? {});
    if (changes.length > 0) {
      const known = new Set((await usersRepo.findAll()).map((user) => user.id));
      const unknown = changes.find(([id]) => !known.has(id));
      if (unknown) return Result.fail(`User ${unknown[0]} not found`, 'NOT_FOUND');
    }
    const settings = Object.fromEntries(
      (['enabled', 'newUsersDefault', 'allowOptOut', 'showRanking'] as const).flatMap((key) =>
        input[key] === undefined ? [] : [[KEYS[key], input[key]]]
      )
    );
    gamificationRepo.saveSettings({
      settings,
      enable: changes.filter(([, enabled]) => enabled).map(([id]) => id),
      disable: changes.filter(([, enabled]) => !enabled).map(([id]) => id),
    });
    logger.info('Gamification settings updated', {
      enabled: input.enabled,
      newUsersDefault: input.newUsersDefault,
      allowOptOut: input.allowOptOut,
      showRanking: input.showRanking,
      usersChanged: changes.length,
    });
    return this.getSettings();
  },

  async isActiveFor(user: User): Promise<Result<boolean>> {
    const self = selfFor(user, await workspaceSettings(), await isOptedOut(user.id));
    return Result.ok(self.active);
  },

  /**
   * People left out of team-wide resolve times: turned off by an admin, or opted out while the
   * workspace allows it. Their choice keeps their numbers out of figures others can see.
   */
  async excludedFromTeamStats(): Promise<Result<Set<string>>> {
    const workspace = await workspaceSettings();
    const optOuts = await userPreferencesRepo.listGamificationOptOuts();
    const excluded = (await usersRepo.findAll())
      .filter(
        (user) =>
          user.gamificationEnabled === false || (workspace.allowOptOut && optOuts.has(user.id))
      )
      .map((user) => user.id);
    return Result.ok(new Set(excluded));
  },

  /** Level, achievements and the XP each open report would earn; null when the user is not active */
  async getPersonal(
    user: User,
    resolutions: UserResolutionRow[],
    now = Date.now()
  ): Promise<Result<PersonalGamification | null>> {
    const active = await this.isActiveFor(user);
    if (!active.success) return active;
    if (!active.value) return Result.ok(null);
    const triage = gamificationRepo.listQuickTriage([user.id], DRAGONFLY_TRIAGE_MINUTES * 60);
    const messages = gamificationRepo.listReporterMessageTimes([user.id]);
    return Result.ok({
      progress: buildProgress(resolutions, times(triage), now, messages.length),
      resolveXp: resolveXpFor(user.id, now),
    });
  },

  /**
   * Everyone who currently takes part, for the Team tab. Only someone who takes part may see it,
   * and people who are turned off or opted out stay hidden.
   */
  async getTeam(
    viewer: User,
    period: TeamPeriod,
    now = Date.now()
  ): Promise<Result<GamificationTeam>> {
    const workspace = await workspaceSettings();
    const optOuts = await userPreferencesRepo.listGamificationOptOuts();
    const takesPart = (user: User) => statusFor(user, workspace, optOuts.has(user.id)) === 'on';
    if (!takesPart(viewer)) {
      return Result.fail('Gamification is not available for this account', 'FORBIDDEN');
    }
    const people = (await usersRepo.findAll()).filter((user) => user.isActive && takesPart(user));
    const ids = people.map((user) => user.id);
    const resolutionsBy = groupByUser(gamificationRepo.listUserResolutions(ids));
    const triageBy = groupByUser(
      gamificationRepo.listQuickTriage(ids, DRAGONFLY_TRIAGE_MINUTES * 60)
    );
    const messagesBy = groupByUser(gamificationRepo.listReporterMessageTimes(ids));
    const since = period === 'all' ? null : now - TEAM_PERIOD_DAYS[period] * DAY_MS;
    const inPeriod = (iso: string) => since === null || Date.parse(iso) >= since;

    const members: TeamMember[] = people.map((user) => {
      const resolutions = resolutionsBy.get(user.id) ?? [];
      const messages = times(messagesBy.get(user.id));
      const progress = buildProgress(
        resolutions,
        times(triageBy.get(user.id)),
        now,
        messages.length
      );
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
                messages.filter(inPeriod).length
              ),
        achievements: progress.achievements,
      };
    });

    members.sort((a, b) =>
      workspace.showRanking
        ? b.periodXp - a.periodXp || b.xp - a.xp || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
    );
    return Result.ok({ ranking: workspace.showRanking, period, members });
  },

  async getSelf(user: User): Promise<Result<GamificationSelf>> {
    return Result.ok(selfFor(user, await workspaceSettings(), await isOptedOut(user.id)));
  },

  async setOptOut(user: User, optedOut: boolean): Promise<Result<GamificationSelf>> {
    const workspace = await workspaceSettings();
    if (!selfFor(user, workspace, await isOptedOut(user.id)).canOptOut) {
      return Result.fail('Gamification cannot be changed for this account', 'FORBIDDEN');
    }
    const saved = await userPreferencesService.update(user.id, { gamificationOptedOut: optedOut });
    if (!saved.success) return Result.fail(saved.error, saved.code);
    logger.info('Gamification opt-out changed', { userId: user.id, optedOut });
    return Result.ok(selfFor(user, workspace, optedOut));
  },

  /** New accounts follow the workspace default; existing switches are left alone */
  async applyNewUserDefault(userId: string): Promise<Result<void>> {
    if (!(await workspaceSettings()).newUsersDefault) {
      usersRepo.setGamification([userId], false);
    }
    return Result.ok(undefined);
  },
};
