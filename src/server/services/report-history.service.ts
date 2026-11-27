import { reportHistoryRepo } from '../database/repositories/report-history.repo.js';
import { reportersRepo } from '../database/repositories/reporters.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { Result } from '../utils/result.js';
import type { ReportHistoryAction, ReportHistoryEntry } from '@shared/types';

async function resolveAssigneeName(userId: string | null | undefined): Promise<string> {
  if (!userId) {
    return 'Unassigned';
  }

  const name = await reportHistoryRepo.findUserNameById(userId);
  return name ?? 'Unknown user';
}

export async function enrichHistoryEntry(entry: ReportHistoryEntry): Promise<ReportHistoryEntry> {
  if (entry.action === 'assignee_changed') {
    const [oldDisplay, newDisplay] = await Promise.all([
      resolveAssigneeName(entry.oldValue),
      resolveAssigneeName(entry.newValue),
    ]);
    return { ...entry, oldDisplay, newDisplay };
  }

  if (entry.action === 'owner_assigned' || entry.action === 'owner_removed') {
    const ownerDisplay = (id?: string) => {
      const reporter = id ? reportersRepo.findById(id) : null;
      if (!reporter) return undefined;
      return reporter.displayName ? `${reporter.displayName} (${reporter.email})` : reporter.email;
    };
    return {
      ...entry,
      oldDisplay: ownerDisplay(entry.oldValue),
      newDisplay: ownerDisplay(entry.newValue),
    };
  }
  return entry;
}

export const reportHistoryService = {
  async record(
    reportId: string,
    userId: string | null | undefined,
    action: ReportHistoryAction,
    oldValue?: string | null,
    newValue?: string | null
  ): Promise<void> {
    await reportHistoryRepo.create({
      reportId,
      userId: userId ?? null,
      action,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
    });
  },

  async listByReport(reportId: string): Promise<Result<ReportHistoryEntry[]>> {
    const report = await reportsRepo.findById(reportId);
    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    const entries = await reportHistoryRepo.findByReportId(reportId);
    const enriched = await Promise.all(entries.map(enrichHistoryEntry));
    return Result.ok(enriched);
  },
};
