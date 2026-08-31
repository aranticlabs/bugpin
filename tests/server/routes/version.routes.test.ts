import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { versionRoutes } from '../../../src/server/routes/api/version';
import { authService } from '../../../src/server/services/auth.service';
import { updateCheckService } from '../../../src/server/services/update-check.service';
import { widgetPackageCompatibilityService } from '../../../src/server/services/widget-package-compatibility.service';
import { Result } from '../../../src/server/utils/result';
import type { Session, User, UserRole } from '../../../src/shared/types';

function makeUser(role: UserRole, overrides: Partial<User> = {}): User {
  return {
    id: `usr_${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const baseSession: Session = {
  id: 'sess_1',
  userId: 'usr_admin',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalGetStatus = updateCheckService.getStatus.bind(updateCheckService);
const originalWidgetPackageGetStatus = widgetPackageCompatibilityService.getStatus.bind(
  widgetPackageCompatibilityService
);

beforeEach(() => {
  updateCheckService.getStatus = async () =>
    Result.ok({
      current: '1.0.6',
      latest: '1.0.7',
      updateAvailable: true,
      releaseUrl: 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7',
      publishedAt: '2026-04-22T10:14:00Z',
      lastCheckedAt: '2026-05-01T08:00:00Z',
      checkEnabled: true,
    });
  widgetPackageCompatibilityService.getStatus = async () =>
    Result.ok({
      minimumSupportedVersion: '1.1.3',
      incompatible: true,
      warningId: 'warning_1',
      affectedProjects: [
        {
          projectId: 'proj_1',
          projectName: 'Checkout',
          observedVersions: ['1.1.2'],
          deploymentCount: 2,
        },
      ],
    });
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  updateCheckService.getStatus = originalGetStatus;
  widgetPackageCompatibilityService.getStatus = originalWidgetPackageGetStatus;
});

function createApp() {
  const app = new Hono();
  app.route('/version', versionRoutes);
  return app;
}

function requestWithRole(role: UserRole | null) {
  if (role === null) {
    authService.validateSession = async () => Result.fail('No session', 'UNAUTHORIZED');
  } else {
    authService.validateSession = async () =>
      Result.ok({ user: makeUser(role), session: baseSession });
  }
  return createApp();
}

describe('GET /version', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = requestWithRole(null);
    const res = await app.request('http://localhost/version');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewers', async () => {
    const app = requestWithRole('viewer');
    const res = await app.request('http://localhost/version', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 for editors', async () => {
    const app = requestWithRole('editor');
    const res = await app.request('http://localhost/version', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 with the documented payload for admins', async () => {
    const app = requestWithRole('admin');
    const res = await app.request('http://localhost/version', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      current: '1.0.6',
      latest: '1.0.7',
      updateAvailable: true,
      releaseUrl: 'https://github.com/aranticlabs/bugpin/releases/tag/v1.0.7',
      publishedAt: '2026-04-22T10:14:00Z',
      lastCheckedAt: '2026-05-01T08:00:00Z',
      checkEnabled: true,
      widgetPackage: {
        minimumSupportedVersion: '1.1.3',
        incompatible: true,
        warningId: 'warning_1',
        affectedProjects: [
          {
            projectId: 'proj_1',
            projectName: 'Checkout',
            observedVersions: ['1.1.2'],
            deploymentCount: 2,
          },
        ],
      },
    });
  });

  it('reports checkEnabled=false when the setting is off', async () => {
    updateCheckService.getStatus = async () =>
      Result.ok({
        current: '1.0.6',
        latest: null,
        updateAvailable: false,
        releaseUrl: null,
        publishedAt: null,
        lastCheckedAt: null,
        checkEnabled: false,
      });

    const app = requestWithRole('admin');
    const res = await app.request('http://localhost/version', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkEnabled).toBe(false);
    expect(body.widgetPackage.incompatible).toBe(true);
  });

  it('returns 500 when the service fails', async () => {
    updateCheckService.getStatus = async () => Result.fail('boom', 'UPDATE_CHECK_ERROR');
    const app = requestWithRole('admin');
    const res = await app.request('http://localhost/version', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(500);
  });

  it('returns 500 when widget compatibility status fails', async () => {
    widgetPackageCompatibilityService.getStatus = async () => Result.fail('boom', 'STATUS_ERROR');
    const app = requestWithRole('admin');
    const res = await app.request('http://localhost/version', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(500);
  });
});
