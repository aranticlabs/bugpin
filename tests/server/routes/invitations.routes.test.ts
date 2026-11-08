import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { Hono } from '../../../src/server/node_modules/hono';
import { config } from '../../../src/server/config';
import {
  closeDatabase,
  initDatabase,
  initSchema,
  runMigrations,
} from '../../../src/server/database/database';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import { invitationsRoutes } from '../../../src/server/routes/api/invitations';
import { passwordPolicyService } from '../../../src/server/services/password-policy.service';
import { authService } from '../../../src/server/services/auth.service';
import { logger } from '../../../src/server/utils/logger';
import { DEFAULT_PASSWORD_POLICY } from '../../../src/shared/password-policy';
import type { User } from '../../../src/shared/types';

const originalConfig = { ...config };
const originalLogger = { ...logger };
const originalPasswordPolicyService = { ...passwordPolicyService };
const validPassword = 'invited-password-1';
let tempDir = '';

async function invite(expiresInMs = 60 * 60 * 1000): Promise<{ user: User; token: string }> {
  const token = crypto.randomUUID().replaceAll('-', '');
  const user = await usersRepo.createInvited({
    email: `invited-${crypto.randomUUID()}@example.test`,
    name: 'Invited User',
    role: 'editor',
    invitationToken: token,
    invitationTokenExpiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  });
  return { user, token };
}

function createApp(): Hono {
  const app = new Hono();
  app.route('/invitations', invitationsRoutes);
  return app;
}

function validate(token: string): Promise<Response> {
  return Promise.resolve(createApp().request(`http://localhost/invitations/validate/${token}`));
}

function accept(body: Record<string, unknown>): Promise<Response> {
  return Promise.resolve(
    createApp().request('http://localhost/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  logger.info = () => undefined;
  logger.warn = () => undefined;
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-invitations-routes-'));
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

beforeEach(() => {
  passwordPolicyService.getPolicy = async () => ({
    ...DEFAULT_PASSWORD_POLICY,
    requireNumber: true,
  });
});

afterEach(() => {
  Object.assign(passwordPolicyService, originalPasswordPolicyService);
});

describe('GET /invitations/validate/:token', () => {
  it('returns the invited email and name for a valid token', async () => {
    const { user, token } = await invite();
    const res = await validate(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      invitation: { email: user.email, name: 'Invited User' },
    });
  });

  it('returns 410 for an expired token', async () => {
    const { token } = await invite(-60_000);
    const res = await validate(token);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: 'TOKEN_EXPIRED' });
  });

  it('returns 404 for a token that was already used', async () => {
    const { token } = await invite();
    expect((await accept({ token, name: 'Invited User', password: validPassword })).status).toBe(
      200
    );
    const res = await validate(token);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false });
  });

  it('returns 404 for an unknown token', async () => {
    const res = await validate('unknown-token');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });
});

describe('POST /invitations/accept', () => {
  it('enforces the password policy and keeps the invitation open', async () => {
    const { user, token } = await invite();
    const res = await accept({ token, name: 'Invited User', password: 'no-digits-here' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'WEAK_PASSWORD' });

    const stored = await usersRepo.findById(user.id);
    expect(stored?.isActive).toBe(false);
    expect(stored?.invitationAcceptedAt).toBeUndefined();
    expect((await validate(token)).status).toBe(200);
  });

  it('consumes the token, activates the account and starts a session', async () => {
    const { user, token } = await invite();
    const res = await accept({ token, name: ' Accepted Name ', password: validPassword });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session=');

    const stored = await usersRepo.findById(user.id);
    expect(stored?.isActive).toBe(true);
    expect(stored?.name).toBe('Accepted Name');
    expect(stored?.invitationAcceptedAt).toBeDefined();
    expect(await usersRepo.findByInvitationToken(token)).toBeNull();
    expect(await sessionsRepo.findByUserId(user.id)).toHaveLength(1);
    expect((await authService.login(user.email, validPassword)).success).toBe(true);
  });

  it('cannot reuse a consumed token', async () => {
    const { user, token } = await invite();
    expect((await accept({ token, name: 'Invited User', password: validPassword })).status).toBe(
      200
    );

    const res = await accept({ token, name: 'Someone Else', password: 'another-password-2' });
    expect(res.status).toBe(404);
    expect((await usersRepo.findById(user.id))?.name).toBe('Invited User');
    expect((await authService.login(user.email, 'another-password-2')).success).toBe(false);
  });

  it('rejects an expired token', async () => {
    const { token } = await invite(-60_000);
    const res = await accept({ token, name: 'Invited User', password: validPassword });
    expect(res.status).toBe(410);
  });

  it('ignores unknown keys in the body', async () => {
    const { user, token } = await invite();
    const res = await accept({
      token,
      name: 'Invited User',
      password: validPassword,
      role: 'admin',
    });
    expect(res.status).toBe(200);
    expect((await usersRepo.findById(user.id))?.role).toBe('editor');
  });
});
