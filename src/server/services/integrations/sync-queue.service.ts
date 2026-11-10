import { checkProjectLicense } from '../../utils/project-license.js';
import { integrationsRepo } from '../../database/repositories/integrations.repo.js';
import { githubSyncService } from './github-sync.service.js';
import { reportsRepo } from '../../database/repositories/reports.repo.js';
import { logger } from '../../utils/logger.js';
import { Result } from '../../utils/result.js';

// Types

interface SyncTask {
  id: string;
  reportId: string;
  integrationId: string;
  projectId: string;
  createdAt: number;
  attempts: number;
  nextAttempt: number;
}

// Configuration
const QUEUE_CONFIG = {
  processInterval: 5000, // Check queue every 5 seconds
  maxConcurrent: 3, // Max concurrent syncs
  maxAttempts: 3,
  retryDelays: [1000, 5000, 15000], // Delays between retries
};

// Queue state
let queue: SyncTask[] = [];
let processing = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

// Service

export const syncQueueService = {
  /**
   * Add a report to the sync queue
   */
  async enqueue(reportId: string, integrationId: string): Promise<Result<void>> {
    const result = await this.enqueueBatch([reportId], integrationId);
    return result.success ? Result.ok(undefined) : result;
  },

  async enqueueBatch(reportIds: string[], integrationId: string): Promise<Result<number>> {
    if (!reportIds.every((id) => typeof id === 'string' && id.length > 0))
      return Result.fail('Report IDs must be nonempty strings', 'INVALID_PARAMS');
    const ids = [...new Set(reportIds)];
    if (ids.length === 0) return Result.ok(0);
    const integration = await integrationsRepo.findById(integrationId);
    if (!integration) return Result.fail('Integration not found', 'NOT_FOUND');
    for (const id of ids) {
      const report = await reportsRepo.findById(id);
      if (!report) return Result.fail('Report not found', 'NOT_FOUND');
      if (report.projectId !== integration.projectId)
        return Result.fail('Integration does not belong to this project', 'PROJECT_MISMATCH');
    }
    const access = checkProjectLicense(integration.projectId);
    if (!access.success) return access;
    const pendingIds = ids.filter((id) => !queue.some((task) => task.reportId === id));
    if (pendingIds.length === 0) return Result.ok(0);
    const now = Date.now();
    const tasks: SyncTask[] = pendingIds.map((reportId) => ({
      id: `${reportId}-${now}`,
      reportId,
      integrationId,
      projectId: integration.projectId,
      createdAt: now,
      attempts: 0,
      nextAttempt: now,
    }));
    try {
      // Persist the entire batch before publishing tasks, without yielding to the queue processor.
      reportsRepo.markPendingSyncBatch(pendingIds);
    } catch (error) {
      logger.error('Failed to mark reports pending for sync', { error });
      return Result.fail('Could not queue reports for sync', 'QUEUE_FAILED');
    }
    for (const task of tasks) queue.push(task);
    logger.info('Added reports to sync queue', { count: tasks.length, integrationId });
    return Result.ok(tasks.length);
  },

  /**
   * Process the queue
   */
  async processQueue(): Promise<void> {
    if (processing) {
      return;
    }

    processing = true;

    try {
      const now = Date.now();

      // Get tasks ready to process
      const readyTasks = queue
        .filter((t) => t.nextAttempt <= now)
        .slice(0, QUEUE_CONFIG.maxConcurrent);

      if (readyTasks.length === 0) {
        return;
      }

      logger.debug(`Processing ${readyTasks.length} sync tasks`);

      // Process tasks in parallel
      const results = await Promise.allSettled(
        readyTasks.map(async (task) => {
          task.attempts++;

          let result: Awaited<ReturnType<typeof githubSyncService.syncReport>>;
          try {
            result = await githubSyncService.syncReport(task.reportId, task.integrationId);
          } catch (error) {
            result = Result.fail(
              error instanceof Error ? error.message : 'GitHub sync failed',
              'SYNC_FAILED'
            );
          }

          if (result.success) {
            // Success - remove from queue
            queue = queue.filter((t) => t.id !== task.id);
            logger.info('Sync task completed', { reportId: task.reportId });
          } else {
            // Failed
            if (task.attempts >= QUEUE_CONFIG.maxAttempts) {
              if (checkProjectLicense(task.projectId).success) {
                try {
                  await reportsRepo.updateGitHubSyncStatus(task.reportId, {
                    status: 'error',
                    error: result.error,
                  });
                } catch (error) {
                  logger.error('Failed to persist final sync error', error, {
                    reportId: task.reportId,
                  });
                }
              }
              queue = queue.filter((t) => t.id !== task.id);
              logger.error('Sync task failed after max attempts', {
                reportId: task.reportId,
                error: result.error,
              });
            } else {
              // Schedule retry
              const delay = QUEUE_CONFIG.retryDelays[task.attempts - 1] || 15000;
              task.nextAttempt = Date.now() + delay;
              logger.warn('Sync task failed, scheduling retry', {
                reportId: task.reportId,
                attempt: task.attempts,
                nextAttemptIn: delay,
              });
            }
          }

          return result;
        })
      );

      // Log summary
      const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      ).length;

      if (succeeded > 0 || failed > 0) {
        logger.info('Sync queue batch completed', { succeeded, failed, remaining: queue.length });
      }
    } finally {
      processing = false;
    }
  },

  /**
   * Start the queue processor
   */
  start(): void {
    if (intervalId) {
      return;
    }

    intervalId = setInterval(() => {
      this.processQueue().catch((error) => {
        logger.error('Queue processing error', error);
      });
    }, QUEUE_CONFIG.processInterval);

    logger.info('Sync queue processor started');
  },

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info('Sync queue processor stopped');
    }
  },

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    processing: boolean;
    tasks: Array<{
      reportId: string;
      attempts: number;
      nextAttempt: number;
    }>;
  } {
    return {
      queueLength: queue.length,
      processing,
      tasks: queue.map((t) => ({
        reportId: t.reportId,
        attempts: t.attempts,
        nextAttempt: t.nextAttempt,
      })),
    };
  },

  /**
   * Clear the queue (for testing)
   */
  clear(): void {
    queue = [];
    logger.info('Sync queue cleared');
  },

  /**
   * Remove a specific report from the queue
   */
  remove(reportId: string): boolean {
    const initialLength = queue.length;
    queue = queue.filter((t) => t.reportId !== reportId);
    return queue.length < initialLength;
  },

  /**
   * Retry sync for a specific report (validates integration exists)
   */
  async retrySyncForReport(reportId: string): Promise<Result<void>> {
    // Get report
    const report = await reportsRepo.findById(reportId);
    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    // Find GitHub integration for this project
    const integrations = await integrationsRepo.findByProjectId(report.projectId);
    const githubIntegration = integrations.find((i) => i.type === 'github' && i.isActive);

    if (!githubIntegration) {
      return Result.fail('No active GitHub integration found', 'INTEGRATION_NOT_FOUND');
    }

    // Queue for sync
    return this.enqueue(reportId, githubIntegration.id);
  },
};
