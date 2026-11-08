import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { Hono } from '../../src/server/node_modules/hono';
import { config } from '../../src/server/config';
import {
  closeDatabase,
  getDb,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../src/server/database/database';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { apiTokensRepo } from '../../src/server/database/repositories/api-tokens.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { authService } from '../../src/server/services/auth.service';
import { emailService } from '../../src/server/services/email.service';
import { userAccessService } from '../../src/server/services/user-access.service';
import { usersService } from '../../src/server/services/users.service';
import { passwordResetService } from '../../src/server/services/password-reset.service';
import { twoFactorService } from '../../src/server/services/two-factor.service';
import { usersRoutes } from '../../src/server/routes/api/users';
import {
  hasApiAccess,
  requireApiAccessToCreateTokens,
} from '../../src/server/middleware/api-access';
import { logger } from '../../src/server/utils/logger';
import type { ApiTokenValidationResult } from '../../src/server/types/ee-plugin';
import type { User } from '../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const originalSendPasswordResetEmail = emailService.sendPasswordResetEmail;
const password = 'initial-password-1';
const newPassword = 'replacement-password-2';
let tempDir = '';
let user: User;
let sentResetUrls: string[] = [];

async function sessionCookie(target: User): Promise<string> {
  const session = await sessionsRepo.create({
    userId: target.id,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  return `session=${session.id}`;
}

function usersApp(): Hono {
  const app = new Hono();
  app.route('/users', usersRoutes);
  return app;
}

async function sendJson(
  app: Hono,
  cookie: string,
  method: string,
  url: string,
  body?: unknown
): Promise<Response> {
  return Promise.resolve(
    app.request(`http://localhost${url}`, {
      method,
      headers: {
        cookie,
        origin: new URL((await settingsRepo.getAll()).appUrl || 'http://localhost').origin,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

async function activeTokenCount(userId: string): Promise<number> {
  return (await apiTokensRepo.findByUserId(userId)).length;
}

async function createUser(overrides: Partial<Pick<User, 'role'>> = {}): Promise<User> {
  return usersRepo.create({
    email: `user-${crypto.randomUUID()}@example.test`,
    passwordHash: await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 4 }),
    name: 'User',
    role: overrides.role ?? 'editor',
  });
}

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-user-access-'));
  Object.assign(config, { dataDir: tempDir, dbPath: path.join(tempDir, 'bugpin.db') });
  await initDatabase();
  await initSchema();
  await runMigrations();
});

afterAll(() => {
  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  Object.assign(config, originalConfig);
  Object.assign(logger, originalLogger);
});

beforeEach(async () => {
  sentResetUrls = [];
  emailService.sendPasswordResetEmail = async (_recipient, data) => {
    sentResetUrls.push(data.resetUrl);
    return { success: true };
  };
  await settingsRepo.updateAll({ appUrl: 'https://bugpin.example.test' });
  settingsCacheService.invalidate();
  user = await createUser();
});

afterEach(() => {
  emailService.sendPasswordResetEmail = originalSendPasswordResetEmail;
});

describe('API access migration', () => {
  it('keeps API access for users who hold a usable token', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE api_tokens (
        id TEXT PRIMARY KEY, user_id TEXT, revoked_at TEXT, expires_at TEXT
      );
      INSERT INTO users (id) VALUES ('usr_active'), ('usr_revoked'), ('usr_expired'), ('usr_none');
      INSERT INTO api_tokens VALUES
        ('t1', 'usr_active', NULL, NULL),
        ('t2', 'usr_revoked', '2026-01-01T00:00:00.000Z', NULL),
        ('t3', 'usr_expired', NULL, '2020-01-01T00:00:00.000Z');
    `);
    const sql = fs.readFileSync(
      path.join(
        import.meta.dir,
        '../../src/server/database/migrations/008_add_user_api_access.sql'
      ),
      'utf8'
    );
    db.exec(sql);

    const rows = db.query('SELECT id, api_access_enabled FROM users ORDER BY id').all() as {
      id: string;
      api_access_enabled: number;
    }[];
    expect(Object.fromEntries(rows.map((row) => [row.id, row.api_access_enabled]))).toEqual({
      usr_active: 1,
      usr_expired: 0,
      usr_none: 0,
      usr_revoked: 0,
    });
    db.close();
  });

  it('starts new users without API access', () => {
    expect(user.apiAccessEnabled).toBe(false);
  });
});

describe('userAccessService', () => {
  it('turns API access on and off, revoking tokens when it goes off', async () => {
    const enabled = await userAccessService.setApiAccess(user.id, true);
    expect(enabled.success && enabled.value.apiAccessEnabled).toBe(true);

    await apiTokensRepo.create({ userId: user.id, name: 'CI' });
    const listed = await userAccessService.listApiTokens(user.id);
    expect(listed.success && listed.value).toHaveLength(1);

    const disabled = await userAccessService.setApiAccess(user.id, false);
    expect(disabled.success && disabled.value.apiAccessEnabled).toBe(false);
    expect(await apiTokensRepo.findByUserId(user.id)).toHaveLength(0);
  });

  it('revokes all tokens of a user', async () => {
    await apiTokensRepo.create({ userId: user.id, name: 'One' });
    await apiTokensRepo.create({ userId: user.id, name: 'Two' });

    const revoked = await userAccessService.revokeApiTokens(user.id);
    expect(revoked.success && revoked.value).toBe(2);
    expect(await apiTokensRepo.findByUserId(user.id)).toHaveLength(0);
  });

  it('signs a user out of every session', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await sessionsRepo.create({ userId: user.id, expiresAt });
    await sessionsRepo.create({ userId: user.id, expiresAt });

    const ended = await userAccessService.signOutEverywhere(user.id);
    expect(ended.success && ended.value).toBe(2);
    expect(await sessionsRepo.findByUserId(user.id)).toHaveLength(0);
  });

  it('sets a temporary password the user must replace', async () => {
    const result = await userAccessService.setTemporaryPassword(user.id, 'temporary-pass-3');
    expect(result.success).toBe(true);

    const updated = await usersRepo.findById(user.id);
    expect(updated?.mustChangePassword).toBe(true);
    const login = await authService.login(user.email, 'temporary-pass-3');
    expect(login.success).toBe(true);
  });

  it('applies the password policy to temporary passwords', async () => {
    const result = await userAccessService.setTemporaryPassword(user.id, 'short');
    expect(result.success).toBe(false);
  });

  it('reports unknown users', async () => {
    const result = await userAccessService.signOutEverywhere('usr_missing');
    expect(result.success).toBe(false);
    expect(!result.success && result.code).toBe('NOT_FOUND');
  });
});

describe('password reset flow', () => {
  it('emails a single-use link that sets a new password', async () => {
    await sessionsRepo.create({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect((await passwordResetService.sendResetEmail(user.id)).success).toBe(true);
    expect(sentResetUrls).toHaveLength(1);
    expect(sentResetUrls[0]).toStartWith('https://bugpin.example.test/admin/reset-password?token=');
    const token = tokenFrom(sentResetUrls[0]);

    const target = await passwordResetService.validateToken(token);
    expect(target.success && target.value.email).toBe(user.email);

    expect((await passwordResetService.completeReset(token, newPassword)).success).toBe(true);
    expect(await sessionsRepo.findByUserId(user.id)).toHaveLength(0);
    expect((await authService.login(user.email, newPassword)).success).toBe(true);

    const reused = await passwordResetService.completeReset(token, 'another-password-4');
    expect(!reused.success && reused.code).toBe('INVALID_TOKEN');
  });

  it('replaces an earlier link when a new one is sent', async () => {
    await passwordResetService.sendResetEmail(user.id);
    await passwordResetService.sendResetEmail(user.id);
    const [first, second] = sentResetUrls.map(tokenFrom);

    expect((await passwordResetService.validateToken(first)).success).toBe(false);
    expect((await passwordResetService.validateToken(second)).success).toBe(true);
  });

  it('keeps the link usable when the new password breaks the policy', async () => {
    await passwordResetService.sendResetEmail(user.id);
    const token = tokenFrom(sentResetUrls[0]);

    expect((await passwordResetService.completeReset(token, 'short')).success).toBe(false);
    expect((await passwordResetService.completeReset(token, newPassword)).success).toBe(true);
  });

  it('needs the Application URL to build the link', async () => {
    await settingsRepo.updateAll({ appUrl: '' });
    settingsCacheService.invalidate();

    const result = await passwordResetService.sendResetEmail(user.id);
    expect(!result.success && result.code).toBe('APP_URL_MISSING');
    expect(sentResetUrls).toHaveLength(0);
  });

  it('discards the link when the email cannot be sent', async () => {
    emailService.sendPasswordResetEmail = async (_recipient, data) => {
      sentResetUrls.push(data.resetUrl);
      return { success: false, error: 'SMTP is not configured' };
    };

    const result = await passwordResetService.sendResetEmail(user.id);
    expect(!result.success && result.code).toBe('EMAIL_FAILED');
    expect((await passwordResetService.validateToken(tokenFrom(sentResetUrls[0]))).success).toBe(
      false
    );
  });

  it('refuses disabled users', async () => {
    await passwordResetService.sendResetEmail(user.id);
    await usersRepo.update(user.id, { isActive: false });

    const token = tokenFrom(sentResetUrls[0]);
    expect((await passwordResetService.validateToken(token)).success).toBe(false);
    expect((await passwordResetService.completeReset(token, newPassword)).success).toBe(false);
    expect((await passwordResetService.sendResetEmail(user.id)).success).toBe(false);
  });

  it('rejects unknown links', async () => {
    const result = await passwordResetService.validateToken('not-a-real-token');
    expect(!result.success && result.code).toBe('INVALID_TOKEN');
  });
});

describe('API access guards', () => {
  it('treats admins as always having API access', () => {
    expect(hasApiAccess({ role: 'admin', apiAccessEnabled: false })).toBe(true);
    expect(hasApiAccess({ role: 'editor', apiAccessEnabled: false })).toBe(false);
    expect(hasApiAccess({ role: 'viewer', apiAccessEnabled: true })).toBe(true);
  });

  it('blocks token creation only for users without API access', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { ...user, apiAccessEnabled: c.req.header('x-access') === 'on' });
      return next();
    });
    app.use('/tokens', requireApiAccessToCreateTokens);
    app.on(['GET', 'POST'], '/tokens', (c) => c.json({ success: true }));

    const create = (access: string) =>
      app.request('http://localhost/tokens', { method: 'POST', headers: { 'x-access': access } });

    const denied = await create('off');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: 'API_ACCESS_DISABLED' });
    expect((await create('on')).status).toBe(200);
    expect((await app.request('http://localhost/tokens')).status).toBe(200);
  });
});

describe('last admin protection', () => {
  let adminA: User;
  let adminB: User;
  let cookieA: string;

  beforeEach(async () => {
    getDb().run("UPDATE users SET role = 'viewer' WHERE role = 'admin'");
    adminA = await createUser({ role: 'admin' });
    adminB = await createUser({ role: 'admin' });
    cookieA = await sessionCookie(adminA);
  });

  it('demotes an admin while another active admin remains', async () => {
    const res = await sendJson(usersApp(), cookieA, 'PATCH', `/users/${adminB.id}`, {
      role: 'editor',
    });
    expect(res.status).toBe(200);
    expect((await usersRepo.findById(adminB.id))?.role).toBe('editor');
  });

  it('refuses to demote or deactivate the last active admin', async () => {
    const app = usersApp();
    getDb().run("UPDATE users SET role = 'viewer' WHERE id = ?", [adminB.id]);

    for (const body of [{ role: 'viewer' }, { isActive: false }]) {
      const res = await sendJson(app, cookieA, 'PATCH', `/users/${adminA.id}`, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'LAST_ADMIN' });
    }
    expect(await usersRepo.findById(adminA.id)).toMatchObject({ role: 'admin', isActive: true });
  });

  it('does not count an admin that was deactivated', async () => {
    const app = usersApp();
    const deactivated = await sendJson(app, cookieA, 'PATCH', `/users/${adminB.id}`, {
      isActive: false,
    });
    expect(deactivated.status).toBe(200);

    const demoted = await sendJson(app, cookieA, 'PATCH', `/users/${adminA.id}`, {
      role: 'viewer',
    });
    expect(demoted.status).toBe(400);
    expect(await demoted.json()).toMatchObject({ error: 'LAST_ADMIN' });
    expect((await usersRepo.findById(adminA.id))?.role).toBe('admin');
  });

  it('does not count an admin whose invitation is still pending', async () => {
    getDb().run("UPDATE users SET role = 'viewer' WHERE id = ?", [adminB.id]);
    const invited = await usersRepo.createInvited({
      email: `invited-${crypto.randomUUID()}@example.test`,
      name: 'Invited Admin',
      role: 'admin',
      invitationToken: crypto.randomUUID(),
      invitationTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    getDb().run('UPDATE users SET is_active = 1 WHERE id = ?', [invited.id]);

    const res = await sendJson(usersApp(), cookieA, 'PATCH', `/users/${adminA.id}`, {
      isActive: false,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'LAST_ADMIN' });
  });

  it('refuses to delete the last active admin when the other admin is deactivated', async () => {
    const deactivated = await sendJson(usersApp(), cookieA, 'PATCH', `/users/${adminB.id}`, {
      isActive: false,
    });
    expect(deactivated.status).toBe(200);

    const removed = await usersService.delete(adminA.id);
    expect(!removed.success && removed.code).toBe('LAST_ADMIN');
    expect(await usersRepo.findById(adminA.id)).not.toBeNull();
  });

  it('still deletes a deactivated admin', async () => {
    getDb().run('UPDATE users SET is_active = 0 WHERE id = ?', [adminB.id]);
    const res = await sendJson(usersApp(), cookieA, 'DELETE', `/users/${adminB.id}`);
    expect(res.status).toBe(200);
    expect(await usersRepo.findById(adminB.id)).toBeNull();
  });
});

describe('users routes accept only validated fields', () => {
  it('ignores avatarUrl and other unknown keys on an admin update', async () => {
    getDb().run("UPDATE users SET role = 'viewer' WHERE role = 'admin'");
    const admin = await createUser({ role: 'admin' });
    const res = await sendJson(
      usersApp(),
      await sessionCookie(admin),
      'PATCH',
      `/users/${user.id}`,
      {
        name: 'Renamed User',
        avatarUrl: 'https://attacker.example/avatar.png',
        email: 'changed@example.test',
      }
    );
    expect(res.status).toBe(200);
    const stored = await usersRepo.findById(user.id);
    expect(stored?.name).toBe('Renamed User');
    expect(stored?.avatarUrl).toBeUndefined();
    expect(stored?.email).toBe(user.email);
  });

  it('ignores unknown keys on a profile update', async () => {
    const res = await sendJson(
      usersApp(),
      await sessionCookie(user),
      'PATCH',
      '/users/me/profile',
      {
        name: 'Profile Name',
        role: 'admin',
        avatarUrl: 'https://attacker.example/avatar.png',
      }
    );
    expect(res.status).toBe(200);
    const stored = await usersRepo.findById(user.id);
    expect(stored?.role).toBe('editor');
    expect(stored?.avatarUrl).toBeUndefined();
  });
});

describe('email change on the profile', () => {
  const newEmail = () => `changed-${crypto.randomUUID()}@example.test`;

  it('requires the current password', async () => {
    const res = await sendJson(
      usersApp(),
      await sessionCookie(user),
      'PATCH',
      '/users/me/profile',
      {
        email: newEmail(),
      }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'PASSWORD_REQUIRED',
      message: 'Enter your current password to change your email address',
    });
  });

  it('rejects a wrong current password with 400', async () => {
    const res = await sendJson(
      usersApp(),
      await sessionCookie(user),
      'PATCH',
      '/users/me/profile',
      {
        email: newEmail(),
        currentPassword: 'not-the-password',
      }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'INVALID_PASSWORD',
      message: 'Current password is incorrect',
    });
    expect((await usersRepo.findById(user.id))?.email).toBe(user.email);
  });

  it('changes the email with the correct password', async () => {
    const email = newEmail();
    const res = await sendJson(
      usersApp(),
      await sessionCookie(user),
      'PATCH',
      '/users/me/profile',
      {
        email: email.toUpperCase(),
        currentPassword: password,
      }
    );
    expect(res.status).toBe(200);
    expect((await usersRepo.findById(user.id))?.email).toBe(email);
  });

  it('changes only the name without a password', async () => {
    const res = await sendJson(
      usersApp(),
      await sessionCookie(user),
      'PATCH',
      '/users/me/profile',
      {
        name: 'Only Name',
        email: user.email.toUpperCase(),
      }
    );
    expect(res.status).toBe(200);
    expect((await usersRepo.findById(user.id))?.name).toBe('Only Name');
  });

  it('rejects an email change made with an API token', async () => {
    const { token } = await apiTokensRepo.create({
      userId: user.id,
      name: 'CI',
      scopes: ['read', 'write'],
    });
    const validated: ApiTokenValidationResult = { ...token, user };
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', user);
      c.set('apiToken', validated);
      return next();
    });
    app.route('/users', usersRoutes);

    const res = await sendJson(app, '', 'PATCH', '/users/me/profile', {
      email: newEmail(),
      currentPassword: password,
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'SESSION_REQUIRED' });
    expect((await usersRepo.findById(user.id))?.email).toBe(user.email);
  });
});

describe('API tokens on account recovery', () => {
  beforeEach(async () => {
    await apiTokensRepo.create({ userId: user.id, name: 'CI' });
    await apiTokensRepo.create({ userId: user.id, name: 'Deploy' });
  });

  it('revokes them on an admin password reset', async () => {
    expect((await usersService.resetPassword(user.id, newPassword)).success).toBe(true);
    expect(await activeTokenCount(user.id)).toBe(0);
  });

  it('revokes them when a temporary password is set', async () => {
    const result = await userAccessService.setTemporaryPassword(user.id, 'temporary-pass-3');
    expect(result.success).toBe(true);
    expect(await activeTokenCount(user.id)).toBe(0);
  });

  it('revokes them when a reset link is used', async () => {
    await passwordResetService.sendResetEmail(user.id);
    const token = tokenFrom(sentResetUrls[0]);
    expect((await passwordResetService.completeReset(token, newPassword)).success).toBe(true);
    expect(await activeTokenCount(user.id)).toBe(0);
  });

  it('revokes them when an admin resets two-factor authentication', async () => {
    expect((await twoFactorService.resetForUser(user.id)).success).toBe(true);
    expect(await activeTokenCount(user.id)).toBe(0);
  });

  it('keeps them when users change their own password', async () => {
    const result = await authService.changePassword(user.id, password, newPassword);
    expect(result.success).toBe(true);
    expect(await activeTokenCount(user.id)).toBe(2);
  });
});
