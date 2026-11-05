import { getEEProjectLicenseService } from '../../src/server/utils/ee';
const projectLicenseService = getEEProjectLicenseService()!;
import { Result } from '../../src/server/utils/result';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { usersService } from '../../src/server/services/users.service';
import { usersRepo } from '../../src/server/database/repositories/users.repo';
import { sessionsRepo } from '../../src/server/database/repositories/sessions.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import type { Project, User } from '../../src/shared/types';
import { passwordPolicyService } from '../../src/server/services/password-policy.service';
import { twoFactorRepo } from '../../src/server/database/repositories/two-factor.repo';
import { DEFAULT_PASSWORD_POLICY } from '../../src/shared/password-policy';

const originalPasswordPolicyService = { ...passwordPolicyService };
const originalTwoFactorRepo = { ...twoFactorRepo };

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
const originalProjectsRepo = { ...projectsRepo };
const originalHash = Bun.password.hash;
const originalCheckAccess = projectLicenseService.checkAccess;

let lastCreateInput: unknown;
let lastUpdateInput: unknown;
let deletedUserId: string | null;
let deletedSessionsFor: string | null;
let emailExistsValue = false;
let userById: User | null = baseUser;
let userByEmail: User | null = baseUser;
let usersByRole: User[] = [baseUser];
let projects: Project[] = [];

beforeEach(() => {
  passwordPolicyService.getPolicy = async () => DEFAULT_PASSWORD_POLICY;
  twoFactorRepo.listUserIdsWithTwoFactor = async () => new Set(['usr_1']);
  projectLicenseService.checkAccess = () => Result.ok(undefined);
  lastCreateInput = undefined;
  lastUpdateInput = undefined;
  deletedUserId = null;
  deletedSessionsFor = null;
  emailExistsValue = false;
  userById = baseUser;
  userByEmail = baseUser;
  usersByRole = [baseUser];
  projects = [];

  usersRepo.emailExists = async () => emailExistsValue;
  usersRepo.findById = async () => userById;
  usersRepo.findByEmail = async () => userByEmail;
  usersRepo.findAll = async () => [baseUser];
  usersRepo.findByRole = async () => usersByRole;
  projectsRepo.findAll = async () => projects;
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
  Object.assign(passwordPolicyService, originalPasswordPolicyService);
  Object.assign(twoFactorRepo, originalTwoFactorRepo);
  Object.assign(usersRepo, originalUsersRepo);
  Object.assign(sessionsRepo, originalSessionsRepo);
  Object.assign(projectsRepo, originalProjectsRepo);
  Bun.password.hash = originalHash;
  projectLicenseService.checkAccess = originalCheckAccess;
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

  it('updates project default assignments for a user', async () => {
    userById = { ...baseUser, role: 'viewer' };
    projects = [
      {
        id: 'prj_1',
        name: 'Alpha',
        apiKey: 'key-1',
        settings: { defaultAssigneeUserId: 'usr_1' },
        reportsCount: 0,
        isActive: true,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'prj_2',
        name: 'Beta',
        apiKey: 'key-2',
        settings: {},
        reportsCount: 0,
        isActive: true,
        position: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const projectUpdates: Array<{ id: string; settings: Project['settings'] }> = [];
    projectsRepo.update = async (id, updates) => {
      projectUpdates.push({ id, settings: updates.settings ?? {} });
      return projects.find((project) => project.id === id) ?? null;
    };

    const result = await usersService.update('usr_1', {
      defaultProjectIds: ['prj_2'],
    });

    expect(result.success).toBe(true);
    expect(projectUpdates).toEqual([
      { id: 'prj_1', settings: {} },
      { id: 'prj_2', settings: { defaultAssigneeUserId: 'usr_1' } },
    ]);
  });

  it('rejects non-assignable users for new default assignments', async () => {
    userById = {
      ...baseUser,
      isActive: false,
      invitationAcceptedAt: undefined,
    };
    projects = [
      {
        id: 'prj_1',
        name: 'Alpha',
        apiKey: 'key-1',
        settings: {},
        reportsCount: 0,
        isActive: true,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const result = await usersService.update('usr_1', {
      defaultProjectIds: ['prj_1'],
    });

    expect(result.success).toBe(false);
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
    projects = [
      {
        id: 'prj_1',
        name: 'Alpha',
        apiKey: 'key-1',
        settings: { defaultAssigneeUserId: 'usr_1' },
        reportsCount: 0,
        isActive: true,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const result = await usersService.getById('usr_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.defaultProjects).toEqual([{ id: 'prj_1', name: 'Alpha' }]);
    }
  });

  it('returns user by email', async () => {
    const result = await usersService.getByEmail('user@example.com');
    expect(result.success).toBe(true);
  });

  it('lists users', async () => {
    projects = [
      {
        id: 'prj_1',
        name: 'Alpha',
        apiKey: 'key-1',
        settings: { defaultAssigneeUserId: 'usr_1' },
        reportsCount: 0,
        isActive: true,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const result = await usersService.list();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.length).toBe(1);
      expect(result.value[0].defaultProjects).toEqual([{ id: 'prj_1', name: 'Alpha' }]);
      expect(result.value[0].twoFactorEnabled).toBe(true);
    }
  });

  it('counts users', async () => {
    const count = await usersService.count();
    expect(count).toBe(3);
  });
});

it('rejects changing or clearing defaults on a locked project before any user or project writes', async () => {
  projectLicenseService.checkAccess = () => Result.fail('Locked', 'PROJECT_NOT_LICENSED');
  let writes = 0;
  projectsRepo.update = async () => {
    writes++;
    return null;
  };
  for (const assigned of [false, true]) {
    projects = [
      { id: 'locked', settings: assigned ? { defaultAssigneeUserId: 'usr_1' } : {} },
    ] as Project[];
    const result = await usersService.update('usr_1', {
      name: 'New name',
      defaultProjectIds: assigned ? [] : ['locked'],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('PROJECT_NOT_LICENSED');
    expect(lastUpdateInput).toBeUndefined();
    expect(writes).toBe(0);
  }
  expect((await usersService.update('usr_1', { name: 'New name' })).success).toBe(true);
});
