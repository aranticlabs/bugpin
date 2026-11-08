import { checkProjectLicense } from '../utils/project-license.js';
import { usersRepo, type CreateUserData } from '../database/repositories/users.repo.js';
import { sessionsRepo } from '../database/repositories/sessions.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { isValidEmail } from '../utils/validators.js';
import type { DefaultProjectReference, User, UserRole } from '@shared/types';
import { passwordPolicyService } from './password-policy.service.js';
import { twoFactorRepo } from '../database/repositories/two-factor.repo.js';
import { apiTokensRepo } from '../database/repositories/api-tokens.repo.js';
import { gamificationService } from './gamification.service.js';

// Types

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  defaultProjectIds?: string[];
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  currentPassword?: string;
}

export interface UpdateProfileOptions {
  viaApiToken?: boolean;
}

// Password Hashing

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: BCRYPT_ROUNDS,
  });
}

async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const passwordHash = await usersRepo.findPasswordHash(userId);
  if (!passwordHash) return false;
  return await Bun.password.verify(password, passwordHash);
}

async function ensureAnotherSignInAdmin(id: string, message: string): Promise<Result<void>> {
  const others = await usersRepo.countSignInAdminsExcept(id);
  return others > 0 ? Result.ok(undefined) : Result.fail(message, 'LAST_ADMIN');
}

/**
 * Applies the workspace gamification default to a freshly created user. On failure the user
 * is removed again so a half-configured account is never left behind.
 */
export async function applyNewUserDefaultOrRemove(userId: string): Promise<Result<void>> {
  const applied = await Result.tryAsync(() => gamificationService.applyNewUserDefault(userId));
  const outcome = applied.success ? applied.value : applied;
  if (outcome.success) return outcome;

  await usersRepo.delete(userId);
  logger.error('Failed to apply the gamification default to a new user', outcome.error, {
    userId,
  });
  return Result.fail('Failed to create user', 'CREATE_FAILED');
}

async function attachDefaultProjects(user: User): Promise<User> {
  const projects = await projectsRepo.findAll();
  const defaultProjects: DefaultProjectReference[] = projects
    .filter((project) => project.settings?.defaultAssigneeUserId === user.id)
    .map((project) => ({
      id: project.id,
      name: project.name,
    }));

  return {
    ...user,
    defaultProjects,
  };
}

async function attachDefaultProjectsToMany(users: User[]): Promise<User[]> {
  const projects = await projectsRepo.findAll();
  const defaultsByUserId = new Map<string, DefaultProjectReference[]>();

  for (const project of projects) {
    const userId = project.settings?.defaultAssigneeUserId;
    if (!userId) continue;

    const existing = defaultsByUserId.get(userId) ?? [];
    existing.push({ id: project.id, name: project.name });
    defaultsByUserId.set(userId, existing);
  }

  return users.map((user) => ({
    ...user,
    defaultProjects: defaultsByUserId.get(user.id) ?? [],
  }));
}

// Service

