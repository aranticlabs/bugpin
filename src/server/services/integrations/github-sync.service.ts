import { reportsRepo } from '../../database/repositories/reports.repo.js';
import { integrationsRepo } from '../../database/repositories/integrations.repo.js';
import { filesRepo } from '../../database/repositories/files.repo.js';
import { githubService } from './github.service.js';
import { settingsService } from '../settings.service.js';
import { Result } from '../../utils/result.js';
import { logger } from '../../utils/logger.js';
import type { Integration, GitHubIntegrationConfig, ReportStatus } from '@shared/types';

// Types

export interface SyncResult {
  reportId: string;
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}

export interface BatchSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
}

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  delays: [1000, 5000, 15000], // 1s, 5s, 15s
};

// Helper to generate webhook secret
function generateWebhookSecret(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Service

export const githubSyncService = {
  /**
   * Sync a single report to GitHub
   * Creates a new issue or updates existing one
   */
  async syncReport(reportId: string, integrationId: string): Promise<Result<SyncResult>> {
    // Load report
    const report = await reportsRepo.findById(reportId);
    if (!report) {
      return Result.fail('Report not found', 'NOT_FOUND');
    }

    // Load integration
    const integration = await integrationsRepo.findById(integrationId);
    if (!integration) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    if (integration.type !== 'github') {
      return Result.fail('Integration is not a GitHub integration', 'INVALID_TYPE');
    }

    if (!integration.isActive) {
      return Result.fail('Integration is not active', 'INACTIVE');
    }

    const githubConfig = integration.config as GitHubIntegrationConfig;

    // Load report files
    const files = await filesRepo.findByReportId(reportId);

    try {
      let result: SyncResult;

      if (report.githubIssueNumber) {
        // Update existing issue
        const updateResult = await githubService.updateIssue(
          report.githubIssueNumber,
          { ...report, files },
          {
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            accessToken: githubConfig.accessToken,
            fileTransferMode: githubConfig.fileTransferMode,
          },
        );

        if (!updateResult.success) {
          // Mark as error
          await reportsRepo.updateGitHubSyncStatus(reportId, {
            status: 'error',
            error: updateResult.error,
          });

          return Result.fail(updateResult.error || 'Failed to update GitHub issue', 'SYNC_FAILED');
        }

        result = {
          reportId,
          success: true,
          issueNumber: updateResult.issueNumber,
          issueUrl: updateResult.issueUrl,
        };
      } else {
        // Create new issue
        const createResult = await githubService.createIssue(
          { ...report, files },
          {
            owner: githubConfig.owner,
            repo: githubConfig.repo,
            accessToken: githubConfig.accessToken,
            labels: githubConfig.labels,
            assignees: githubConfig.assignees,
            fileTransferMode: githubConfig.fileTransferMode,
          },
        );

        if (!createResult.success) {
          // Mark as error
          await reportsRepo.updateGitHubSyncStatus(reportId, {
            status: 'error',
            error: createResult.error,
          });

          return Result.fail(createResult.error || 'Failed to create GitHub issue', 'SYNC_FAILED');
        }

        result = {
          reportId,
          success: true,
          issueNumber: createResult.issueNumber,
          issueUrl: createResult.issueUrl,
        };
      }

      // Update report with sync status
      await reportsRepo.updateGitHubSyncStatus(reportId, {
        status: 'synced',
        issueNumber: result.issueNumber,
        issueUrl: result.issueUrl,
      });

      // Update integration usage
      await integrationsRepo.updateLastUsed(integrationId);

      logger.info('Report synced to GitHub', {
        reportId,
        integrationId,
        issueNumber: result.issueNumber,
      });

      return Result.ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Mark as error
      await reportsRepo.updateGitHubSyncStatus(reportId, {
        status: 'error',
        error: message,
      });

      logger.error('Failed to sync report to GitHub', { reportId, error: message });
      return Result.fail(message, 'SYNC_FAILED');
    }
  },

  /**
   * Sync multiple reports (batch sync)
   */
  async syncReports(reportIds: string[], integrationId: string): Promise<Result<BatchSyncResult>> {
    const results: SyncResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const reportId of reportIds) {
      // Mark as pending
      await reportsRepo.markPendingSync(reportId);

      const result = await this.syncReport(reportId, integrationId);

      if (result.success) {
        results.push(result.value);
        successful++;
      } else {
        results.push({
          reportId,
          success: false,
          error: result.error,
        });
        failed++;
      }

      // Small delay between syncs to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return Result.ok({
      total: reportIds.length,
      successful,
      failed,
      results,
    });
  },

  /**
   * Sync a report with retry logic
   */
  async syncWithRetry(reportId: string, integrationId: string): Promise<Result<SyncResult>> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      const result = await this.syncReport(reportId, integrationId);

      if (result.success) {
        return result;
      }

      lastError = result.error;

      // Don't retry on certain errors
      if (
        result.code === 'NOT_FOUND' ||
        result.code === 'INVALID_TYPE' ||
        result.code === 'INACTIVE'
      ) {
        return result;
      }

      // Wait before retry (except on last attempt)
      if (attempt < RETRY_CONFIG.maxAttempts) {
        const delay = RETRY_CONFIG.delays[attempt - 1] || 1000;
        logger.info(
          `Retry ${attempt}/${RETRY_CONFIG.maxAttempts} for report ${reportId} in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries failed
    await reportsRepo.updateGitHubSyncStatus(reportId, {
      status: 'error',
      error: `Failed after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError}`,
    });

    return Result.fail(lastError || 'Sync failed after retries', 'SYNC_FAILED');
  },

  /**
   * Check if a project has automatic sync enabled
   */
  async getAutoSyncIntegration(projectId: string): Promise<Integration | null> {
    const integrations = await integrationsRepo.findByProjectId(projectId);

    for (const integration of integrations) {
      if (integration.type === 'github' && integration.isActive) {
        const config = integration.config as GitHubIntegrationConfig;
        if (config.syncMode === 'automatic') {
          return integration;
        }
      }
    }

    return null;
  },

  /**
   * Enable automatic sync for an integration
   * Creates GitHub webhook for bi-directional sync
   */
  async enableAutoSync(integrationId: string): Promise<Result<void>> {
    const integration = await integrationsRepo.findById(integrationId);
    if (!integration) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    if (integration.type !== 'github') {
      return Result.fail('Only GitHub integrations support automatic sync', 'INVALID_TYPE');
    }

    const githubConfig = integration.config as GitHubIntegrationConfig;

    // Get app settings to retrieve the appUrl
    const settingsResult = await settingsService.getAll();
    if (!settingsResult.success) {
      return Result.fail('Failed to retrieve application settings', 'SETTINGS_ERROR');
    }

    const appUrl = settingsResult.value.appUrl;
    if (!appUrl || !appUrl.trim()) {
      return Result.fail(
        'Application URL not configured. Set APP_URL in settings.',
        'CONFIG_ERROR',
      );
    }

    // Generate webhook secret
    const webhookSecret = generateWebhookSecret();

    // Build webhook URL (remove trailing slash from appUrl if present)
    const baseUrl = appUrl.trim().replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhooks/github/${integrationId}`;

    // Create webhook on GitHub
    const webhookResult = await githubService.createWebhook(
      {
        owner: githubConfig.owner,
        repo: githubConfig.repo,
        accessToken: githubConfig.accessToken,
      },
      webhookUrl,
      webhookSecret,
    );

    if (!webhookResult.success) {
      logger.warn('Failed to create GitHub webhook, continuing without bi-directional sync', {
        integrationId,
        error: webhookResult.error,
      });
      // Continue anyway - we can still do one-way sync
    }

    // Update integration config with sync mode and webhook info
    const updatedConfig: GitHubIntegrationConfig = {
      ...githubConfig,
      syncMode: 'automatic',
      webhookId: webhookResult.webhookId,
      webhookSecret: webhookResult.success ? webhookSecret : undefined,
    };

    await integrationsRepo.update(integrationId, { config: updatedConfig });

    logger.info('Enabled automatic sync for integration', {
      integrationId,
      webhookCreated: webhookResult.success,
    });

    return Result.ok(undefined);
  },

  /**
   * Disable automatic sync for an integration
   * Removes GitHub webhook
   */
  async disableAutoSync(integrationId: string): Promise<Result<void>> {
    const integration = await integrationsRepo.findById(integrationId);
    if (!integration) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    if (integration.type !== 'github') {
      return Result.fail('Only GitHub integrations support automatic sync', 'INVALID_TYPE');
    }

    const githubConfig = integration.config as GitHubIntegrationConfig;

    // Delete webhook from GitHub if it exists
    if (githubConfig.webhookId) {
      await githubService.deleteWebhook(
        {
          owner: githubConfig.owner,
          repo: githubConfig.repo,
          accessToken: githubConfig.accessToken,
        },
        githubConfig.webhookId,
      );
    }

    // Update integration config
    const updatedConfig: GitHubIntegrationConfig = {
      ...githubConfig,
      syncMode: 'manual',
      webhookId: undefined,
      webhookSecret: undefined,
    };

    await integrationsRepo.update(integrationId, { config: updatedConfig });

    logger.info('Disabled automatic sync for integration', { integrationId });

    return Result.ok(undefined);
  },

  /**
   * Handle incoming GitHub webhook
   * Updates report status based on issue state changes
   */
  async handleWebhook(
    integrationId: string,
    action: string,
    issue: { number: number; state: 'open' | 'closed' },
  ): Promise<Result<void>> {
    const integration = await integrationsRepo.findById(integrationId);
    if (!integration) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    // Find report by issue number
    const report = await reportsRepo.findByGitHubIssueNumber(integration.projectId, issue.number);
    if (!report) {
      // No matching report, ignore
      logger.debug('No report found for GitHub issue', {
        integrationId,
        issueNumber: issue.number,
      });
      return Result.ok(undefined);
    }

    // Map GitHub issue state to report status
    let newStatus: ReportStatus | undefined;

    if (action === 'closed' && issue.state === 'closed') {
      // Issue was closed
      if (report.status !== 'resolved' && report.status !== 'closed') {
        newStatus = 'resolved';
      }
    } else if (action === 'reopened' && issue.state === 'open') {
      // Issue was reopened
      if (report.status === 'resolved' || report.status === 'closed') {
        newStatus = 'open';
      }
    }

    if (newStatus) {
      await reportsRepo.update(report.id, { status: newStatus });

      logger.info('Report status updated from GitHub webhook', {
        reportId: report.id,
        issueNumber: issue.number,
        action,
        newStatus,
      });
    }

    return Result.ok(undefined);
  },

  /**
   * Get count of unsynced reports for a project
   */
  async getUnsyncedCount(projectId: string): Promise<number> {
    const unsynced = await reportsRepo.findUnsyncedByProject(projectId);
    return unsynced.length;
  },

  /**
   * Get all unsynced report IDs for a project
   */
  async getUnsyncedReportIds(projectId: string): Promise<string[]> {
    const unsynced = await reportsRepo.findUnsyncedByProject(projectId);
    return unsynced.map((r) => r.id);
  },
};
