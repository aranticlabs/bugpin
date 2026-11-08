import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { dashboardRoutes } from '../../../src/server/routes/api/dashboard';
import { gamificationRoutes } from '../../../src/server/routes/api/gamification';
import { authService } from '../../../src/server/services/auth.service';
import {
  dashboardService,
  type OverviewQuery,
} from '../../../src/server/services/dashboard.service';
import {
  gamificationService,
  type UpdateGamificationInput,
} from '../../../src/server/services/gamification.service';
import { Result } from '../../../src/server/utils/result';
import type { AppSettings } from '../../../src/shared/types';
import type {
  DashboardOverview,
  DashboardPersonal,
  GamificationSettings,
  Session,
  User,
  UserRole,
} from '../../../src/shared/types';

function userWithRole(role: UserRole): User {
  return {
    id: `usr_${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const session: Session = {
  id: 'sess_1',
  userId: 'usr_admin',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const settings: GamificationSettings = {
  enabled: true,
  newUsersDefault: true,
  allowOptOut: true,
  showRanking: true,
  users: [],
};
const emptyKpi = { value: 0, previous: 0, series: [] };
const overview: DashboardOverview = {
  kpis: { backlog: emptyKpi, created: emptyKpi, resolved: emptyKpi, resolveHours: emptyKpi },
  intake: [],
  backlogByPriority: { highest: 0, high: 0, medium: 0, low: 0, lowest: 0 },
  needsAttention: [],
  needsAttentionTotal: 0,
  activity: [],
};

const personal: DashboardPersonal = {
  assignedOpen: 0,
  oldestAssignedAt: null,
  resolvedThisMonth: 0,
  resolvedLastMonth: 0,
  resolveTime: {
    medianHours: null,
    previousMedianHours: null,
    teamMedianHours: null,
    bestHours: null,
    resolvedLast30Days: 0,
    weekly: [],
    byPriority: [],
  },
  gamification: null,
  resolveXp: {},
};

const originalAuthService = { ...authService };
const originalDashboardService = { ...dashboardService };
const originalGamificationService = { ...gamificationService };
let signedIn: User = userWithRole('admin');
let overviewQueries: OverviewQuery[] = [];
let updates: UpdateGamificationInput[] = [];
let optOuts: boolean[] = [];

function request(path: string, method = 'GET', body?: unknown) {
  const app = new Hono();
  app.route('/dashboard', dashboardRoutes);
  app.route('/gamification', gamificationRoutes);
  return app.request(`http://localhost${path}`, {
    method,
    headers: {
      cookie: 'session=sess_1',
      origin: 'http://localhost',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const originalSettingsCacheGetAll = settingsCacheService.getAll;

beforeEach(() => {
  settingsCacheService.getAll = async () => ({ appUrl: 'http://localhost' }) as AppSettings;
  signedIn = userWithRole('admin');
  overviewQueries = [];
  updates = [];
  authService.validateSession = async () => Result.ok({ user: signedIn, session });
  dashboardService.getOverview = async (query) => {
    overviewQueries.push(query);
    return Result.ok(overview);
  };
  gamificationService.getSettings = async () => Result.ok(settings);
  optOuts = [];
  gamificationService.setOptOut = async (_user, optedOut) => {
    optOuts.push(optedOut);
    return Result.ok({ available: true, canOptOut: true, optedOut, active: !optedOut });
  };
  gamificationService.update = async (input) => {
    updates.push(input);
    return Result.ok(settings);
  };
});

afterEach(() => {
  settingsCacheService.getAll = originalSettingsCacheGetAll;
  Object.assign(authService, originalAuthService);
  Object.assign(dashboardService, originalDashboardService);
  Object.assign(gamificationService, originalGamificationService);
});

describe('dashboard routes', () => {
  it('passes the project, range and time zone to the service', async () => {
    signedIn = userWithRole('viewer');
    const res = await request(
      '/dashboard/overview?projectId=prj_1&range=90&timeZone=Europe/Berlin'
    );
    expect(res.status).toBe(200);
    expect(overviewQueries).toEqual([{ projectId: 'prj_1', range: 90, timeZone: 'Europe/Berlin' }]);
  });

  it('defaults to 30 days and rejects other ranges', async () => {
    await request('/dashboard/overview');
    expect(overviewQueries[0]?.range).toBe(30);
    expect((await request('/dashboard/overview?range=12')).status).toBe(400);
    expect((await request('/dashboard/overview?range=abc')).status).toBe(400);
  });

  it('passes an unknown time zone on, for the service to fall back to UTC', async () => {
    expect((await request('/dashboard/overview?timeZone=Not/AZone')).status).toBe(200);
    expect(overviewQueries[0]?.timeZone).toBe('Not/AZone');
    const tooLong = `Europe/${'x'.repeat(100)}`;
    expect((await request(`/dashboard/overview?timeZone=${tooLong}`)).status).toBe(400);
  });

  it('maps an unexpected service failure to 500', async () => {
    dashboardService.getOverview = async () => Result.fail('Disk full', 'QUERY_FAILED');
    const res = await request('/dashboard/overview');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: 'QUERY_FAILED',
      message: 'Disk full',
    });
  });

  it('limits how often one account can load the dashboard', async () => {
    signedIn = { ...userWithRole('editor'), id: 'usr_burst' };
    const statuses: number[] = [];
    for (let index = 0; index < 121; index++) {
      statuses.push((await request('/dashboard/overview')).status);
    }
    expect(statuses.slice(0, 120).every((status) => status === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});

describe('personal route', () => {
  it('loads the signed-in user with their time zone', async () => {
    signedIn = userWithRole('editor');
    const calls: [string, string | undefined][] = [];
    dashboardService.getPersonal = async (user, timeZone) => {
      calls.push([user.id, timeZone]);
      return Result.ok(personal);
    };
    const res = await request('/dashboard/me?timeZone=Europe/Berlin');
    expect(res.status).toBe(200);
    expect(calls).toEqual([['usr_editor', 'Europe/Berlin']]);
  });

  it('maps service failures to their status', async () => {
    dashboardService.getPersonal = async () => Result.fail('Not allowed', 'FORBIDDEN');
    expect((await request('/dashboard/me')).status).toBe(403);
    dashboardService.getPersonal = async () => Result.fail('Broken', 'QUERY_FAILED');
    expect((await request('/dashboard/me')).status).toBe(500);
  });
});

describe('team route', () => {
  it('returns the team for the requested period, or 403 for people who do not take part', async () => {
    const periods: string[] = [];
    gamificationService.getTeam = async (_user, period) => {
      periods.push(period);
      return Result.ok({ ranking: true, period, members: [] });
    };
    const ok = await request('/dashboard/team?period=90d');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      success: true,
      team: { ranking: true, period: '90d', members: [] },
    });
    await request('/dashboard/team');
    expect(periods).toEqual(['90d', '30d']);
    expect((await request('/dashboard/team?period=7d')).status).toBe(400);

    gamificationService.getTeam = async () => Result.fail('Not available', 'FORBIDDEN');
    expect((await request('/dashboard/team')).status).toBe(403);
  });
});

describe('gamification routes', () => {
  it('lets admins read and change the switches', async () => {
    expect((await request('/gamification')).status).toBe(200);
    const res = await request('/gamification', 'PUT', { enabled: false, users: { usr_x: true } });
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ enabled: false, users: { usr_x: true } }]);
  });

  it('refuses editors and viewers', async () => {
    for (const role of ['editor', 'viewer'] as const) {
      signedIn = userWithRole(role);
      expect((await request('/gamification')).status).toBe(403);
      expect((await request('/gamification', 'PUT', { enabled: true })).status).toBe(403);
    }
    expect(updates).toEqual([]);
  });

  it('rejects unknown fields', async () => {
    expect((await request('/gamification', 'PUT', { streaks: true })).status).toBe(400);
  });
});

describe('own gamification switch', () => {
  it('lets any signed-in user change their own opt-out', async () => {
    signedIn = userWithRole('editor');
    const res = await request('/gamification/me', 'PATCH', { optedOut: true });
    expect(res.status).toBe(200);
    expect(optOuts).toEqual([true]);
  });

  it('returns 403 when the service refuses', async () => {
    gamificationService.setOptOut = async () => Result.fail('Not allowed', 'FORBIDDEN');
    expect((await request('/gamification/me', 'PATCH', { optedOut: true })).status).toBe(403);
  });

  it('rejects anything but the opt-out flag', async () => {
    expect((await request('/gamification/me', 'PATCH', { enabled: true })).status).toBe(400);
    expect(optOuts).toEqual([]);
  });
});
