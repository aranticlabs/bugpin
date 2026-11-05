import { settingsCacheService } from './settings-cache.service.js';
import { Result } from '../utils/result.js';
import { describePasswordPolicyViolation } from '@shared/password-policy';
import type { PasswordPolicy } from '@shared/password-policy';

export const passwordPolicyService = {
  async getPolicy(): Promise<PasswordPolicy> {
    const settings = await settingsCacheService.getAll();
    return settings.passwordPolicy;
  },

  /** Check a new password against the admin-configured strength policy */
  async validate(password: string): Promise<Result<void>> {
    const violation = describePasswordPolicyViolation(password, await this.getPolicy());
    return violation ? Result.fail(violation, 'WEAK_PASSWORD') : Result.ok(undefined);
  },
};
