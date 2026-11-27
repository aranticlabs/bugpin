import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { reporterSuppressionsRepo } from '../database/repositories/reporter-suppressions.repo.js';
import { portalProfileSchema } from '../utils/portal-schemas.js';
import { Result } from '../utils/result.js';
import type { PortalMe } from '@shared/portal-types';

export const portalProfileService = {
  update(reporterId: string, input: unknown): Result<PortalMe> {
    const checked = portalProfileSchema.safeParse(input);
    if (!checked.success) return Result.fail('Invalid profile', 'VALIDATION_ERROR');
    try {
      return reportersRepo.transaction(() => {
        const reporter = reportersRepo.findById(reporterId);
        if (!reporter || reporter.suspendedAt)
          return Result.fail('Authentication required', 'UNAUTHORIZED');
        const updated = reportersRepo.updateProfile(reporterId, checked.data);
        if (checked.data.emailUpdates === false)
          reporterSuppressionsRepo.insert(reporter.email, 'portal');
        if (checked.data.emailUpdates === true) reporterSuppressionsRepo.delete(reporter.email);
        return Result.ok({
          id: updated.id,
          email: updated.email,
          displayName: updated.displayName,
          locale: updated.locale,
          emailUpdates: !reporterSuppressionsRepo.has(updated.email),
        });
      });
    } catch {
      return Result.fail('Failed to update profile', 'UPDATE_FAILED');
    }
  },
};