export const usersService = {
  /**
   * Whether a user can be assigned to a report
   */
  isAssignable(user: User): boolean {
    return user.isActive && (!user.invitationSentAt || !!user.invitationAcceptedAt);
  },

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<Result<User>> {
    // Validate email
    if (!input.email || !isValidEmail(input.email)) {
      return Result.fail('Invalid email address', 'INVALID_EMAIL');
    }

    // Check if email already exists
    const exists = await usersRepo.emailExists(input.email);
    if (exists) {
      return Result.fail('Email address already in use', 'EMAIL_EXISTS');
    }

    // Validate password
    const policyCheck = await passwordPolicyService.validate(input.password ?? '');
    if (!policyCheck.success) return policyCheck;

    // Validate name
    if (!input.name || input.name.trim().length < 2) {
      return Result.fail('Name must be at least 2 characters', 'INVALID_NAME');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    const userData: CreateUserData = {
      email: input.email.toLowerCase().trim(),
      passwordHash,
      name: input.name.trim(),
      role: input.role ?? 'viewer',
    };

    const user = await usersRepo.create(userData);
    const defaulted = await applyNewUserDefaultOrRemove(user.id);
    if (!defaulted.success) return defaulted;

    logger.info('User created', { userId: user.id, email: user.email, role: user.role });
    return Result.ok(user);
  },

  /**
   * Get a user by ID
   */
  async getById(id: string): Promise<Result<User>> {
    const user = await usersRepo.findById(id);

    if (!user) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    return Result.ok(await attachDefaultProjects(user));
  },

  /**
   * Get a user by email
   */
  async getByEmail(email: string): Promise<Result<User>> {
    const user = await usersRepo.findByEmail(email);

    if (!user) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    return Result.ok(user);
  },

  /**
   * List all users
   */
  async list(): Promise<Result<User[]>> {
    const users = await usersRepo.findAll();
    const withTwoFactor = await twoFactorRepo.listUserIdsWithTwoFactor();
    const withProjects = await attachDefaultProjectsToMany(users);
    return Result.ok(
      withProjects.map((user) => ({ ...user, twoFactorEnabled: withTwoFactor.has(user.id) }))
    );
  },

  /**
   * List users that can be assigned to reports
   */
  async listAssignable(): Promise<Result<User[]>> {
    const users = await usersRepo.findAssignable();
    return Result.ok(users);
  },

  /**
   * Get a user only if they can be assigned to a report
   */
  async getAssignableById(id: string): Promise<Result<User>> {
    const user = await usersRepo.findById(id);

    if (!user) {
      return Result.fail('Assigned user not found', 'NOT_FOUND');
    }

    if (!user.isActive) {
      return Result.fail('Assigned user must be active', 'USER_INACTIVE');
    }

    if (user.invitationSentAt && !user.invitationAcceptedAt) {
      return Result.fail(
        'Assigned user must accept their invitation before they can receive reports',
        'INVITATION_PENDING'
      );
    }

    return Result.ok(user);
  },

  /**
   * Update a user
   */
  async update(id: string, input: UpdateUserInput): Promise<Result<User>> {
    const existing = await usersRepo.findById(id);

    if (!existing) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    // Validate name if provided
    if (input.name !== undefined && input.name.trim().length < 2) {
      return Result.fail('Name must be at least 2 characters', 'INVALID_NAME');
    }

    if (input.role && input.role !== 'admin' && existing.role === 'admin') {
      const guard = await ensureAnotherSignInAdmin(id, 'Cannot demote the last admin user');
      if (!guard.success) return guard;
    }

    if (input.isActive === false && existing.role === 'admin') {
      const guard = await ensureAnotherSignInAdmin(
        id,
        'Cannot deactivate the last active admin user'
      );
      if (!guard.success) return guard;
    }

    const updatedIsActive = input.isActive ?? existing.isActive;
    const willBeAssignable =
      updatedIsActive && (!existing.invitationSentAt || !!existing.invitationAcceptedAt);
    let selectedProjectIds: Set<string> | undefined;
    let projectsForDefaults:
      Array<Awaited<ReturnType<typeof projectsRepo.findAll>>[number]> | undefined;

    if (input.defaultProjectIds !== undefined) {
      const projects = await projectsRepo.findAll();
      selectedProjectIds = new Set(input.defaultProjectIds);
      projectsForDefaults = projects;

      if (selectedProjectIds.size !== input.defaultProjectIds.length) {
        return Result.fail('Default projects contain duplicate entries', 'INVALID_PROJECT_IDS');
      }

      const validProjectIds = new Set(projects.map((project) => project.id));
      for (const projectId of selectedProjectIds) {
        if (!validProjectIds.has(projectId)) {
          return Result.fail('One or more default projects are invalid', 'INVALID_PROJECT_IDS');
        }
      }

      if (selectedProjectIds.size > 0 && !willBeAssignable) {
        return Result.fail(
          'Only active users with accepted invitations can be assigned as project defaults',
          'INVALID_DEFAULT_ASSIGNEE'
        );
      }
    }

    if (selectedProjectIds && projectsForDefaults) {
      for (const project of projectsForDefaults) {
        if (selectedProjectIds.has(project.id) === (project.settings?.defaultAssigneeUserId === id))
          continue;
        const access = checkProjectLicense(project.id);
        if (!access.success) return access;
      }
    }

    const updates: Partial<Pick<User, 'name' | 'role' | 'isActive'>> = {};

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    if (input.role !== undefined) {
      updates.role = input.role;
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    const user = await usersRepo.update(id, updates);

    if (!user) {
      return Result.fail('Failed to update user', 'UPDATE_FAILED');
    }

    if (selectedProjectIds && projectsForDefaults) {
      for (const project of projectsForDefaults) {
        const isSelected = selectedProjectIds.has(project.id);
        const isCurrentlyAssigned = project.settings?.defaultAssigneeUserId === id;

        if (isSelected === isCurrentlyAssigned) {
          continue;
        }

        const nextSettings = { ...project.settings };

        if (isSelected) {
          nextSettings.defaultAssigneeUserId = id;
        } else {
          delete nextSettings.defaultAssigneeUserId;
        }

        await projectsRepo.update(project.id, { settings: nextSettings });
      }
    }

    logger.info('User updated', { userId: id, updates: Object.keys(updates) });
    return Result.ok(await attachDefaultProjects(user));
  },

  /**
   * Delete a user
   */
  async delete(id: string, currentUserId?: string): Promise<Result<void>> {
    const existing = await usersRepo.findById(id);

    if (!existing) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    // Prevent self-deletion
    if (currentUserId && id === currentUserId) {
      return Result.fail('Cannot delete your own account', 'SELF_DELETE');
    }

    if (existing.role === 'admin') {
      const guard = await ensureAnotherSignInAdmin(id, 'Cannot delete the last admin user');
      if (!guard.success) return guard;
    }

    // Delete all user sessions
    await sessionsRepo.deleteByUserId(id);

    // Delete user
    await usersRepo.delete(id);

    logger.info('User deleted', { userId: id });
    return Result.ok(undefined);
  },

  /**
   * Reset user password (admin function). Recovery ends every session and API token.
   */
  async resetPassword(id: string, newPassword: string): Promise<Result<void>> {
    const existing = await usersRepo.findById(id);

    if (!existing) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    // Validate new password
    const policyCheck = await passwordPolicyService.validate(newPassword);
    if (!policyCheck.success) return policyCheck;

    // Hash and update password
    const passwordHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(id, passwordHash);

    await sessionsRepo.deleteByUserId(id);
    const revokedTokens = await apiTokensRepo.revokeAllForUser(id);

    logger.info('User password reset', { userId: id, revokedTokens });
    return Result.ok(undefined);
  },

  /**
   * Count users
   */
  async count(): Promise<number> {
    return await usersRepo.count();
  },

  /**
   * Update user's avatar
   */
  async updateAvatar(userId: string, avatarUrl: string): Promise<Result<User>> {
    const user = await usersRepo.findById(userId);
    if (!user) {
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    const updated = await usersRepo.updateAvatarUrl(userId, avatarUrl);
    if (!updated) {
      return Result.fail('Failed to update avatar', 'UPDATE_FAILED');
    }

    logger.info('Avatar updated', { userId });
    return Result.ok(updated);
  },

  /**
   * Delete user's avatar
   */
  async deleteAvatar(userId: string): Promise<Result<User>> {
    const user = await usersRepo.findById(userId);
    if (!user) {
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    const updated = await usersRepo.updateAvatarUrl(userId, null);
    if (!updated) {
      return Result.fail('Failed to delete avatar', 'UPDATE_FAILED');
    }

    logger.info('Avatar deleted', { userId });
    return Result.ok(updated);
  },

  /**
   * Update user's own profile (name, email). Changing the email needs the current password
   * and a session, not an API token.
   */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    options: UpdateProfileOptions = {}
  ): Promise<Result<User>> {
    const existing = await usersRepo.findById(userId);

    if (!existing) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    const updates: Partial<Pick<User, 'name' | 'email'>> = {};

    // Validate and update name if provided
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (trimmedName.length < 2) {
        return Result.fail('Name must be at least 2 characters', 'INVALID_NAME');
      }
      updates.name = trimmedName;
    }

    // Validate and update email if provided
    if (input.email !== undefined) {
      const trimmedEmail = input.email.toLowerCase().trim();

      // Validate email format
      if (!isValidEmail(trimmedEmail)) {
        return Result.fail('Invalid email address', 'INVALID_EMAIL');
      }

      if (trimmedEmail !== existing.email.toLowerCase()) {
        if (options.viaApiToken) {
          return Result.fail('Sign in to change your email address', 'SESSION_REQUIRED');
        }
        if (!input.currentPassword) {
          return Result.fail(
            'Enter your current password to change your email address',
            'PASSWORD_REQUIRED'
          );
        }
        if (!(await verifyPassword(userId, input.currentPassword))) {
          return Result.fail('Current password is incorrect', 'INVALID_PASSWORD');
        }

        const emailExists = await usersRepo.emailExists(trimmedEmail);
        if (emailExists) {
          return Result.fail('Email address already in use', 'EMAIL_EXISTS');
        }
        updates.email = trimmedEmail;
      }
    }

    // If no updates, return current user
    if (Object.keys(updates).length === 0) {
      return Result.ok(existing);
    }

    const user = await usersRepo.update(userId, updates);

    if (!user) {
      return Result.fail('Failed to update profile', 'UPDATE_FAILED');
    }

    logger.info('Profile updated', { userId, updates: Object.keys(updates) });
    return Result.ok(user);
  },
};
