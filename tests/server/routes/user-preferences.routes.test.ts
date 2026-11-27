import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono';
import { settingsCacheService } from '../../../src/server/services/settings-cache.service';
import { userPreferencesRoutes } from '../../../src/server/routes/api/user-preferences';
import { authService } from '../../../src/server/services/auth.service';
import { userPreferencesService } from '../../../src/server/services/user-preferences.service';
import { Result } from '../../../src/server/utils/result';
import type { AppSettings } from '../../../src/shared/types';
import type { Session, User, UserPreferences } from '../../../src/shared/types';

const viewer: User = {
  id: 'usr_viewer',
  email: 'viewer@example.com',
  name: 'Viewer',
  role: 'viewer',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const session: Session = {
  id: 'sess_1',
  userId: viewer.id,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalUserPreferencesService = { ...userPreferencesService };
let updates: Array<{ userId: string; changes: UserPreferences }> = [];

function request(method: string, body?: unknown) {
  const app = new Hono();
  app.route('/user-preferences', userPreferencesRoutes);
  return app.request('http://localhost/user-preferences/me', {
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
  updates = [];
  authService.validateSession = async () => Result.ok({ user: viewer, session });
  userPreferencesService.get = async () => Result.ok({ sidebarWidth: 300 });
  userPreferencesService.update = async (userId, changes) => {
    updates.push({ userId, changes });
    return Result.ok({ sidebarWidth: 300, ...changes });
  };
});

afterEach(() => {
  settingsCacheService.getAll = originalSettingsCacheGetAll;
  Object.assign(authService, originalAuthService);
  Object.assign(userPreferencesService, originalUserPreferencesService);
});

describe('user preferences routes', () => {
  it('returns the preferences of the signed-in user', async () => {
    const res = await request('GET');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, preferences: { sidebarWidth: 300 } });
  });

  it('updates the sidebar width of the signed-in user', async () => {
    const res = await request('PATCH', { sidebarWidth: 360 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, preferences: { sidebarWidth: 360 } });
    expect(updates).toEqual([{ userId: viewer.id, changes: { sidebarWidth: 360 } }]);
  });

  it('rejects widths outside the allowed range and unknown keys', async () => {
    expect((await request('PATCH', { sidebarWidth: 50 })).status).toBe(400);
    expect((await request('PATCH', { sidebarWidth: 5000 })).status).toBe(400);
    expect((await request('PATCH', { favoriteColor: 'blue' })).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('accepts every known preference', async () => {
    const changes: UserPreferences = {
      theme: 'dark',
      sidebarOpen: false,
      pinnedProjectsOpen: false,
      projectsPageSize: 50,
      reportsPageSize: 10,
      reportsView: 'board',
      reportsBoardCollapsed: ['resolved', 'closed'],
      reportDetailsOpen: true,
      reportPageInfoOpen: false,
      reportEnvironmentOpen: true,
      reportMessagesOpen: false,
      dialogPreviewOpen: false,
      lastExport: { format: 'aiPrompt', action: 'copy' },
      editorLocale: 'de',
      dismissedUpdateVersion: '2.0.1',
      dismissedWidgetWarningId: null,
    };
    expect((await request('PATCH', changes)).status).toBe(200);
    expect(updates).toEqual([{ userId: viewer.id, changes }]);
  });

  it('rejects values outside each preference', async () => {
    for (const body of [
      { theme: 'blue' },
      { sidebarOpen: 'yes' },
      { lastExport: { format: 'pdf', action: 'copy' } },
      { lastExport: { format: 'json', action: 'print' } },
      { editorLocale: 'xx' },
      { projectsPageSize: 20 },
      { reportsPageSize: '25' },
      { reportsView: 'grid' },
      { reportsBoardCollapsed: ['done'] },
      { reportsBoardCollapsed: 'closed' },
      { dismissedUpdateVersion: 'x'.repeat(101) },
    ]) {
      expect((await request('PATCH', body)).status).toBe(400);
    }
    expect(updates).toEqual([]);
  });

  it('requires a session', async () => {
    authService.validateSession = async () => Result.fail('Invalid session', 'INVALID_SESSION');
    expect((await request('GET')).status).toBe(401);
  });
});
