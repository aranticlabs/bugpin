import { projectsRepo, type CreateProjectData } from '../database/repositories/projects.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { integrationsRepo } from '../database/repositories/integrations.repo.js';
import { webhooksRepo } from '../database/repositories/webhooks.repo.js';
import { usersService } from './users.service.js';
import { Result } from '../utils/result.js';
import { checkProjectLicense, ProjectLicenseError } from '../utils/project-license.js';
import { logger } from '../utils/logger.js';
import {
  ACTIVE_REPORT_STATUSES,
  type Project,
  type ProjectSettings,
  type ProjectSettingsUpdate,
  type ProjectSummary,
} from '@shared/types';

// Matches the api_key_prefix length stored by the projects repository.
const API_KEY_PREFIX_LENGTH = 12;

// Types

export interface CreateProjectInput {
  name: string;
  settings?: ProjectSettings;
}

export interface UpdateProjectInput {
  name?: string;
  settings?: ProjectSettingsUpdate;
  isActive?: boolean;
}

function copyOverride<K extends keyof ProjectSettings>(
  target: ProjectSettings,
  source: ProjectSettingsUpdate,
  key: K
): void {
  const value = source[key];
  if (value !== null && value !== undefined) target[key] = value;
}

/** Drops every override set to null so the instance default applies again */
function withoutClearedOverrides(settings: ProjectSettingsUpdate): ProjectSettings {
  const result: ProjectSettings = {};
  for (const key of Object.keys(settings) as Array<keyof ProjectSettings>) {
    copyOverride(result, settings, key);
  }
  return result;
}

// Service

