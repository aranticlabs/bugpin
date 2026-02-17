import crypto from 'crypto';
import { usersRepo } from '../database/repositories/users.repo.js';
import { sessionsRepo } from '../database/repositories/sessions.repo.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { emailService } from './email.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import { isValidEmail } from '../utils/validators.js';
import type { User, UserRole, Session } from '@shared/types';

// Types

export interface InviteUserInput {
  email: string;
  name: string;
  role?: UserRole;
}

export interface AcceptInvitationInput {
  token: string;
  name: string;
  password: string;
}

export interface AcceptInvitationResult {
  user: User;
  session: Session;
}

// Token Generation

function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex');
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

export const invitationsService = {
  /**
   * Invite a new user
   */
  async inviteUser(input: InviteUserInput, inviterName: string): Promise<Result<User>> {
    // Validate email
    if (!input.email || !isValidEmail(input.email)) {
      return Result.fail('Invalid email address', 'INVALID_EMAIL');
    }

    // Check if email already exists
    const exists = await usersRepo.emailExists(input.email);
    if (exists) {
      return Result.fail('Email address already in use', 'EMAIL_EXISTS');
    }

    // Validate name
    if (!input.name || input.name.trim().length < 2) {
      return Result.fail('Name must be at least 2 characters', 'INVALID_NAME');
    }

    // Get settings for expiration
    const settings = await settingsRepo.getAll();
    const expirationDays = settings.invitationExpirationDays || 7;

    // Generate token and expiration
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();

    // Create invited user
    const user = await usersRepo.createInvited({
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      role: input.role ?? 'viewer',
      invitationToken: token,
      invitationTokenExpiresAt: expiresAt,
    });

    // Send invitation email
    const appUrl = settings.appUrl || '';
    const inviteUrl = `${appUrl}/accept-invitation?token=${token}`;

    const emailResult = await emailService.sendInvitationEmail(
      { email: user.email, name: user.name },
      {
        inviteUrl,
        inviterName,
        expiresInDays: expirationDays,
      },
    );

    if (!emailResult.success) {
      logger.warn('Failed to send invitation email', {
        userId: user.id,
        email: user.email,
        error: emailResult.error,
      });
    }

    logger.info('User invited', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return Result.ok(user);
  },

  /**
   * Resend invitation email
   */
  async resendInvitation(userId: string, inviterName: string): Promise<Result<User>> {
    const user = await usersRepo.findById(userId);

    if (!user) {
      return Result.fail('User not found', 'NOT_FOUND');
    }

    // Check if user has already accepted invitation
    if (user.invitationAcceptedAt) {
      return Result.fail('User has already accepted the invitation', 'ALREADY_ACCEPTED');
    }

    // Get settings for expiration
    const settings = await settingsRepo.getAll();
    const expirationDays = settings.invitationExpirationDays || 7;

    // Generate new token and expiration
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString();

    // Update user with new token
    const updatedUser = await usersRepo.updateInvitationToken(userId, token, expiresAt);

    if (!updatedUser) {
      return Result.fail('Failed to update invitation token', 'UPDATE_FAILED');
    }

    // Send invitation email
    const appUrl = settings.appUrl || '';
    const inviteUrl = `${appUrl}/accept-invitation?token=${token}`;

    const emailResult = await emailService.sendInvitationEmail(
      { email: updatedUser.email, name: updatedUser.name },
      {
        inviteUrl,
        inviterName,
        expiresInDays: expirationDays,
      },
    );

    if (!emailResult.success) {
      logger.warn('Failed to send invitation email', {
        userId: updatedUser.id,
        email: updatedUser.email,
        error: emailResult.error,
      });
    }

    logger.info('Invitation resent', {
      userId: updatedUser.id,
      email: updatedUser.email,
    });

    return Result.ok(updatedUser);
  },

  /**
   * Validate invitation token
   */
  async validateToken(token: string): Promise<Result<{ email: string; name: string }>> {
    const user = await usersRepo.findByInvitationToken(token);

    if (!user) {
      return Result.fail('Invalid invitation token', 'INVALID_TOKEN');
    }

    // Check if token is expired
    if (user.invitationTokenExpiresAt && new Date(user.invitationTokenExpiresAt) < new Date()) {
      return Result.fail('Invitation has expired', 'TOKEN_EXPIRED');
    }

    // Check if already accepted
    if (user.invitationAcceptedAt) {
      return Result.fail('Invitation has already been accepted', 'ALREADY_ACCEPTED');
    }

    return Result.ok({
      email: user.email,
      name: user.name,
    });
  },

  /**
   * Accept invitation and set password
   */
  async acceptInvitation(
    input: AcceptInvitationInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Result<AcceptInvitationResult>> {
    // Find user by token
    const userWithToken = await usersRepo.findByInvitationToken(input.token);

    if (!userWithToken) {
      return Result.fail('Invalid invitation token', 'INVALID_TOKEN');
    }

    // Check if token is expired
    if (
      userWithToken.invitationTokenExpiresAt &&
      new Date(userWithToken.invitationTokenExpiresAt) < new Date()
    ) {
      return Result.fail('Invitation has expired', 'TOKEN_EXPIRED');
    }

    // Check if already accepted
    if (userWithToken.invitationAcceptedAt) {
      return Result.fail('Invitation has already been accepted', 'ALREADY_ACCEPTED');
    }

    // Validate name
    if (!input.name || input.name.trim().length < 2) {
      return Result.fail('Name must be at least 2 characters', 'INVALID_NAME');
    }

    // Validate password
    if (!input.password || input.password.length < 8) {
      return Result.fail('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Accept invitation
    const user = await usersRepo.acceptInvitation(
      userWithToken.id,
      passwordHash,
      input.name.trim(),
    );

    if (!user) {
      return Result.fail('Failed to accept invitation', 'ACCEPT_FAILED');
    }

    // Create session for auto-login
    const settings = await settingsRepo.getAll();
    const sessionMaxAgeSeconds = settings.sessionMaxAgeDays * 24 * 60 * 60;
    const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();

    const session = await sessionsRepo.create({
      userId: user.id,
      expiresAt,
      ipAddress,
      userAgent,
    });

    // Update last login
    await usersRepo.updateLastLogin(user.id);

    logger.info('Invitation accepted', {
      userId: user.id,
      email: user.email,
    });

    return Result.ok({ user, session });
  },
};
