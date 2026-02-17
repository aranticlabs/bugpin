import { usersRepo, type CreateUserData } from '../database/repositories/users.repo.js';
import { sessionsRepo } from '../database/repositories/sessions.repo.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { isValidEmail } from '../utils/validators.js';
import type { User, UserRole } from '@shared/types';

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
  avatarUrl?: string;
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
}

// Password Hashing

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: BCRYPT_ROUNDS,
  });
}

// Service

export const usersService = {
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
    if (!input.password || input.password.length < 8) {
      return Result.fail('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

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

    return Result.ok(user);
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
    return Result.ok(users);
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

    // Prevent demoting the last admin
    if (input.role && input.role !== 'admin' && existing.role === 'admin') {
      const admins = await usersRepo.findByRole('admin');
      if (admins.length === 1) {
        return Result.fail('Cannot demote the last admin user', 'LAST_ADMIN');
      }
    }

    // Prevent deactivating the last admin
    if (input.isActive === false && existing.role === 'admin') {
      const admins = await usersRepo.findByRole('admin');
      const activeAdmins = admins.filter((u) => u.isActive);
      if (activeAdmins.length === 1 && activeAdmins[0].id === id) {
        return Result.fail('Cannot deactivate the last active admin user', 'LAST_ADMIN');
      }
    }

    const updates: Partial<Pick<User, 'name' | 'role' | 'isActive' | 'avatarUrl'>> = {};

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    if (input.role !== undefined) {
      updates.role = input.role;
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    if (input.avatarUrl !== undefined) {
      updates.avatarUrl = input.avatarUrl;
    }

    const user = await usersRepo.update(id, updates);

    if (!user) {
      return Result.fail('Failed to update user', 'UPDATE_FAILED');
    }

    logger.info('User updated', { userId: id, updates: Object.keys(updates) });
    return Result.ok(user);
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

    // Prevent deleting the last admin
    if (existing.role === 'admin') {
      const admins = await usersRepo.findByRole('admin');
      if (admins.length === 1) {
        return Result.fail('Cannot delete the last admin user', 'LAST_ADMIN');
      }
    }

    // Delete all user sessions
    await sessionsRepo.deleteByUserId(id);

    // Delete user
    await usersRepo.delete(id);

    logger.info('User deleted', { userId: id });
    return Result.ok(undefined);
  },

  /**
   * Reset user password (admin function)
   */
  async resetPassword(id: string, newPassword: string): Promise<Result<void>> {
    const existing = await usersRepo.findById(id);

    if (!existing) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    // Validate new password
    if (newPassword.length < 8) {
      return Result.fail('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    // Hash and update password
    const passwordHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(id, passwordHash);

    // Invalidate all sessions for this user
    await sessionsRepo.deleteByUserId(id);

    logger.info('User password reset', { userId: id });
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
   * Update user's own profile (name, email)
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Result<User>> {
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

      // Check if email is different from current
      if (trimmedEmail !== existing.email) {
        // Check if email already exists
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