export const projectsService = {
  /**
   * Create a new project
   */
  async create(input: CreateProjectInput): Promise<Result<Project>> {
    // Validate name
    if (!input.name || input.name.trim().length < 2) {
      return Result.fail('Project name must be at least 2 characters', 'INVALID_NAME');
    }

    if (input.name.length > 100) {
      return Result.fail('Project name must be at most 100 characters', 'INVALID_NAME');
    }

    const projectData: CreateProjectData = {
      name: input.name.trim(),
      settings: input.settings ?? {},
    };

    let project: Project;
    try {
      project = await projectsRepo.create(projectData);
    } catch (error) {
      if (error instanceof ProjectLicenseError) return Result.fail(error.message, error.code);
      throw error;
    }

    logger.info('Project created', { projectId: project.id, name: project.name });
    return Result.ok(project);
  },

  /**
   * Get a project by ID
   */
  async getById(id: string): Promise<Result<Project>> {
    const project = await projectsRepo.findById(id);

    if (!project) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    return Result.ok({ ...project, licenseLocked: !checkProjectLicense(project.id).success });
  },

  /**
   * Get a project by API key
   */
  async getByApiKey(apiKey: string): Promise<Result<Project>> {
    const project = await projectsRepo.findByApiKey(apiKey);

    if (!project) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    return Result.ok(project);
  },

  /**
   * List all projects
   */
  async list(): Promise<Result<Project[]>> {
    const projects = await projectsRepo.findAll();
    return Result.ok(
      projects.map((project) => ({
        ...project,
        licenseLocked: !checkProjectLicense(project.id).success,
      }))
    );
  },

  async listSummaries(
    options: { includeApiKeyPrefix?: boolean } = {}
  ): Promise<Result<ProjectSummary[]>> {
    const projects = await projectsRepo.findAll();
    const activeCounts = await reportsRepo.countPerProject(ACTIVE_REPORT_STATUSES);
    const latestReports = await reportsRepo.latestCreatedAtPerProject();
    const integrationTypes = await integrationsRepo.activeTypesPerProject();
    return Result.ok(
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        isActive: project.isActive,
        licenseLocked: !checkProjectLicense(project.id).success,
        activeReportsCount: activeCounts[project.id] ?? 0,
        reportsCount: project.reportsCount,
        createdAt: project.createdAt,
        lastReportAt: latestReports[project.id] ?? null,
        integrationTypes: integrationTypes[project.id] ?? [],
        ...(options.includeApiKeyPrefix && {
          apiKeyPrefix: project.apiKey.substring(0, API_KEY_PREFIX_LENGTH),
        }),
      }))
    );
  },

  /**
   * Update a project
   */
  async update(id: string, input: UpdateProjectInput): Promise<Result<Project>> {
    const existing = await projectsRepo.findById(id);

    if (!existing) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    const access = checkProjectLicense(id);
    if (!access.success) return access;

    // Validate name if provided
    if (input.name !== undefined) {
      if (input.name.trim().length < 2) {
        return Result.fail('Project name must be at least 2 characters', 'INVALID_NAME');
      }
      if (input.name.length > 100) {
        return Result.fail('Project name must be at most 100 characters', 'INVALID_NAME');
      }
    }

    const updates: Partial<Pick<Project, 'name' | 'settings' | 'isActive'>> = {};

    if (input.name !== undefined) {
      updates.name = input.name.trim();
    }

    if (input.settings !== undefined) {
      const nextSettings = withoutClearedOverrides({ ...existing.settings, ...input.settings });
      const defaultAssigneeUserId = nextSettings.defaultAssigneeUserId;

      if (defaultAssigneeUserId) {
        const assigneeResult = await usersService.getAssignableById(defaultAssigneeUserId);
        if (!assigneeResult.success) {
          return Result.fail(assigneeResult.error, 'INVALID_DEFAULT_ASSIGNEE');
        }
      }

      updates.settings = nextSettings;
    }

    if (input.isActive !== undefined) {
      updates.isActive = input.isActive;
    }

    const project = await projectsRepo.update(id, updates);

    if (!project) {
      return Result.fail('Failed to update project', 'UPDATE_FAILED');
    }

    logger.info('Project updated', { projectId: id });
    return Result.ok(project);
  },

  /**
   * Delete a project (soft delete)
   */
  async delete(id: string): Promise<Result<void>> {
    const existing = await projectsRepo.findById(id);

    if (!existing) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    // Note: Associated reports and files will be kept (soft delete)
    // They can be cleaned up later if needed

    await projectsRepo.delete(id);

    logger.info('Project deleted', { projectId: id });
    return Result.ok(undefined);
  },

  /**
   * Regenerate API key for a project
   */
  async regenerateApiKey(id: string): Promise<Result<Project>> {
    const access = checkProjectLicense(id);
    if (!access.success) return access;
    const existing = await projectsRepo.findById(id);

    if (!existing) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    const project = await projectsRepo.regenerateApiKey(id);

    if (!project) {
      return Result.fail('Failed to regenerate API key', 'REGENERATE_FAILED');
    }

    logger.info('API key regenerated', { projectId: id });
    return Result.ok(project);
  },

  /**
   * Get project statistics
   */
  async getStats(id: string): Promise<Result<{ reportsCount: number; webhooksCount: number }>> {
    const existing = await projectsRepo.findById(id);

    if (!existing) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    const reportsCount = await reportsRepo.countByProject(id);
    const webhooks = await webhooksRepo.findByProjectId(id);

    return Result.ok({
      reportsCount,
      webhooksCount: webhooks.length,
    });
  },

  /**
   * Validate origin against project's allowed origins
   */
  async validateOrigin(apiKey: string, origin: string): Promise<Result<boolean>> {
    const project = await projectsRepo.findByApiKey(apiKey);

    if (!project) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    const allowedOrigins = project.settings?.security?.allowedOrigins ?? [];

    // Empty whitelist = allow all
    if (allowedOrigins.length === 0) {
      return Result.ok(true);
    }

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some((pattern) => matchOrigin(origin, pattern));

    return Result.ok(isAllowed);
  },

  /**
   * Reorder projects
   * Updates project positions based on the order of IDs in the array
   */
  async reorder(projectIds: string[]): Promise<Result<void>> {
    // Validate that all IDs exist
    const allExist = await projectsRepo.existsAll(projectIds);
    if (!allExist) {
      return Result.fail('One or more project IDs do not exist', 'INVALID_PROJECT_IDS');
    }

    await projectsRepo.reorder(projectIds);

    logger.info('Projects reordered', { count: projectIds.length });
    return Result.ok(undefined);
  },

  /**
   * Validate widget access (checks API key, project active status, and origin whitelist)
   */
  async validateWidgetAccess(apiKey: string, origin?: string): Promise<Result<Project>> {
    const project = await projectsRepo.findByApiKey(apiKey);

    if (!project) {
      return Result.fail('Invalid API key', 'INVALID_API_KEY');
    }

    const access = checkProjectLicense(project.id);
    if (!access.success) return access;

    if (!project.isActive) {
      return Result.fail('Project is not active', 'PROJECT_INACTIVE');
    }

    // Check origin if domain whitelist is configured
    const allowedOrigins = project.settings?.security?.allowedOrigins;
    if (allowedOrigins && allowedOrigins.length > 0 && origin) {
      let originDomain: string;
      try {
        originDomain = new URL(origin).hostname;
      } catch {
        // Malformed origin - reject
        return Result.fail('Invalid origin format', 'INVALID_ORIGIN');
      }

      const isAllowed = allowedOrigins.some(
        (domain) => originDomain === domain || originDomain.endsWith(`.${domain}`)
      );

      if (!isAllowed) {
        return Result.fail('Origin not allowed', 'ORIGIN_NOT_ALLOWED');
      }
    }

    return Result.ok(project);
  },
};

/**
 * Match origin against pattern with wildcard support
 */
function matchOrigin(origin: string, pattern: string): boolean {
  // Exact match
  if (origin === pattern) return true;

  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
    .replace(/\*/g, '.*'); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(origin);
}
