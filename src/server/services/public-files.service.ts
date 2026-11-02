import { filesRepo } from '../database/repositories/files.repo.js';
import { integrationsRepo } from '../database/repositories/integrations.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { createStoredFileHandle, type StoredFileHandle } from '../storage/files.js';
import { Result } from '../utils/result.js';
import type { FileRecord, GitHubIntegrationConfig } from '@shared/types';

interface PublicFile {
  file: FileRecord;
  handle: StoredFileHandle;
}

export const publicFilesService = {
  async get(reportId: string, filename: string): Promise<Result<PublicFile>> {
    const files = await filesRepo.findByReportId(reportId);
    const file = files.find((candidate) => candidate.filename === filename);

    if (!file) {
      return Result.fail('File not found', 'NOT_FOUND');
    }

    if (file.type === 'video') {
      const report = await reportsRepo.findById(reportId);
      if (!report) {
        return Result.fail('File not found', 'NOT_FOUND');
      }

      const integrations = await integrationsRepo.findActiveByProjectId(report.projectId);
      const publicVideoEnabled = integrations.some(
        (integration) =>
          integration.isActive &&
          integration.type === 'github' &&
          (integration.config as GitHubIntegrationConfig).publicVideoLinks === true
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
