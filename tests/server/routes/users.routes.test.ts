import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { Hono } from '../../../src/server/node_modules/hono/dist/index.js';
import { usersRoutes } from '../../../src/server/routes/api/users';
import { usersService } from '../../../src/server/services/users.service';
import { authService } from '../../../src/server/services/auth.service';
import { Result } from '../../../src/server/utils/result';
import { config } from '../../../src/server/config';
import type { Session, User } from '../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'user@example.com',
  name: 'User',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseSession: Session = {
  id: 'sess_1',
  userId: 'usr_1',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const originalAuthService = { ...authService };
const originalUsersService = { ...usersService };
const originalConfig = { ...config };
let tempDir = '';

let userRole: User['role'] = 'admin';
let userResult: User | null = baseUser;
let listResult: User[] = [baseUser];
let createResult: Result<User> = Result.ok(baseUser);
let updateResult: Result<User> = Result.ok(baseUser);
let deleteResult: Result<void> = Result.ok(undefined);
let updateProfileResult: Result<User> = Result.ok(baseUser);

beforeEach(() => {
  userRole = 'admin';
  userResult = baseUser;
  listResult = [baseUser];
  createResult = Result.ok(baseUser);
  updateResult = Result.ok(baseUser);
  deleteResult = Result.ok(undefined);
  updateProfileResult = Result.ok(baseUser);

  authService.validateSession = async () =>
    Result.ok({
      user: { ...baseUser, role: userRole },
      session: baseSession,
    });

  usersService.list = async () => Result.ok(listResult);
  usersService.getById = async () => {
    if (!userResult) {
      return Result.fail('Not found', 'NOT_FOUND');
    }
    return Result.ok(userResult);
  };
  usersService.create = async () => createResult;
  usersService.update = async () => updateResult;
  usersService.delete = async () => deleteResult;
  usersService.updateProfile = async () => updateProfileResult;
  usersService.updateAvatar = async () => Result.ok(baseUser);
  usersService.deleteAvatar = async () => Result.ok(baseUser);

  const userDir = path.join(config.avatarsDir, baseUser.id);
  if (fs.existsSync(userDir)) {
    fs.rmSync(userDir, { recursive: true, force: true });
  }
});

afterEach(() => {
  Object.assign(authService, originalAuthService);
  Object.assign(usersService, originalUsersService);
});

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), 'bugpin-users-routes-'));
  Object.assign(config, {
    dataDir: tempDir,
    dbPath: path.join(tempDir, 'bugpin.db'),
    uploadsDir: path.join(tempDir, 'uploads'),
    screenshotsDir: path.join(tempDir, 'uploads', 'screenshots'),
    attachmentsDir: path.join(tempDir, 'uploads', 'attachments'),
    brandingDir: path.join(tempDir, 'uploads', 'branding'),
    avatarsDir: path.join(tempDir, 'uploads', 'avatars'),
  });
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  Object.assign(config, originalConfig);
});

function createApp() {
  const app = new Hono();
  app.route('/users', usersRoutes);
  return app;
}

describe('users routes', () => {
  it('lists users for admin', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when list fails', async () => {
    usersService.list = async () => Result.fail('List failed', 'LIST_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/users', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns user by id for admin', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_1', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when user missing', async () => {
    userResult = null;
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_missing', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when user lookup fails', async () => {
    usersService.getById = async () => Result.fail('Bad query', 'DB_ERROR');
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_bad', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('creates a user', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'new@example.com', password: 'password123', name: 'New' }),
    });
    expect(res.status).toBe(201);
  });

  it('returns 409 when create conflicts', async () => {
    createResult = Result.fail('Email exists', 'EMAIL_EXISTS');
    const app = createApp();
    const res = await app.request('http://localhost/users', {
      method: 'POST',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123', name: 'User' }),
    });
    expect(res.status).toBe(409);
  });

  it('updates a user', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_1', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 when update fails', async () => {
    updateResult = Result.fail('Not found', 'NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_missing', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when update fails for other reasons', async () => {
    updateResult = Result.fail('Bad update', 'UPDATE_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_bad', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New' }),
    });
    expect(res.status).toBe(400);
  });

  it('deletes another user', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_2', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('blocks deleting own account', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_1', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when delete fails', async () => {
    deleteResult = Result.fail('Not found', 'NOT_FOUND');
    const app = createApp();
    const res = await app.request('http://localhost/users/usr_missing', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when profile email exists', async () => {
    updateProfileResult = Result.fail('Email exists', 'EMAIL_EXISTS');
    const app = createApp();
    const res = await app.request('http://localhost/users/me/profile', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    expect(res.status).toBe(409);
  });

  it('updates profile for current user', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/me/profile', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Updated' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when profile update fails', async () => {
    updateProfileResult = Result.fail('Invalid', 'INVALID_INPUT');
    const app = createApp();
    const res = await app.request('http://localhost/users/me/profile', {
      method: 'PATCH',
      headers: {
        cookie: 'session=sess_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('deletes avatar for current user', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when avatar delete fails', async () => {
    usersService.deleteAvatar = async () => Result.fail('Delete failed', 'DELETE_FAILED');
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'DELETE',
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects avatar upload without file', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });

  it('rejects avatar upload with invalid type', async () => {
    const formData = new FormData();
    formData.append('file', new File(['nope'], 'nope.txt', { type: 'text/plain' }));
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: formData,
    });
    expect(res.status).toBe(400);
  });

  it('rejects avatar upload that is too large', async () => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }),
    );
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: formData,
    });
    expect(res.status).toBe(400);
  });

  it('uploads avatar and updates user', async () => {
    const formData = new FormData();
    formData.append('file', new File(['avatar'], 'avatar.png', { type: 'image/png' }));
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: formData,
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 when avatar update fails', async () => {
    usersService.updateAvatar = async () => Result.fail('Update failed', 'UPDATE_FAILED');
    const formData = new FormData();
    formData.append('file', new File(['avatar'], 'avatar.png', { type: 'image/png' }));
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar', {
      method: 'POST',
      headers: { cookie: 'session=sess_1' },
      body: formData,
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when avatar file is missing', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar/missing.png', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(404);
  });

  it('serves avatar file when present', async () => {
    const userDir = path.join(config.avatarsDir, baseUser.id);
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'avatar.png'), 'data');

    const app = createApp();
    const res = await app.request('http://localhost/users/me/avatar/avatar.png', {
      headers: { cookie: 'session=sess_1' },
    });
    expect(res.status).toBe(200);
  });
});
