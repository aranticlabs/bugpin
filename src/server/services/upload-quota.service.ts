import { filesRepo } from '../database/repositories/files.repo.js';
import { Result } from '../utils/result.js';

export const uploadQuotaService = {
  // Run the check and file inserts in the same synchronous transaction.
  check(reporterId: string, incomingBytes: number, limitMb: number): Result<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    if (
      filesRepo.getSizeByReporterSince(reporterId, since) + incomingBytes >
      limitMb * 1024 * 1024
    ) {
      return Result.fail('The daily upload limit has been reached.', 'UPLOAD_QUOTA_EXCEEDED');
    }
    return Result.ok(undefined);
  },
};
