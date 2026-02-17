import { projectsRepo, type CreateProjectData } from '../database/repositories/projects.repo.js';
import { reportsRepo } from '../database/repositories/reports.repo.js';
import { webhooksRepo } from '../database/repositories/webhooks.repo.js';
import { Result } from '../utils/result.js';
import { logger } from '../utils/logger.js';
import type { Project, ProjectSettings } from '@shared/types';

// Types

export interface CreateProjectInput {
  name: string;
  settings?: ProjectSettings;
}

export interface UpdateProjectInput {
  name?: string;
  settings?: ProjectSettings;
  isActive?: boolean;
}

// Service

// Return type for create that includes the one-time API key
export interface CreateProjectResult {
  project: Project;
  apiKey: string; // Full API key, only available on create
}

export const projectsService = {
  /**
   * Create a new project
   * Returns the project and the full API key (only time it's available)
   */
  async create(input: CreateProjectInput): Promise<Result<CreateProjectResult>> {
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

    const { project, apiKey } = await projectsRepo.create(projectData);

    logger.info('Project created', { projectId: project.id, name: project.name });
    return Result.ok({ project, apiKey });
  },

  /**
   * Get a project by ID
   */
  async getById(id: string): Promise<Result<Project>> {
    const project = await projectsRepo.findById(id);

    if (!project) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    return Result.ok(project);
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
    return Result.ok(projects);
  },

  /**
   * Update a project
   */
  async update(id: string, input: UpdateProjectInput): Promise<Result<Project>> {
    const existing = await projectsRepo.findById(id);

    if (!existing) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

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
      // Merge settings instead of replacing
      updates.settings = { ...existing.settings, ...input.settings };
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
  async regenerateApiKey(id: string): Promise<Result<string>> {
    const existing = await projectsRepo.findById(id);

    if (!existing) {
      return Result.fail('Project not found', 'NOT_FOUND');
    }

    const newApiKey = await projectsRepo.regenerateApiKey(id);

    if (!newApiKey) {
      return Result.fail('Failed to regenerate API key', 'REGENERATE_FAILED');
    }

    logger.info('API key regenerated', { projectId: id });
    return Result.ok(newApiKey);
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
        (domain) => originDomain === domain || originDomain.endsWith(`.${domain}`),
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
