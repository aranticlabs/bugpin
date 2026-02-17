import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { notificationPreferences } from '../../../src/server/routes/api/notification-preferences';
import { notificationsService } from '../../../src/server/services/notifications.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import type {
  NotificationPreferences as NotificationPreferencesType,
  ProjectNotificationDefaults,
  Session,
  User,
} from '../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const viewerUser: User = {
  ...baseUser,
  id: 'usr_2',
  email: 'viewer@example.com',
  name: 'Viewer',
  role: 'viewer',
};

const baseSession: Session = {
  id: 'sess_1',
  userId: 'usr_1',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const basePreferences: NotificationPreferencesType = {
  id: 'np_1',
  userId: 'usr_1',
  projectId: 'prj_1',
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: false,
  notifyOnAssignment: true,
  emailEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseDefaults: ProjectNotificationDefaults = {
  id: 'pnd_1',
  projectId: 'prj_1',
  defaultNotifyOnNewReport: true,
  defaultNotifyOnStatusChange: true,
  defaultNotifyOnPriorityChange: false,
  defaultNotifyOnAssignment: true,
  defaultEmailEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalNotificationsService = { ...notificationsService };

let currentUser = baseUser;

beforeEach(() => {
  currentUser = baseUser;

  authService.validateSession = async () =>
    Result.ok({
      user: currentUser,
      session: baseSession,
    });

  notificationsService.getAllUserPreferences = async () => Result.ok([basePreferences]);
  notificationsService.getUserPreferences = async () => Result.ok(basePreferences);
  notificationsService.updateUserPreferences = async () => Result.ok(basePreferences);
  notificationsService.getProjectDefaults = async () => Result.ok(baseDefaults);
  notificationsService.updateProjectDefaults = async () => Result.ok(baseDefaults);
  notificationsService.deleteProjectDefaults = async () => Result.ok(undefined);
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(notificationsService, originalNotificationsService);
});

function createApp() {
  const app = new Hono();
  app.route('/notification-preferences', notificationPreferences);
  return app;
}

describe('notification-preferences routes', () => {
  describe('GET /notification-preferences/me', () => {
    it('returns all user preferences', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/notification-preferences/me', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.preferences).toHaveLength(1);
    });

    it('returns 400 when service fails', async () => {
      notificationsService.getAllUserPreferences = async () =>
        Result.fail('Database error', 'DB_ERROR');

      const app = createApp();
      const res = await app.request('http://localhost/notification-preferences/me', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /notification-preferences/me/projects/:projectId', () => {
    it('returns user preferences for project', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/notification-preferences/me/projects/prj_1', {
        headers: { cookie: 'session=sess_1' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.preferences.projectId).toBe('prj_1');
    });

    it('returns 404 when project not found', async () => {
      notificationsService.getUserPreferences = async () =>
        Result.fail('Project not found', 'PROJECT_NOT_FOUND');

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/me/projects/prj_missing',
        {
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /notification-preferences/me/projects/:projectId', () => {
    it('updates user preferences', async () => {
      const app = createApp();
      const res = await app.request('http://localhost/notification-preferences/me/projects/prj_1', {
        method: 'PATCH',
        headers: {
          cookie: 'session=sess_1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          notifyOnNewReport: false,
          emailEnabled: false,
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 when project not found', async () => {
      notificationsService.updateUserPreferences = async () =>
        Result.fail('Project not found', 'PROJECT_NOT_FOUND');

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/me/projects/prj_missing',
        {
          method: 'PATCH',
          headers: {
            cookie: 'session=sess_1',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            notifyOnNewReport: false,
          }),
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /notification-preferences/projects/:projectId/defaults', () => {
    it('returns project defaults for admin', async () => {
      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_1/defaults',
        {
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.defaults.projectId).toBe('prj_1');
    });

    it('returns 403 for viewer', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_1/defaults',
        {
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(403);
    });

    it('returns 404 when project not found', async () => {
      notificationsService.getProjectDefaults = async () =>
        Result.fail('Project not found', 'PROJECT_NOT_FOUND');

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_missing/defaults',
        {
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /notification-preferences/projects/:projectId/defaults', () => {
    it('updates project defaults for admin', async () => {
      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_1/defaults',
        {
          method: 'PATCH',
          headers: {
            cookie: 'session=sess_1',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            defaultNotifyOnNewReport: false,
          }),
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 403 for viewer', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_1/defaults',
        {
          method: 'PATCH',
          headers: {
            cookie: 'session=sess_1',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            defaultNotifyOnNewReport: false,
          }),
        },
      );

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /notification-preferences/projects/:projectId/defaults', () => {
    it('deletes project defaults for admin', async () => {
      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_1/defaults',
        {
          method: 'DELETE',
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 403 for viewer', async () => {
      currentUser = viewerUser;

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_1/defaults',
        {
          method: 'DELETE',
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(403);
    });

    it('returns 404 when project not found', async () => {
      notificationsService.deleteProjectDefaults = async () =>
        Result.fail('Project not found', 'PROJECT_NOT_FOUND');

      const app = createApp();
      const res = await app.request(
        'http://localhost/notification-preferences/projects/prj_missing/defaults',
        {
          method: 'DELETE',
          headers: { cookie: 'session=sess_1' },
        },
      );

      expect(res.status).toBe(404);
    });
  });
});
