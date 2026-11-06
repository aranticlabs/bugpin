import { settingsRepo } from '../database/repositories/settings.repo.js';
import { usersRepo } from '../database/repositories/users.repo.js';
import { userPreferencesRepo } from '../database/repositories/user-preferences.repo.js';
import { userPreferencesService } from './user-preferences.service.js';
import { dashboardRepo, type UserResolutionRow } from '../database/repositories/dashboard.repo.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import {
  EARLY_RESOLVE_MINUTES,
  LEVEL_XP,
  XP_BY_PRIORITY,
  XP_PER_REPORTER_MESSAGE,
  type AchievementId,
  type AchievementProgress,
  type GamificationProgress,
  type GamificationSelf,
  type GamificationSettings,
  type GamificationUser,
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
const STAYS_FIXED_DAYS = 14;
const COLD_CASE_DAYS = 90;

export interface UpdateGamificationInput {
  enabled?: boolean;
  newUsersDefault?: boolean;
  allowOptOut?: boolean;
  showRanking?: boolean;
  users?: Record<string, boolean>;
}

function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / HOUR_MS;
}

function progressFromTimes(
  id: AchievementId,
  times: string[],
  target: number
): AchievementProgress {
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
        row.assignedAt !== null &&
        hoursBetween(row.assignedAt, row.resolvedAt) <= maxHours
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

/** Resolutions that were not reopened within two weeks, counted once those two weeks are over */
function staysFixed(resolutions: UserResolutionRow[], now: number): string[] {
  const window = STAYS_FIXED_DAYS * DAY_MS;
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
      (row) => Date.parse(row.resolvedAt) - Date.parse(row.createdAt) > COLD_CASE_DAYS * DAY_MS
    )
    .map((row) => row.resolvedAt);
}

/** Resolved within the early window, counted from assignment, or from arrival when never assigned */
export function resolvedEarly(row: UserResolutionRow): boolean {
  const start = Date.parse(row.assignedAt ?? row.createdAt);
  return Date.parse(row.resolvedAt) - start <= EARLY_RESOLVE_MINUTES * 60_000;
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
    progressFromTimes('hatchling', resolvedTimes, 1),
    progressFromTimes('cocoon', resolvedTimes, 100),
    progressFromTimes('butterfly', resolvedTimes, 500),
    progressFromTimes('firefly', resolvedWithin(resolutions, ['highest'], 4), 1),
    progressFromTimes('dragonfly', quickTriageTimes, 50),
    progressFromTimes('ladybug', staysFixed(resolutions, now), 25),
    progressFromTimes('web_weaver', firstVisitsToNewProjects(resolutions), 5),
    progressFromTimes('amber', waitedLong(resolutions), 1),
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

/** Workspace and admin switches only, before the user's own choice */
function availableTo(user: User, workspace: WorkspaceSettings): boolean {
  return workspace.enabled && user.role !== 'viewer' && user.gamificationEnabled !== false;
}

function selfFor(user: User, workspace: WorkspaceSettings, optedOut: boolean): GamificationSelf {
  const available = availableTo(user, workspace);
  return {
    available,
    canOptOut: available && workspace.allowOptOut,
    optedOut,
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
      usersRepo.setGamification(
        changes.filter(([, enabled]) => enabled).map(([id]) => id),
        true
      );
      usersRepo.setGamification(
        changes.filter(([, enabled]) => !enabled).map(([id]) => id),
        false
      );
    }
    for (const key of ['enabled', 'newUsersDefault', 'allowOptOut', 'showRanking'] as const) {
      const value = input[key];
      if (value !== undefined) await settingsRepo.set(KEYS[key], value);
    }
    logger.info('Gamification settings updated', {
      enabled: input.enabled,
      newUsersDefault: input.newUsersDefault,
      allowOptOut: input.allowOptOut,
      showRanking: input.showRanking,
      usersChanged: changes.length,
    });
    return this.getSettings();
  },

  /** Viewers never take part, whatever the switches say. An opt-out counts only while allowed. */
  async isActiveFor(user: User): Promise<boolean> {
    const self = selfFor(user, await workspaceSettings(), await isOptedOut(user.id));
    return self.available && !(self.canOptOut && self.optedOut);
  },

  /**
   * Everyone who currently takes part, for the Team tab. Only someone who takes part may see it,
   * and people who are turned off or opted out stay hidden.
   */
  async teamFor(viewer: User): Promise<Result<{ ranking: boolean; members: User[] }>> {
    const workspace = await workspaceSettings();
    const optOuts = await userPreferencesRepo.listGamificationOptOuts();
    const takesPart = (user: User) =>
      availableTo(user, workspace) && !(workspace.allowOptOut && optOuts.has(user.id));
    if (!takesPart(viewer)) {
      return Result.fail('Gamification is not available for this account', 'FORBIDDEN');
    }
    const members = (await usersRepo.findAll()).filter((user) => user.isActive && takesPart(user));
    return Result.ok({ ranking: workspace.showRanking, members });
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
  async applyNewUserDefault(userId: string): Promise<void> {
    if (!(await workspaceSettings()).newUsersDefault) {
      usersRepo.setGamification([userId], false);
    }
  },

  progressFor(
    userId: string,
    resolutions: UserResolutionRow[],
    now = Date.now()
  ): GamificationProgress {
    return buildProgress(
      resolutions,
      dashboardRepo.listQuickTriage(userId),
      now,
      dashboardRepo.countReporterMessages(userId)
    );
  },
};
