import { filesRepo } from '../database/repositories/files.repo.js';
import { integrationsRepo } from '../database/repositories/integrations.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { createStoredFileHandle, type StoredFileHandle } from '../storage/files.js';
import { Result } from '../utils/result.js';
import type { FileRecord, GitHubIntegrationConfig, Integration, Report } from '@shared/types';

interface PublicFile {
  file: FileRecord;
  handle: StoredFileHandle;
}

function repositoryKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

function issueRepositoryKey(issueUrl: string | null | undefined): string | null {
  if (!issueUrl) return null;
  let url: URL;
  try {
    url = new URL(issueUrl);
  } catch {
    return null;
  }
  if (url.hostname !== 'github.com') return null;
  const [owner, repo, kind] = url.pathname.split('/').filter(Boolean);
  return owner && repo && kind === 'issues' ? repositoryKey(owner, repo) : null;
}

/**
 * Reports do not store which integration created their issue, so the issue URLs (from automatic
 * sync and from manual forwarding) identify the repositories the report was sent to.
 */
function getIssueRepositories(report: Report): Set<string> {
  const issueUrls = [
    report.githubIssueUrl,
    ...(report.forwardedTo ?? [])
      .filter((reference) => reference.type === 'github')
      .map((reference) => reference.url),
  ];
  const repositories = new Set<string>();
  for (const issueUrl of issueUrls) {
    const key = issueRepositoryKey(issueUrl);
    if (key) repositories.add(key);
  }
  return repositories;
}

function allowsPublicVideo(integration: Integration, issueRepositories: Set<string>): boolean {
  if (!integration.isActive || integration.type !== 'github') return false;
  const config = integration.config as GitHubIntegrationConfig;
  return (
    config.publicVideoLinks === true &&
    typeof config.owner === 'string' &&
    typeof config.repo === 'string' &&
    issueRepositories.has(repositoryKey(config.owner, config.repo))
  );
}

export const publicFilesService = {
  async get(reportId: string, filename: string): Promise<Result<PublicFile>> {
    const files = await filesRepo.findOriginalByReportId(reportId);
    const file = files.find((candidate) => candidate.filename === filename);

    if (!file || file.messageId) {
      return Result.fail('File not found', 'NOT_FOUND');
    }

    const report = await reportsRepo.findById(reportId);
    if (!report) return Result.fail('File not found', 'NOT_FOUND');
    if (!report.githubIssueUrl && !report.forwardedTo?.length) {
      return Result.fail('File type not accessible publicly', 'FORBIDDEN');
    }

    if (file.type === 'video' || file.mimeType.startsWith('video/')) {
      const issueRepositories = getIssueRepositories(report);
      const integrations =
        issueRepositories.size > 0
          ? await integrationsRepo.findActiveByProjectId(report.projectId)
          : [];
      const publicVideoEnabled = integrations.some((integration) =>
        allowsPublicVideo(integration, issueRepositories)
      );

      if (!publicVideoEnabled) {
        return Result.fail('File type not accessible publicly', 'FORBIDDEN');
      }
    } else if (file.type !== 'screenshot' && file.type !== 'attachment') {
      return Result.fail('File type not accessible publicly', 'FORBIDDEN');
    }

    return Result.ok({ file, handle: createStoredFileHandle(file.path) });
  },
};
