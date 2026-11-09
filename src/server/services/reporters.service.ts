import { reporterOwnershipService } from './reporter-ownership.service.js';
import { realtimeService } from './realtime.service.js';
import type { ReportOwnerChangedEvent } from '@shared/types';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { reporterAuthTokensRepo } from '../database/repositories/reporter-auth-tokens.repo.js';
import { reporterSessionsRepo } from '../database/repositories/reporter-sessions.repo.js';
import { reporterOwnershipRepo } from '../database/repositories/reporter-ownership.repo.js';
import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { normalizeEmail } from '../utils/email-normalize.js';
import { isValidEmail } from '../utils/validators.js';
import { Result } from '../utils/result.js';
import type { Reporter } from '@shared/types';
import type { ReporterSummary } from '@shared/reporter-types';

function revoke(reporter: Reporter, userId: string | null, now: string): void {
  reporterSessionsRepo.revokeByReporterId(reporter.id, now);
  reporterAuthTokensRepo.revokeByEmail(reporter.email, now);
  reportersRepo.recordRevocation(reporter.id, userId, now);
}

export const reportersService = {
  list(input: {
    search?: string;
    status?: 'active' | 'suspended';
    cursor?: string;
    limit?: number;
  }): Result<{ reporters: ReporterSummary[]; nextCursor: string | null; total: number }> {
    let cursor: { createdAt: string; id: string } | undefined;
    if (input.cursor) {
      try {
        const parsed: unknown = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('createdAt' in parsed) ||
          !('id' in parsed) ||
          typeof parsed.createdAt !== 'string' ||
          typeof parsed.id !== 'string' ||
          !Number.isFinite(Date.parse(parsed.createdAt)) ||
          !parsed.id
        )
          return Result.fail('Invalid cursor', 'INVALID_CURSOR');
        cursor = { createdAt: parsed.createdAt, id: parsed.id };
      } catch {
        return Result.fail('Invalid cursor', 'INVALID_CURSOR');
      }
    }
    const limit = Math.min(100, Math.max(1, input.limit ?? 25));
    const result = reportersRepo.list({ ...input, cursor, limit });
    const page = result.reporters.slice(0, limit);
    const projects = reportersRepo.ownedProjects(page.map((reporter) => reporter.id));
    const last = page.at(-1);
    return Result.ok({
      reporters: page.map((reporter) => {
        const owned = projects.filter((project) => project.reporterId === reporter.id);
        return {
          id: reporter.id,
          email: reporter.email,
          displayName: reporter.displayName,
          lastLoginAt: reporter.lastLoginAt,
          status: reporter.suspendedAt ? 'suspended' : 'active',
          projects: owned.map((project) => ({ id: project.projectId, name: project.projectName })),
          ownedReportCount: owned.reduce((count, project) => count + project.reportCount, 0),
        };
      }),
      nextCursor:
        result.reporters.length > limit && last
          ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString(
              'base64url'
            )
          : null,
      total: result.total,
    });
  },

  lookup(email: string): Result<{ id: string; email: string; displayName: string } | null> {
    email = normalizeEmail(email);
    if (!isValidEmail(email)) return Result.fail('Invalid email address', 'INVALID_EMAIL');
    const reporter = reportersRepo.findByEmail(email);
    return Result.ok(
      reporter
        ? { id: reporter.id, email: reporter.email, displayName: reporter.displayName }
        : null
    );
  },

  suspend(id: string, userId: string): Result<Reporter> {
    const result = reportersRepo.transaction<Result<Reporter>>(() => {
      const reporter = reportersRepo.findById(id);
      if (!reporter) return Result.fail('Reporter not found', 'NOT_FOUND');
      const now = new Date().toISOString();
      revoke(reporter, userId, now);
      reportersRepo.setSuspension(id, now, userId, now);
      return Result.ok(reportersRepo.findById(id)!);
    });
    if (result.success) realtimeService.invalidatePortalAccess({ reporterId: id });
    return result;
  },

  unsuspend(id: string): Result<Reporter> {
    const reporter = reportersRepo.findById(id);
    if (!reporter) return Result.fail('Reporter not found', 'NOT_FOUND');
    reportersRepo.setSuspension(id, null, null, new Date().toISOString());
    return Result.ok(reportersRepo.findById(id)!);
  },

  revokeSessions(id: string, userId: string): Result<Reporter> {
    const result = reportersRepo.transaction<Result<Reporter>>(() => {
      const reporter = reportersRepo.findById(id);
      if (!reporter) return Result.fail('Reporter not found', 'NOT_FOUND');
      revoke(reporter, userId, new Date().toISOString());
      return Result.ok(reportersRepo.findById(id)!);
    });
    if (result.success) realtimeService.invalidatePortalAccess({ reporterId: id });
    return result;
  },

  delete(id: string, userId: string | null, eraseContactDetails = false): Result<void> {
    const changes: ReportOwnerChangedEvent[] = [];
    const result = reportersRepo.transaction<Result<void>>(() => {
      const reporter = reportersRepo.findById(id);
      if (!reporter) return Result.fail('Reporter not found', 'NOT_FOUND');
      revoke(reporter, userId, new Date().toISOString());
      const reports = reporterOwnershipRepo.findForReporter(id, reporter.email);
      reporterOwnershipRepo.clearForReporter(id, reporter.email, eraseContactDetails);
      for (const report of reports) {
        changes.push({
          reportId: report.id,
          projectId: report.projectId,
          action: 'owner_removed',
          oldReporterId: report.reporterId,
          newReporterId: null,
          actorUserId: userId,
        });
        reportHistoryRepo.insert({
          reportId: report.id,
          userId,
          action: 'owner_removed',
          oldValue: report.reporterId ?? report.claimableEmail,
        });
      }
      reportersRepo.anonymizeMessages(id, 'Deleted reporter');
      reportersRepo.delete(id);
      return Result.ok(undefined);
    });
    if (result.success) {
      reporterOwnershipService.announce(changes);
      realtimeService.invalidatePortalAccess({ reporterId: id });
    }
    return result;
  },

  async cleanup(): Promise<Result<{ tokens: number; sessions: number; reporters: number }>> {
    const now = Date.now();
    const tokens = reporterAuthTokensRepo.deleteOlderThan(new Date(now - 86400000).toISOString());
    const sessions = reporterSessionsRepo.deleteOlderThan(
      new Date(now - 7 * 86400000).toISOString()
    );
    const { retentionDays } = await settingsRepo.getAll();
    let reporters = 0;
    if (retentionDays > 0) {
      const idle = reportersRepo.findIdle(new Date(now - retentionDays * 86400000).toISOString());
      for (const reporter of idle) {
        if (this.delete(reporter.id, null).success) reporters++;
      }
    }
    return Result.ok({ tokens, sessions, reporters });
  },
};
