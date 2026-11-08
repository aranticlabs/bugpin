import { reporterOwnershipRepo } from '../database/repositories/reporter-ownership.repo.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { Result } from '../utils/result.js';

export const reporterOwnershipService = {
  attachClaimable(reporterId: string, email: string, now: string): Result<number> {
    const reports = reporterOwnershipRepo.attachClaimable(reporterId, email, now);
    for (const report of reports) {
      reportHistoryRepo.insert({
        reportId: report.id,
        userId: null,
        action: 'owner_assigned',
        newValue: reporterId,
      });
    }
    return Result.ok(reports.length);
  },
};
