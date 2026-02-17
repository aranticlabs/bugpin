import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { usersService } from '../../../src/server/services/users.service';
import { usersRepo } from '../../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../../src/server/database/repositories/sessions.repo';
import type { User } from '../../../src/shared/types';

const baseUser: User = {
  id: 'usr_1',
  email: 'user@example.com',
  name: 'User One',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalUsersRepo = { ...usersRepo };
const originalSessionsRepo = { ...sessionsRepo };
const originalHash = Bun.password.hash;

let lastCreateInput: unknown;
let lastUpdateInput: unknown;
let deletedUserId: string | null;
let deletedSessionsFor: string | null;
let emailExistsValue = false;
let userById: User | null = baseUser;
let userByEmail: User | null = baseUser;
let usersByRole: User[] = [baseUser];

beforeEach(() => {
  lastCreateInput = undefined;
  lastUpdateInput = undefined;
  deletedUserId = null;
  deletedSessionsFor = null;
  emailExistsValue = false;
  userById = baseUser;
  userByEmail = baseUser;
  usersByRole = [baseUser];

  usersRepo.emailExists = async () => emailExistsValue;
  usersRepo.findById = async () => userById;
  usersRepo.findByEmail = async () => userByEmail;
  usersRepo.findAll = async () => [baseUser];
  usersRepo.findByRole = async () => usersByRole;
  usersRepo.create = async (input) => {
    lastCreateInput = input;
    return { ...baseUser, ...input, id: 'usr_new' } as User;
  };
  usersRepo.update = async (id, updates) => {
    lastUpdateInput = updates;
    return userById ? { ...userById, ...updates, id } : null;
  };
  usersRepo.updatePassword = async () => true;
  usersRepo.updateAvatarUrl = async (id, avatarUrl) => {
    if (!userById) return null;
    return { ...userById, id, avatarUrl: avatarUrl ?? undefined };
  };
  usersRepo.delete = async (id) => {
    deletedUserId = id;
    return true;
  };
  usersRepo.count = async () => 3;

  sessionsRepo.deleteByUserId = async (id) => {
    deletedSessionsFor = id;
    return 1;
  };

  Bun.password.hash = async () => 'hash';
});

afterEach(() => {
  Object.assign(usersRepo, originalUsersRepo);
  Object.assign(sessionsRepo, originalSessionsRepo);
  Bun.password.hash = originalHash;
});

describe('usersService.create', () => {
  it('rejects invalid email', async () => {
    const result = await usersService.create({
      email: 'bad',
      password: 'password123',
      name: 'User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects existing email', async () => {
    emailExistsValue = true;
    const result = await usersService.create({
      email: 'user@example.com',
      password: 'password123',
      name: 'User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects weak password', async () => {
    const result = await usersService.create({
      email: 'user@example.com',
      password: 'short',
      name: 'User',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid name', async () => {
    const result = await usersService.create({
      email: 'user@example.com',
      password: 'password123',
      name: ' ',
    });
    expect(result.success).toBe(false);
  });

  it('creates user with trimmed fields', async () => {
    const result = await usersService.create({
      email: 'USER@Example.com',
      password: 'password123',
      name: ' User One ',
    });
    expect(result.success).toBe(true);
    expect(lastCreateInput).toMatchObject({
      email: 'user@example.com',
      name: 'User One',
      role: 'viewer',
    });
  });
});

describe('usersService.update', () => {
  it('rejects when user not found', async () => {
    userById = null;
    const result = await usersService.update('usr_missing', { name: 'New' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid name', async () => {
    const result = await usersService.update('usr_1', { name: ' ' });
    expect(result.success).toBe(false);
  });

  it('prevents demoting the last admin', async () => {
    usersByRole = [{ ...baseUser, role: 'admin' }];
    const result = await usersService.update('usr_1', { role: 'viewer' });
    expect(result.success).toBe(false);
  });

  it('prevents deactivating the last active admin', async () => {
    usersByRole = [{ ...baseUser, role: 'admin', isActive: true }];
    const result = await usersService.update('usr_1', { isActive: false });
    expect(result.success).toBe(false);
  });

  it('updates user fields', async () => {
    userById = { ...baseUser, role: 'viewer' };
    const result = await usersService.update('usr_1', {
      name: ' New Name ',
      role: 'editor',
      isActive: false,
      avatarUrl: 'https://cdn.test/avatar.png',
    });
    expect(result.success).toBe(true);
    expect(lastUpdateInput).toMatchObject({
      name: 'New Name',
      role: 'editor',
      isActive: false,
      avatarUrl: 'https://cdn.test/avatar.png',
    });
  });
});

describe('usersService.delete', () => {
  it('rejects when user not found', async () => {
    userById = null;
    const result = await usersService.delete('usr_missing');
    expect(result.success).toBe(false);
  });

  it('prevents self-deletion', async () => {
    const result = await usersService.delete('usr_1', 'usr_1');
    expect(result.success).toBe(false);
  });

  it('prevents deleting the last admin', async () => {
    usersByRole = [{ ...baseUser, role: 'admin' }];
    const result = await usersService.delete('usr_1');
    expect(result.success).toBe(false);
  });

  it('deletes user and sessions', async () => {
    userById = { ...baseUser, role: 'viewer' };
    const result = await usersService.delete('usr_1', 'usr_2');
    expect(result.success).toBe(true);
    expect(deletedSessionsFor).toBe('usr_1');
    expect(deletedUserId).toBe('usr_1');
  });
});

describe('usersService.resetPassword', () => {
  it('rejects when user not found', async () => {
    userById = null;
    const result = await usersService.resetPassword('usr_missing', 'password123');
    expect(result.success).toBe(false);
  });

  it('rejects weak password', async () => {
    const result = await usersService.resetPassword('usr_1', 'short');
    expect(result.success).toBe(false);
  });

  it('updates password and clears sessions', async () => {
    const result = await usersService.resetPassword('usr_1', 'password123');
    expect(result.success).toBe(true);
    expect(deletedSessionsFor).toBe('usr_1');
  });
});

describe('usersService.profile and avatar', () => {
  it('returns existing user when no updates', async () => {
    const result = await usersService.updateProfile('usr_1', {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(baseUser);
    }
  });

  it('rejects invalid profile name', async () => {
    const result = await usersService.updateProfile('usr_1', { name: ' ' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid profile email', async () => {
    const result = await usersService.updateProfile('usr_1', { email: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate profile email', async () => {
    emailExistsValue = true;
    const result = await usersService.updateProfile('usr_1', { email: 'other@example.com' });
    expect(result.success).toBe(false);
  });

  it('updates profile fields', async () => {
    const result = await usersService.updateProfile('usr_1', {
      name: ' New Name ',
      email: 'new@example.com',
    });
    expect(result.success).toBe(true);
    expect(lastUpdateInput).toMatchObject({
      name: 'New Name',
      email: 'new@example.com',
    });
  });

  it('updates avatar url', async () => {
    const result = await usersService.updateAvatar('usr_1', 'https://cdn.test/avatar.png');
    expect(result.success).toBe(true);
  });

  it('deletes avatar url', async () => {
    const result = await usersService.deleteAvatar('usr_1');
    expect(result.success).toBe(true);
  });
});

describe('usersService lookups', () => {
  it('returns user by id', async () => {
    const result = await usersService.getById('usr_1');
    expect(result.success).toBe(true);
  });

  it('returns user by email', async () => {
    const result = await usersService.getByEmail('user@example.com');
    expect(result.success).toBe(true);
  });

  it('lists users', async () => {
    const result = await usersService.list();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.length).toBe(1);
    }
  });

  it('counts users', async () => {
    const count = await usersService.count();
    expect(count).toBe(3);
  });
});
