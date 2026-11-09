import { reporterOwnershipRepo } from '../database/repositories/reporter-ownership.repo.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { Result } from '../utils/result.js';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { checkProjectLicense } from '../utils/project-license.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { isValidEmail } from '../utils/validators.js';
import type { Report } from '@shared/types';
import type { ReportOwner } from '@shared/reporter-types';

export const reporterOwnershipService = {
  describeOwner(
    report: Pick<Report, 'reporterId' | 'claimableEmail' | 'reporterEmail'>
  ): Result<ReportOwner> {
    const reporter = report.reporterId ? reportersRepo.findById(report.reporterId) : null;
    return Result.ok({
      reporterId: reporter?.id ?? null,
      claimableEmail: report.claimableEmail ?? null,
      correspondentEmail: reporter?.email ?? report.claimableEmail ?? report.reporterEmail ?? null,
      reporter: reporter
        ? {
            id: reporter.id,
            email: reporter.email,
            displayName: reporter.displayName,
            lastLoginAt: reporter.lastLoginAt,
          }
        : null,
    });
  },

  set(
    reportId: string,
    input: { reporterId: string } | { claimableEmail: string },
    userId: string
  ): Result<ReportOwner> {
    return reportersRepo.transaction(() => this.setInTransaction(reportId, input, userId));
  },

  setInTransaction(
    reportId: string,
    input: { reporterId: string } | { claimableEmail: string },
    userId: string
  ): Result<ReportOwner> {
    const report = reporterOwnershipRepo.findByReportId(reportId);
    if (!report) return Result.fail('Report not found', 'NOT_FOUND');
    const access = checkProjectLicense(report.projectId);
    if (!access.success) return access;
    const reporterId = 'reporterId' in input ? input.reporterId : null;
    const claimableEmail = 'claimableEmail' in input ? normalizeEmail(input.claimableEmail) : null;
    if (reporterId !== null && !reportersRepo.findById(reporterId))
      return Result.fail('Reporter not found', 'NOT_FOUND');
    if (claimableEmail !== null && !isValidEmail(claimableEmail))
      return Result.fail('Invalid email address', 'INVALID_EMAIL');
    if (report.reporterId !== reporterId || report.claimableEmail !== claimableEmail) {
      reporterOwnershipRepo.setOwner(reportId, reporterId, claimableEmail);
      reportHistoryRepo.insert({
        reportId,
        userId,
        action: reporterId ? 'owner_assigned' : 'claimable_set',
        oldValue: report.reporterId ?? report.claimableEmail,
        newValue: reporterId ?? claimableEmail,
      });
    }
    return this.describeOwner({
      reporterId: reporterId ?? undefined,
      claimableEmail: claimableEmail ?? undefined,
      reporterEmail: report.reporterEmail ?? undefined,
    });
  },

  remove(reportId: string, userId: string): Result<void> {
    return reportersRepo.transaction(() => {
      const report = reporterOwnershipRepo.findByReportId(reportId);
      if (!report) return Result.fail('Report not found', 'NOT_FOUND');
      const access = checkProjectLicense(report.projectId);
      if (!access.success) return access;
      if (report.reporterId || report.claimableEmail) {
        reporterOwnershipRepo.setOwner(reportId, null, null);
        reportHistoryRepo.insert({
          reportId,
          userId,
          action: 'owner_removed',
          oldValue: report.reporterId ?? report.claimableEmail,
        });
      }
      return Result.ok(undefined);
    });
  },

  attachClaimable(reporterId: string, email: string): Result<number> {
    const reports = reporterOwnershipRepo.attachClaimable(reporterId, email);
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
