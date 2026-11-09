import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { authService } from '../../src/server/services/auth.service';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { settingsCacheService } from '../../src/server/services/settings-cache.service';
import { logger } from '../../src/server/utils/logger';
import { config } from '../../src/server/config';
import type { Session, User } from '../../src/shared/types';
import { twoFactorRepo } from '../../src/server/database/repositories/two-factor.repo';
import { DEFAULT_PASSWORD_POLICY } from '../../src/shared/password-policy';

const originalUsersRepo = { ...usersRepo };
const originalSessionsRepo = { ...sessionsRepo };
const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };
const originalTwoFactorRepo = { ...twoFactorRepo };

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
let deletedUserSessionsExceptId: { userId: string; exceptSessionId: string } | null = null;
let updatedActivitySessionId: string | null = null;
let createdSessionPayload: { userId: string; expiresAt: string } | null = null;
let deletedExpiredCount = 0;
let createdUserPayload: { email: string; mustChangePassword?: boolean } | null = null;
let mustChangePasswordUpdate: { id: string; value: boolean } | null = null;

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
  deletedUserSessionsExceptId = null;
  updatedActivitySessionId = null;
  createdSessionPayload = null;
  deletedExpiredCount = 0;
  createdUserPayload = null;
  mustChangePasswordUpdate = null;

  // Invalidate settings cache so mocked settingsRepo.getAll takes effect
  settingsCacheService.invalidate();

  usersRepo.findByEmailWithPassword = async () => userWithPassword;
  usersRepo.findById = async () => userById;
  usersRepo.updateLastLogin = async (id) => {
    updatedLastLoginId = id;
  };
  usersRepo.updatePassword = async (id) => {
    updatedPasswordId = id;
    return true;
  };
  usersRepo.count = async () => 1;
  usersRepo.setMustChangePassword = async (id, value) => {
    mustChangePasswordUpdate = { id, value };
  };
  usersRepo.create = async (payload) => {
    createdUserPayload = { email: payload.email, mustChangePassword: payload.mustChangePassword };
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
    return 1;
  };
  sessionsRepo.deleteByUserIdExcept = async (userId, exceptSessionId) => {
    deletedUserSessionsExceptId = { userId, exceptSessionId };
    return 0;
  };
  sessionsRepo.deleteExpired = async () => deletedExpiredCount;

  settingsRepo.getAll = async () =>
    ({
      sessionMaxAgeDays: 7,
      twoFactorPolicy: 'off',
      passwordPolicy: DEFAULT_PASSWORD_POLICY,
    }) as never;

  twoFactorRepo.getTotp = async () => null;
  twoFactorRepo.countPasskeys = async () => 0;

  logger.info = () => undefined;
  logger.warn = () => undefined;
  logger.error = () => undefined;
});

afterEach(() => {
  Object.assign(usersRepo, originalUsersRepo);
  Object.assign(sessionsRepo, originalSessionsRepo);
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
  Object.assign(twoFactorRepo, originalTwoFactorRepo);
});

