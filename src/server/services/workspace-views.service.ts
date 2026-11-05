import { pinnedProjectsRepo } from '../database/repositories/pinned-projects.repo.js';
import { recentReportsRepo } from '../database/repositories/recent-reports.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { Result } from '../utils/result.js';
import {
  ACTIVE_REPORT_STATUSES,
  UNASSIGNED_FILTER,
  type PinnedProject,
  type RecentReport,
  type ReportFilter,
  type ReportViewCounts,
} from '@shared/types';

const RECENT_REPORTS_KEPT = 20;

async function countReports(filter: ReportFilter): Promise<number> {
  const { total } = await reportsRepo.find({ ...filter, page: 1, limit: 1 });
  return total;
}

export const workspaceViewsService = {
  async listPinnedProjects(userId: string): Promise<Result<PinnedProject[]>> {
    const projects = await pinnedProjectsRepo.listForUser(userId);
    const activeCounts = await reportsRepo.countPerProject(ACTIVE_REPORT_STATUSES);
    return Result.ok(
      projects.map((project) => ({
        ...project,
        activeReportsCount: activeCounts[project.id] ?? 0,
      }))
    );
  },

  async pinProject(userId: string, projectId: string): Promise<Result<void>> {
    const project = await projectsRepo.findById(projectId);
    if (!project) return Result.fail('Project not found', 'NOT_FOUND');

    const pinned = await pinnedProjectsRepo.listForUser(userId);
    if (pinned.some((item) => item.id === projectId)) return Result.ok(undefined);

    await pinnedProjectsRepo.pin(userId, projectId);
    return Result.ok(undefined);
  },

  async unpinProject(userId: string, projectId: string): Promise<Result<void>> {
    await pinnedProjectsRepo.unpin(userId, projectId);
    return Result.ok(undefined);
  },

  async reorderPinnedProjects(userId: string, projectIds: string[]): Promise<Result<void>> {
    const pinned = await pinnedProjectsRepo.listForUser(userId);
    const pinnedIds = new Set(pinned.map((item) => item.id));
    const requested = [...new Set(projectIds)].filter((id) => pinnedIds.has(id));
    const requestedSet = new Set(requested);
    const remaining = pinned.map((item) => item.id).filter((id) => !requestedSet.has(id));

    await pinnedProjectsRepo.reorder(userId, [...requested, ...remaining]);
    return Result.ok(undefined);
  },

  async recordReportView(userId: string, reportId: string): Promise<Result<void>> {
    const report = await reportsRepo.findById(reportId);
    if (!report) return Result.fail('Report not found', 'NOT_FOUND');
    await recentReportsRepo.record(userId, reportId, RECENT_REPORTS_KEPT);
    return Result.ok(undefined);
  },

  async listRecentReports(userId: string, limit: number): Promise<Result<RecentReport[]>> {
    const capped = Math.min(Math.max(limit, 1), RECENT_REPORTS_KEPT);
    return Result.ok(await recentReportsRepo.listForUser(userId, capped));
  },

  async getViewCounts(userId: string): Promise<Result<ReportViewCounts>> {
    const [assignedToMe, unassigned, active] = await Promise.all([
      countReports({ assignedTo: userId, status: ACTIVE_REPORT_STATUSES }),
      countReports({ assignedTo: UNASSIGNED_FILTER, status: ACTIVE_REPORT_STATUSES }),
      countReports({ status: ACTIVE_REPORT_STATUSES }),
    ]);
    return Result.ok({ assignedToMe, unassigned, active });
  },
};
