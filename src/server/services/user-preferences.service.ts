import { userPreferencesRepo } from '../database/repositories/user-preferences.repo.js';
import { Result } from '../utils/result.js';
import type { UserPreferences } from '@shared/types';

export const userPreferencesService = {
  async get(userId: string): Promise<Result<UserPreferences>> {
    return Result.ok(await userPreferencesRepo.get(userId));
  },

  async update(userId: string, changes: UserPreferences): Promise<Result<UserPreferences>> {
    const merged = { ...(await userPreferencesRepo.get(userId)), ...changes };
    await userPreferencesRepo.save(userId, merged);
    return Result.ok(merged);
  },
};
