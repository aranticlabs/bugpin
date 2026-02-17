import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { authService } from '../../src/server/services/auth.service';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { logger } from '../../src/server/utils/logger';
import { config } from '../../src/server/config';
import type { Session, User } from '../../src/shared/types';

const originalUsersRepo = { ...usersRepo };
const originalSessionsRepo = { ...sessionsRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };

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
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  lastActivityAt: new Date().toISOString(),
};

const validPassword = 'password1234';
let validHash = '';

let userWithPassword: (User & { passwordHash: string }) | null = null;
let sessionById: Session | null = baseSession;
let userById: User | null = baseUser;
let deleteSessionResult = true;
let updatedLastLoginId: string | null = null;
let updatedPasswordId: string | null = null;
let deletedUserSessionsId: string | null = null;
let updatedActivitySessionId: string | null = null;
let createdSessionPayload: { userId: string; expiresAt: string } | null = null;
let deletedExpiredCount = 0;
let createdUserPayload: { email: string } | null = null;

beforeAll(async () => {
  validHash = await Bun.password.hash(validPassword, { algorithm: 'bcrypt', cost: 4 });
});

beforeEach(() => {
  userWithPassword = { ...baseUser, passwordHash: validHash };
  sessionById = baseSession;
  userById = baseUser;
  deleteSessionResult = true;
  updatedLastLoginId = null;
  updatedPasswordId = null;
  deletedUserSessionsId = null;
  updatedActivitySessionId = null;
  createdSessionPayload = null;
  deletedExpiredCount = 0;
  createdUserPayload = null;

  // Invalidate settings cache so mocked settingsRepo.getAll takes effect
  settingsCacheService.invalidate();

  usersRepo.findByEmailWithPassword = async () => userWithPassword;
  usersRepo.findById = async () => userById;
  usersRepo.updateLastLogin = async (id) => {
    updatedLastLoginId = id;
  };
  usersRepo.updatePassword = async (id) => {
    updatedPasswordId = id;
  };
  usersRepo.count = async () => 1;
  usersRepo.create = async (payload) => {
    createdUserPayload = { email: payload.email };
    return { ...baseUser, id: 'usr_admin', email: payload.email };
  };

  sessionsRepo.create = async (payload) => {
    createdSessionPayload = { userId: payload.userId, expiresAt: payload.expiresAt };
    return { ...baseSession, userId: payload.userId, expiresAt: payload.expiresAt };
  };
  sessionsRepo.delete = async () => deleteSessionResult;
  sessionsRepo.findValidById = async () => sessionById;
  sessionsRepo.updateActivity = async (id) => {
    updatedActivitySessionId = id;
  };
  sessionsRepo.deleteByUserId = async (id) => {
    deletedUserSessionsId = id;
  };
  sessionsRepo.deleteExpired = async () => deletedExpiredCount;

  settingsRepo.getAll = async () =>
    ({
      sessionMaxAgeDays: 7,
    }) as never;

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
});

afterEach(() => {
  Object.assign(usersRepo, originalUsersRepo);
  Object.assign(sessionsRepo, originalSessionsRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
});

describe('authService.login', () => {
  it('rejects when user is missing', async () => {
    userWithPassword = null;
    const result = await authService.login('missing@example.com', 'password');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects when user is inactive', async () => {
    userWithPassword = { ...baseUser, isActive: false, passwordHash: validHash };
    const result = await authService.login(baseUser.email, validPassword);
    expect(result.success).toBe(false);
    expect(result.code).toBe('ACCOUNT_DISABLED');
  });

  it('rejects invalid password', async () => {
    const result = await authService.login(baseUser.email, 'wrong-password');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_CREDENTIALS');
  });

  it('creates a session on success', async () => {
    const result = await authService.login(baseUser.email, validPassword, '127.0.0.1', 'UA');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.user).toMatchObject({ id: baseUser.id, email: baseUser.email });
      expect(result.value.user).not.toHaveProperty('passwordHash');
      expect(result.value.session.id).toBe(baseSession.id);
    }
    expect(updatedLastLoginId).toBe(baseUser.id);
    expect(createdSessionPayload?.userId).toBe(baseUser.id);
    expect(createdSessionPayload?.expiresAt).toBeTruthy();
  });
});

describe('authService.logout', () => {
  it('rejects when session is missing', async () => {
    deleteSessionResult = false;
    const result = await authService.logout('sess_missing');
    expect(result.success).toBe(false);
    expect(result.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns ok when session is deleted', async () => {
    const result = await authService.logout('sess_1');
    expect(result.success).toBe(true);
  });
});

describe('authService.validateSession', () => {
  it('rejects invalid sessions', async () => {
    sessionById = null;
    const result = await authService.validateSession('sess_missing');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_SESSION');
  });

  it('deletes session when user is missing', async () => {
    userById = null;
    const result = await authService.validateSession('sess_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('USER_NOT_FOUND');
  });

  it('rejects inactive users', async () => {
    userById = { ...baseUser, isActive: false };
    const result = await authService.validateSession('sess_1');
    expect(result.success).toBe(false);
    expect(result.code).toBe('ACCOUNT_DISABLED');
  });

  it('updates session activity on success', async () => {
    const result = await authService.validateSession('sess_1');
    expect(result.success).toBe(true);
    expect(updatedActivitySessionId).toBe('sess_1');
  });
});

describe('authService.changePassword', () => {
  it('rejects when user is missing', async () => {
    userById = null;
    const result = await authService.changePassword('usr_missing', 'old', 'newpass123');
    expect(result.success).toBe(false);
    expect(result.code).toBe('USER_NOT_FOUND');
  });

  it('rejects invalid current password', async () => {
    const result = await authService.changePassword(baseUser.id, 'bad', 'newpass123');
    expect(result.success).toBe(false);
    expect(result.code).toBe('INVALID_PASSWORD');
  });

  it('rejects weak passwords', async () => {
    const result = await authService.changePassword(baseUser.id, validPassword, 'short');
    expect(result.success).toBe(false);
    expect(result.code).toBe('WEAK_PASSWORD');
  });

  it('updates password and clears sessions', async () => {
    const result = await authService.changePassword(baseUser.id, validPassword, 'newpass123');
    expect(result.success).toBe(true);
    expect(updatedPasswordId).toBe(baseUser.id);
    expect(deletedUserSessionsId).toBe(baseUser.id);
  });
});

describe('authService.bootstrapAdmin', () => {
  it('skips when users already exist', async () => {
    usersRepo.count = async () => 5;
    const result = await authService.bootstrapAdmin();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeNull();
    }
  });

  it('creates the first admin user', async () => {
    usersRepo.count = async () => 0;
    const result = await authService.bootstrapAdmin();
    expect(result.success).toBe(true);
    expect(createdUserPayload?.email).toBe(config.adminEmail);
  });
});

describe('authService.cleanupExpiredSessions', () => {
  it('returns deleted session count', async () => {
    deletedExpiredCount = 3;
    const count = await authService.cleanupExpiredSessions();
    expect(count).toBe(3);
  });
});
