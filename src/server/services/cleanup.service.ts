import { reportsRepo } from '../database/repositories/reports.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { settingsRepo } from '../database/repositories/settings.repo.js';
import { deleteReportFiles } from '../storage/files.js';
import { logger } from '../utils/logger.js';

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Delete reports older than the configured retention period
 */
async function cleanupOldReports(): Promise<{ deleted: number; errors: number }> {
  const settings = await settingsRepo.getAll();
  const retentionDays = settings.retentionDays;

  // Skip cleanup if retention is set to 0 (never delete)
  if (retentionDays === 0) {
    logger.info('Data retention cleanup skipped (retention set to 0 = never delete)');
    return { deleted: 0, errors: 0 };
  }

  logger.info('Starting data retention cleanup', { retentionDays });

  const oldReportIds = await reportsRepo.findIdsOlderThan(retentionDays);

  if (oldReportIds.length === 0) {
    logger.info('No reports to clean up');
    return { deleted: 0, errors: 0 };
  }

  logger.info(`Found ${oldReportIds.length} reports older than ${retentionDays} days`);

  const result = await deleteReportsByIds(oldReportIds);

  logger.info('Data retention cleanup completed', { ...result, total: oldReportIds.length });

  return result;
}

async function deleteReportsByIds(
  reportIds: string[]
): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;

  for (const reportId of reportIds) {
    try {
      await deleteReportFiles(reportId);
      await filesRepo.deleteByReportId(reportId);

      if (await reportsRepo.delete(reportId)) {
        deleted++;
        logger.debug('Deleted report', { reportId });
      } else {
        errors++;
        logger.warn('Failed to delete report', { reportId });
      }
    } catch (error) {
      errors++;
      logger.error('Error deleting report', error, { reportId });
    }
  }

  return { deleted, errors };
}

/**
 * Immediately delete every report together with its stored files
 */
async function deleteAllReports(): Promise<{ deleted: number; errors: number }> {
  const reportIds = await reportsRepo.findAllIds();
  logger.warn('Deleting all reports', { total: reportIds.length });

  const result = await deleteReportsByIds(reportIds);

  logger.warn('Delete all reports completed', { ...result, total: reportIds.length });

  return result;
}

/**
 * Start the cleanup scheduler
 * Runs cleanup daily at startup and then every 24 hours
 */
function startCleanupScheduler(): void {
  if (cleanupInterval) {
    logger.warn('Cleanup scheduler already running');
    return;
  }

  // Run cleanup on startup (with a small delay to let the server initialize)
  setTimeout(() => {
    cleanupOldReports().catch((error) => {
      logger.error('Scheduled cleanup failed', error);
    });
  }, 5000);

  // Run cleanup every 24 hours
  const oneDayMs = 24 * 60 * 60 * 1000;
  cleanupInterval = setInterval(() => {
    cleanupOldReports().catch((error) => {
      logger.error('Scheduled cleanup failed', error);
    });
  }, oneDayMs);

  logger.info('Data retention cleanup scheduler started (runs every 24 hours)');
}

/**
 * Stop the cleanup scheduler
 */
function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Data retention cleanup scheduler stopped');
  }
}

export const cleanupService = {
  cleanupOldReports,
  deleteAllReports,
  startCleanupScheduler,
  stopCleanupScheduler,
};
