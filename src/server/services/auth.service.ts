import { usersRepo } from '../database/repositories/users.repo.js';
import { sessionsRepo } from '../database/repositories/sessions.repo.js';
import { settingsCacheService } from './settings-cache.service.js';
import { config } from '../config.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { User, Session } from '@shared/types';

// Types

export interface LoginResult {
  user: User;
  session: Session;
}

// Password Hashing (using Bun's built-in password API)

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: BCRYPT_ROUNDS,
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// Service

export const authService = {
  /**
   * Login with email and password
   */
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Result<LoginResult>> {
    // Find user by email
    const userWithPassword = await usersRepo.findByEmailWithPassword(email);

    if (!userWithPassword) {
      logger.warn('Login failed: user not found', { email });
      return Result.fail('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Check if user is active
    if (!userWithPassword.isActive) {
      logger.warn('Login failed: user inactive', { email });
      return Result.fail('Account is disabled', 'ACCOUNT_DISABLED');
    }

    // Verify password
    const isValid = await verifyPassword(password, userWithPassword.passwordHash);

    if (!isValid) {
      logger.warn('Login failed: invalid password', { email });
      return Result.fail('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Create session
    const settings = await settingsCacheService.getAll();
    const sessionMaxAgeSeconds = settings.sessionMaxAgeDays * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();
    const session = await sessionsRepo.create({
      userId: userWithPassword.id,
      expiresAt,
      ipAddress,
      userAgent,
    });

    // Update last login
    await usersRepo.updateLastLogin(userWithPassword.id);

    // Remove password hash from user object
    const { passwordHash: _, ...user } = userWithPassword;

    logger.info('User logged in', { userId: user.id, email: user.email });

    return Result.ok({ user, session });
  },

  /**
   * Logout (invalidate session)
   */
  async logout(sessionId: string): Promise<Result<void>> {
    const deleted = await sessionsRepo.delete(sessionId);

    if (!deleted) {
      return Result.fail('Session not found', 'SESSION_NOT_FOUND');
    }

    logger.info('User logged out', { sessionId });
    return Result.ok(undefined);
  },

  /**
   * Validate session and get user
   */
  async validateSession(sessionId: string): Promise<Result<{ user: User; session: Session }>> {
    const session = await sessionsRepo.findValidById(sessionId);

    if (!session) {
      return Result.fail('Invalid or expired session', 'INVALID_SESSION');
    }

    const user = await usersRepo.findById(session.userId);

    if (!user) {
      // Session exists but user doesn't - clean up
      await sessionsRepo.delete(sessionId);
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      return Result.fail('Account is disabled', 'ACCOUNT_DISABLED');
    }

    // Update session activity
    await sessionsRepo.updateActivity(sessionId);

    return Result.ok({ user, session });
  },

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<Result<void>> {
    // Get user with password
    const user = await usersRepo.findById(userId);
    if (!user) {
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    const userWithPassword = await usersRepo.findByEmailWithPassword(user.email);
    if (!userWithPassword) {
      return Result.fail('User not found', 'USER_NOT_FOUND');
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, userWithPassword.passwordHash);
    if (!isValid) {
      return Result.fail('Current password is incorrect', 'INVALID_PASSWORD');
    }

    // Validate new password
    if (newPassword.length < 8) {
      return Result.fail('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    // Hash and update password
    const newHash = await hashPassword(newPassword);
    await usersRepo.updatePassword(userId, newHash);

    // Invalidate all sessions for this user
    await sessionsRepo.deleteByUserId(userId);

    logger.info('Password changed', { userId });
    return Result.ok(undefined);
  },

  /**
   * Bootstrap first admin user
   * Called during application startup if no users exist
   */
  async bootstrapAdmin(): Promise<Result<User | null>> {
    const userCount = await usersRepo.count();

    if (userCount > 0) {
      logger.info('Users already exist, skipping bootstrap');
      return Result.ok(null);
    }

    // Create admin user with configured credentials (defaults: admin@example.com / changeme123)
    const passwordHash = await hashPassword(config.adminPassword);
    const user = await usersRepo.create({
      email: config.adminEmail,
      passwordHash,
      name: 'Admin',
      role: 'admin',
    });

    logger.info('First admin user created', { email: config.adminEmail });
    return Result.ok(user);
  },

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const count = await sessionsRepo.deleteExpired();
    if (count > 0) {
      logger.info('Cleaned up expired sessions', { count });
    }
    return count;
  },
};