describe('authService.login', () => {
  it('rejects when user is missing', async () => {
    userWithPassword = null;
    const result = await authService.login('missing@example.com', 'password');
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });

  it('rejects when user is inactive', async () => {
    userWithPassword = { ...baseUser, isActive: false, passwordHash: validHash };
    const result = await authService.login(baseUser.email, validPassword);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'ACCOUNT_DISABLED');
  });

  it('rejects invalid password', async () => {
    const result = await authService.login(baseUser.email, 'wrong-password');
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });

  it('creates a session on success', async () => {
    const result = await authService.login(baseUser.email, validPassword, '127.0.0.1', 'UA');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveProperty('user');
      if (!('user' in result.value)) throw new Error('Expected a completed login');
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
    expect(result).toHaveProperty('code', 'SESSION_NOT_FOUND');
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
    expect(result).toHaveProperty('code', 'INVALID_SESSION');
  });

  it('deletes session when user is missing', async () => {
    userById = null;
    const result = await authService.validateSession('sess_1');
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'USER_NOT_FOUND');
  });

  it('rejects inactive users', async () => {
    userById = { ...baseUser, isActive: false };
    const result = await authService.validateSession('sess_1');
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'ACCOUNT_DISABLED');
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
    expect(result).toHaveProperty('code', 'USER_NOT_FOUND');
  });

  it('rejects invalid current password', async () => {
    const result = await authService.changePassword(baseUser.id, 'bad', 'newpass123');
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'INVALID_PASSWORD');
  });

  it('rejects weak passwords', async () => {
    const result = await authService.changePassword(baseUser.id, validPassword, 'short');
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'WEAK_PASSWORD');
  });

  it('rejects a new password equal to the current one', async () => {
    const result = await authService.changePassword(baseUser.id, validPassword, validPassword);
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('code', 'PASSWORD_UNCHANGED');
    expect(updatedPasswordId).toBeNull();
  });

  it('updates password and clears sessions', async () => {
    const result = await authService.changePassword(baseUser.id, validPassword, 'newpass123');
    expect(result.success).toBe(true);
    expect(updatedPasswordId).toBe(baseUser.id);
    expect(deletedUserSessionsId).toBe(baseUser.id);
  });

  it('keeps current session when currentSessionId is provided', async () => {
    const result = await authService.changePassword(
      baseUser.id,
      validPassword,
      'newpass123',
      'sess_current'
    );
    expect(result.success).toBe(true);
    expect(updatedPasswordId).toBe(baseUser.id);
    expect(deletedUserSessionsId).toBeNull();
    expect(deletedUserSessionsExceptId).toEqual({
      userId: baseUser.id,
      exceptSessionId: 'sess_current',
    });
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

  it('creates the first admin user with a required password change', async () => {
    usersRepo.count = async () => 0;
    const result = await authService.bootstrapAdmin();
    expect(result.success).toBe(true);
    expect(createdUserPayload?.email).toBe(config.adminEmail);
    expect(createdUserPayload?.mustChangePassword).toBe(true);
  });

  it('requires a change when the existing admin still uses the initial password', async () => {
    usersRepo.count = async () => 1;
    const initialHash = await Bun.password.hash(config.adminPassword, {
      algorithm: 'bcrypt',
      cost: 4,
    });
    userWithPassword = { ...baseUser, email: config.adminEmail, passwordHash: initialHash };

    await authService.bootstrapAdmin();

    expect(mustChangePasswordUpdate).toEqual({ id: baseUser.id, value: true });
  });

  it('does not require a change for a new admin in development', async () => {
    const wasDev = config.isDev;
    Object.assign(config, { isDev: true });
    try {
      usersRepo.count = async () => 0;
      await authService.bootstrapAdmin();
      expect(createdUserPayload?.mustChangePassword).toBe(false);
    } finally {
      Object.assign(config, { isDev: wasDev });
    }
  });

  it('clears a pending change for the admin in development', async () => {
    const wasDev = config.isDev;
    Object.assign(config, { isDev: true });
    try {
      usersRepo.count = async () => 1;
      const initialHash = await Bun.password.hash(config.adminPassword, {
        algorithm: 'bcrypt',
        cost: 4,
      });
      userWithPassword = {
        ...baseUser,
        email: config.adminEmail,
        mustChangePassword: true,
        passwordHash: initialHash,
      };

      await authService.bootstrapAdmin();

      expect(mustChangePasswordUpdate).toEqual({ id: baseUser.id, value: false });
    } finally {
      Object.assign(config, { isDev: wasDev });
    }
  });

  it('leaves the existing admin alone after the initial password was changed', async () => {
    usersRepo.count = async () => 1;
    userWithPassword = { ...baseUser, email: config.adminEmail, passwordHash: validHash };

    await authService.bootstrapAdmin();

    expect(mustChangePasswordUpdate).toBeNull();
  });
});

describe('authService.cleanupExpiredSessions', () => {
  it('returns deleted session count', async () => {
    deletedExpiredCount = 3;
    const count = await authService.cleanupExpiredSessions();
    expect(count).toBe(3);
  });
});
