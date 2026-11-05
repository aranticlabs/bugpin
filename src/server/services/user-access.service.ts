import { usersRepo } from '../database/repositories/users.repo.js';
import { sessionsRepo } from '../database/repositories/sessions.repo.js';
import { apiTokensRepo } from '../database/repositories/api-tokens.repo.js';
import { usersService } from './users.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { ApiToken, User } from '@shared/types';

async function findUser(id: string): Promise<Result<User>> {
  const user = await usersRepo.findById(id);
  return user ? Result.ok(user) : Result.fail('User not found', 'NOT_FOUND');
}

export const userAccessService = {
  async setApiAccess(id: string, enabled: boolean): Promise<Result<User>> {
    const found = await findUser(id);
    if (!found.success) return found;

    await usersRepo.setApiAccess(id, enabled);
    if (!enabled) {
      const revoked = await apiTokensRepo.revokeAllForUser(id);
      logger.info('API access turned off', { userId: id, revokedTokens: revoked });
    } else {
      logger.info('API access turned on', { userId: id });
    }

    return findUser(id);
  },

  async listApiTokens(id: string): Promise<Result<ApiToken[]>> {
    const found = await findUser(id);
    if (!found.success) return found;
    return Result.ok(await apiTokensRepo.findByUserId(id));
  },

  async revokeApiTokens(id: string): Promise<Result<number>> {
    const found = await findUser(id);
    if (!found.success) return found;
    const revoked = await apiTokensRepo.revokeAllForUser(id);
    logger.info('API tokens revoked by an administrator', { userId: id, revoked });
    return Result.ok(revoked);
  },

  async signOutEverywhere(id: string): Promise<Result<number>> {
    const found = await findUser(id);
    if (!found.success) return found;
    const ended = await sessionsRepo.deleteByUserId(id);
    logger.info('Sessions ended by an administrator', { userId: id, ended });
    return Result.ok(ended);
  },

  /** Sets a password the user must replace at their next sign-in. */
  async setTemporaryPassword(id: string, password: string): Promise<Result<void>> {
    const reset = await usersService.resetPassword(id, password);
    if (!reset.success) return reset;
    await usersRepo.setMustChangePassword(id, true);
    return Result.ok(undefined);
  },
};
