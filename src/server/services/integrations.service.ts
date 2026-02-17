import {
  integrationsRepo,
  type CreateIntegrationData,
} from '../database/repositories/integrations.repo.js';
import { projectsRepo } from '../database/repositories/projects.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { filesRepo } from '../database/repositories/files.repo.js';
import { githubService } from './integrations/github.service.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type {
  Integration,
  IntegrationType,
  IntegrationConfig,
  GitHubIntegrationConfig,
  ForwardedReference,
} from '@shared/types';

// Types

export interface CreateIntegrationInput {
  projectId: string;
  type: IntegrationType;
  name: string;
  config: IntegrationConfig;
}

export interface UpdateIntegrationInput {
  name?: string;
  config?: IntegrationConfig;
  isActive?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  details?: unknown;
}

export interface ForwardReportInput {
  labels?: string[];
  assignees?: string[];
}

export interface ForwardReportResult {
  type: string;
  id: string;
  url?: string;
}

// Service

export const integrationsService = {
  /**
   * Create a new integration
   */
  async create(input: CreateIntegrationInput): Promise<Result<Integration>> {
    // Validate project exists
    const project = await projectsRepo.findById(input.projectId);
    if (!project) {
      return Result.fail('Project not found', 'PROJECT_NOT_FOUND');
    }

    // Validate name
    if (!input.name || input.name.trim().length < 2) {
      return Result.fail('Integration name must be at least 2 characters', 'INVALID_NAME');
    }

    if (input.name.length > 100) {
      return Result.fail('Integration name must be at most 100 characters', 'INVALID_NAME');
    }

    // Validate config based on type
    const configValidation = validateConfig(input.type, input.config);
    if (!configValidation.success) {
      return Result.fail(configValidation.error!, 'INVALID_CONFIG');
    }

    // Create integration
    const integrationData: CreateIntegrationData = {
      projectId: input.projectId,
      type: input.type,
      name: input.name.trim(),
      config: input.config,
      isActive: true,
    };

    const integration = await integrationsRepo.create(integrationData);

    // Mask sensitive config before returning
    const masked = maskIntegration(integration);

    logger.info('Integration created', {
      integrationId: integration.id,
      projectId: integration.projectId,
      type: integration.type,
    });

    return Result.ok(masked);
  },

  /**
   * Get an integration by ID
   */
  async getById(id: string): Promise<Result<Integration>> {
    const integration = await integrationsRepo.findById(id);

    if (!integration) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    // Mask sensitive config
    const masked = maskIntegration(integration);
    return Result.ok(masked);
  },

  /**
   * List integrations for a project
   */
  async listByProject(projectId: string): Promise<Result<Integration[]>> {
    const integrations = await integrationsRepo.findByProjectId(projectId);

    // Mask all integrations
    const masked = integrations.map(maskIntegration);
    return Result.ok(masked);
  },

  /**
   * Update an integration
   */
  async update(id: string, input: UpdateIntegrationInput): Promise<Result<Integration>> {
    const existing = await integrationsRepo.findById(id);

    if (!existing) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    // Validate name if provided
    if (input.name !== undefined) {
      if (input.name.trim().length < 2) {
        return Result.fail('Integration name must be at least 2 characters', 'INVALID_NAME');
      }
      if (input.name.length > 100) {
        return Result.fail('Integration name must be at most 100 characters', 'INVALID_NAME');
      }
    }

    // Validate config if provided
    if (input.config !== undefined) {
      const configValidation = validateConfig(existing.type, input.config);
      if (!configValidation.success) {
        return Result.fail(configValidation.error!, 'INVALID_CONFIG');
      }
    }

    const updates: Partial<Pick<Integration, 'name' | 'config' | 'isActive'>> = {};

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    if (input.config !== undefined) {
      updates.config = input.config;
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    const integration = await integrationsRepo.update(id, updates);

    if (!integration) {
      return Result.fail('Failed to update integration', 'UPDATE_FAILED');
    }

    // Mask sensitive config
    const masked = maskIntegration(integration);

    logger.info('Integration updated', { integrationId: id });
    return Result.ok(masked);
  },

  /**
   * Delete an integration
   */
  async delete(id: string): Promise<Result<void>> {
    const existing = await integrationsRepo.findById(id);

    if (!existing) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    await integrationsRepo.delete(id);

    logger.info('Integration deleted', { integrationId: id });
    return Result.ok(undefined);
  },

  /**
   * Test connection for an integration
   */
  async testConnection(id: string): Promise<Result<TestConnectionResult>> {
    const integration = await integrationsRepo.findById(id);

    if (!integration) {
      return Result.fail('Integration not found', 'NOT_FOUND');
    }

    try {
      let result: TestConnectionResult;

      switch (integration.type) {
        case 'github': {
          const config = integration.config as GitHubIntegrationConfig;
          const testResult = await githubService.testConnection({
            owner: config.owner,
            repo: config.repo,
            accessToken: config.accessToken,
          });

          result = {
            success: testResult.success,
            error: testResult.error,
            details: testResult.repoName ? { repoName: testResult.repoName } : undefined,
          };
          break;
        }

        case 'jira':
        case 'slack':
        case 'linear':
        case 'webhook':
          return Result.fail(
            `Testing ${integration.type} integrations is not yet implemented`,
            'NOT_IMPLEMENTED',
          );

        default:
          return Result.fail('Unknown integration type', 'INVALID_TYPE');
      }

      logger.info('Integration connection tested', {
        integrationId: id,
        type: integration.type,
        success: result.success,
      });

      return Result.ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Integration test failed', { integrationId: id, error: message });
      return Result.ok({ success: false, error: message });
    }
  },

  /**
   * Forward a report to an external integration
   */
  async forwardReport(
    reportId: string,
    integrationId: string,
    options: ForwardReportInput = {},
  ): Promise<Result<ForwardReportResult>> {
    // Load integration
    const integration = await integrationsRepo.findById(integrationId);
    if (!integration) {
      return Result.fail('Integration not found', 'INTEGRATION_NOT_FOUND');
    }

    if (!integration.isActive) {
      return Result.fail('Integration is disabled', 'INTEGRATION_DISABLED');
    }

    // Load report with files
    const report = await reportsRepo.findById(reportId);
    if (!report) {
      return Result.fail('Report not found', 'REPORT_NOT_FOUND');
    }

    // Verify project matches
    if (report.projectId !== integration.projectId) {
      return Result.fail('Integration does not belong to this project', 'PROJECT_MISMATCH');
    }

    // Load report files
    const files = await filesRepo.findByReportId(reportId);

    try {
      let result: ForwardReportResult;

      switch (integration.type) {
        case 'github': {
          const config = integration.config as GitHubIntegrationConfig;
          const githubResult = await githubService.createIssue(
            { ...report, files },
            {
              owner: config.owner,
              repo: config.repo,
              accessToken: config.accessToken,
              labels: config.labels,
              assignees: config.assignees,
            },
            options,
          );

          if (!githubResult.success) {
            return Result.fail(
              githubResult.error || 'Failed to create GitHub issue',
              'FORWARD_FAILED',
            );
          }

          result = {
            type: 'github',
            id: String(githubResult.issueNumber),
            url: githubResult.issueUrl,
          };
          break;
        }

        case 'jira':
        case 'slack':
        case 'linear':
        case 'webhook':
          return Result.fail(
            `Forwarding to ${integration.type} is not yet implemented`,
            'NOT_IMPLEMENTED',
          );

        default:
          return Result.fail('Unknown integration type', 'INVALID_TYPE');
      }

      // Update report's forwardedTo array
      const forwardedTo: ForwardedReference[] = report.forwardedTo ?? [];
      const newForward: ForwardedReference = {
        type: result.type as 'github' | 'jira' | 'linear' | 'webhook',
        id: result.id,
        url: result.url,
        forwardedAt: new Date().toISOString(),
      };

      // Check if already forwarded to same integration
      const existingIndex = forwardedTo.findIndex(
        (f) => f.type === result.type && f.id === result.id,
      );
      if (existingIndex === -1) {
        forwardedTo.push(newForward);
        await reportsRepo.update(reportId, { forwardedTo });
      }

      // Update integration usage
      await integrationsRepo.updateLastUsed(integrationId);

      logger.info('Report forwarded to integration', {
        reportId,
        integrationId,
        type: integration.type,
        externalId: result.id,
      });

      return Result.ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to forward report', { reportId, integrationId, error: message });
      return Result.fail(`Failed to forward report: ${message}`, 'FORWARD_FAILED');
    }
  },
};

// Helper Functions

/**
 * Validate integration config based on type
 */
function validateConfig(
  type: IntegrationType,
  config: IntegrationConfig,
): { success: boolean; error?: string } {
  switch (type) {
    case 'github': {
      const githubConfig = config as GitHubIntegrationConfig;
      if (!githubConfig.owner || !githubConfig.owner.trim()) {
        return { success: false, error: 'GitHub owner is required' };
      }
      if (!githubConfig.repo || !githubConfig.repo.trim()) {
        return { success: false, error: 'GitHub repo is required' };
      }
      if (!githubConfig.accessToken || !githubConfig.accessToken.trim()) {
        return { success: false, error: 'GitHub access token is required' };
      }
      return { success: true };
    }

    case 'jira':
    case 'slack':
    case 'linear':
    case 'webhook':
      // Future validation for other types
      return { success: true };

    default:
      return { success: false, error: 'Unknown integration type' };
  }
}

/**
 * Mask sensitive fields in integration config
 */
function maskIntegration(integration: Integration): Integration {
  return {
    ...integration,
    config: maskConfig(integration.config),
  };
}

/**
 * Mask sensitive fields in config
 */
function maskConfig(config: IntegrationConfig): IntegrationConfig {
  const masked = { ...config } as Record<string, unknown>;

  // Mask common sensitive fields
  if ('accessToken' in masked && typeof masked.accessToken === 'string') {
    masked.accessToken = maskToken(masked.accessToken);
  }
  if ('apiToken' in masked && typeof masked.apiToken === 'string') {
    masked.apiToken = maskToken(masked.apiToken);
  }
  if ('webhookUrl' in masked && typeof masked.webhookUrl === 'string') {
    masked.webhookUrl = maskToken(masked.webhookUrl);
  }

  return masked as unknown as IntegrationConfig;
}

/**
 * Mask a token/secret string
 */
function maskToken(token: string): string {
  if (token.length <= 8) {
    return '****';
  }
  return token.slice(0, 4) + '****' + token.slice(-4);
}
