import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { projectsService } from '../../src/server/services/projects.service';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { webhooksRepo } from '../../src/server/database/repositories/webhooks.repo';
import { integrationsRepo } from '../../src/server/database/repositories/integrations.repo';
import { usersService } from '../../src/server/services/users.service';
import { Result } from '../../src/server/utils/result';
import type { Project } from '../../src/shared/types';

const baseProject: Project = {
  id: 'prj_1',
  name: 'Project One',
  apiKey: 'proj_key',
  settings: {
    security: {
      allowedOrigins: [],
    },
  },
  reportsCount: 0,
  isActive: true,
  position: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalProjectsRepo = { ...projectsRepo };
const originalReportsRepo = { ...reportsRepo };
const originalWebhooksRepo = { ...webhooksRepo };
const originalIntegrationsRepo = { ...integrationsRepo };
const originalUsersService = { ...usersService };

let projectById: Project | null = baseProject;
let projectByApiKey: Project | null = baseProject;
let lastProjectUpdates: unknown;
let updateReturnsProject: Project | null = baseProject;
let regenerateApiKeyProject: Project | null = { ...baseProject, apiKey: 'proj_new' };
let deletedProjectId: string | null = null;

beforeEach(() => {
  projectById = baseProject;
  projectByApiKey = baseProject;
  lastProjectUpdates = undefined;
  updateReturnsProject = baseProject;
  regenerateApiKeyProject = { ...baseProject, apiKey: 'proj_new' };
  deletedProjectId = null;

  projectsRepo.create = async (input) => {
    return { ...baseProject, ...input, id: 'prj_new', apiKey: 'proj_new_key' };
  };
  projectsRepo.findById = async () => projectById;
  projectsRepo.findByApiKey = async () => projectByApiKey;
  projectsRepo.findAll = async () => [baseProject];
  reportsRepo.countPerProject = async () => ({ [baseProject.id]: 3 });
  reportsRepo.latestCreatedAtPerProject = async () => ({
    [baseProject.id]: '2026-11-01T10:00:00.000Z',
  });
  integrationsRepo.activeTypesPerProject = async () => ({ [baseProject.id]: ['github'] });
  projectsRepo.update = async (id, updates) => {
    lastProjectUpdates = updates;
    return updateReturnsProject ? { ...updateReturnsProject, ...updates, id } : null;
  };
  projectsRepo.delete = async (id) => {
    deletedProjectId = id;
    return true;
  };
  projectsRepo.regenerateApiKey = async () => regenerateApiKeyProject;

  reportsRepo.countByProject = async () => 7;
  webhooksRepo.findByProjectId = async () => [{ id: 'whk_1' }] as never;
  usersService.getAssignableById = async (id) =>
    Result.ok({
      id,
      email: `${id}@example.com`,
      name: 'Assignee',
      role: 'viewer',
      isActive: true,
      invitationAcceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
});

afterEach(() => {
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(webhooksRepo, originalWebhooksRepo);
  Object.assign(integrationsRepo, originalIntegrationsRepo);
  Object.assign(usersService, originalUsersService);
});

describe('projectsService.create', () => {
  it('rejects invalid name', async () => {
    const result = await projectsService.create({ name: ' ' });
    expect(result.success).toBe(false);
  });

  it('rejects too long name', async () => {
    const result = await projectsService.create({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('creates project with trimmed name', async () => {
    const result = await projectsService.create({ name: ' Project ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.name).toBe('Project');
    }
  });
});

describe('projectsService.getById/getByApiKey/list', () => {
  it('returns NOT_FOUND when project missing', async () => {
    projectById = null;
    const result = await projectsService.getById('prj_missing');
    expect(result.success).toBe(false);
  });

  it('returns project by API key', async () => {
    const result = await projectsService.getByApiKey('proj_key');
    expect(result.success).toBe(true);
  });

  it('lists projects', async () => {
    const result = await projectsService.list();
    expect(result.success).toBe(true);
  });

  it('lists project summaries without API keys or settings', async () => {
    const result = await projectsService.listSummaries();
    expect(result.success).toBe(true);
    if (!result.success) return;
    for (const summary of result.value) {
      expect(Object.keys(summary).sort()).toEqual([
        'activeReportsCount',
        'createdAt',
        'id',
        'integrationTypes',
        'isActive',
        'lastReportAt',
        'licenseLocked',
        'name',
        'reportsCount',
      ]);
      expect(summary.activeReportsCount).toBe(3);
      expect(summary.lastReportAt).toBe('2026-11-01T10:00:00.000Z');
      expect(summary.integrationTypes).toEqual(['github']);
    }
  });

  it('includes only the API key prefix when requested', async () => {
    projectsRepo.findAll = async () => [{ ...baseProject, apiKey: 'proj_abcdefghijklmnop' }];
    const result = await projectsService.listSummaries({ includeApiKeyPrefix: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value[0]?.apiKeyPrefix).toBe('proj_abcdefg');
    expect(result.value[0]).not.toHaveProperty('apiKey');
  });

  it('reports no last report and no integrations for an empty project', async () => {
    reportsRepo.latestCreatedAtPerProject = async () => ({});
    integrationsRepo.activeTypesPerProject = async () => ({});
    const result = await projectsService.listSummaries();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value[0]?.lastReportAt).toBeNull();
    expect(result.value[0]?.integrationTypes).toEqual([]);
  });
});

describe('projectsService.update', () => {
  it('rejects when project not found', async () => {
    projectById = null;
    const result = await projectsService.update('prj_missing', { name: 'New' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid name', async () => {
    const result = await projectsService.update('prj_1', { name: ' ' });
    expect(result.success).toBe(false);
  });

  it('merges settings and trims name', async () => {
    const result = await projectsService.update('prj_1', {
      name: ' New Name ',
      settings: { security: { allowedOrigins: ['https://example.com'] } },
    });
    expect(result.success).toBe(true);
    expect(lastProjectUpdates).toMatchObject({
      name: 'New Name',
      settings: {
        security: { allowedOrigins: ['https://example.com'] },
      },
    });
  });

  it('accepts a valid default assignee', async () => {
    const result = await projectsService.update('prj_1', {
      settings: { defaultAssigneeUserId: 'usr_2' },
    });

    expect(result.success).toBe(true);
    expect(lastProjectUpdates).toMatchObject({
      settings: {
        security: { allowedOrigins: [] },
        defaultAssigneeUserId: 'usr_2',
      },
    });
  });

  it('rejects an invalid default assignee', async () => {
    usersService.getAssignableById = async () =>
      Result.fail('Assigned user must be active', 'USER_INACTIVE');

    const result = await projectsService.update('prj_1', {
      settings: { defaultAssigneeUserId: 'usr_2' },
    });

    expect(result.success).toBe(false);
  });

  it('clears an existing language override when language is null', async () => {
    projectById = {
      ...baseProject,
      settings: { ...baseProject.settings, language: { mode: 'manual', defaultLanguage: 'de' } },
    };

    const result = await projectsService.update('prj_1', { settings: { language: null } });

    expect(result.success).toBe(true);
    expect(lastProjectUpdates?.settings?.language).toBeNull();
  });

  it('returns UPDATE_FAILED when repo update fails', async () => {
    updateReturnsProject = null;
    const result = await projectsService.update('prj_1', { name: 'New' });
    expect(result.success).toBe(false);
  });
});

describe('projectsService.delete', () => {
  it('rejects when project not found', async () => {
    projectById = null;
    const result = await projectsService.delete('prj_missing');
    expect(result.success).toBe(false);
  });

  it('deletes project', async () => {
    const result = await projectsService.delete('prj_1');
    expect(result.success).toBe(true);
    expect(deletedProjectId).toBe('prj_1');
  });
});

describe('projectsService.regenerateApiKey', () => {
  it('rejects when project not found', async () => {
    projectById = null;
    const result = await projectsService.regenerateApiKey('prj_missing');
    expect(result.success).toBe(false);
  });

  it('returns failure when api key regeneration fails', async () => {
    regenerateApiKeyProject = null;
    const result = await projectsService.regenerateApiKey('prj_1');
    expect(result.success).toBe(false);
  });

  it('returns project with new api key when successful', async () => {
    const result = await projectsService.regenerateApiKey('prj_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.apiKey).toBe('proj_new');
    }
  });
});

describe('projectsService.getStats', () => {
  it('rejects when project not found', async () => {
    projectById = null;
    const result = await projectsService.getStats('prj_missing');
    expect(result.success).toBe(false);
  });

  it('returns report and webhook counts', async () => {
    const result = await projectsService.getStats('prj_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual({ reportsCount: 7, webhooksCount: 1 });
    }
  });
});

describe('projectsService.validateOrigin', () => {
  it('rejects when project not found', async () => {
    projectByApiKey = null;
    const result = await projectsService.validateOrigin('missing', 'https://example.com');
    expect(result.success).toBe(false);
  });

  it('allows all when whitelist empty', async () => {
    projectByApiKey = { ...baseProject, settings: { security: { allowedOrigins: [] } } };
    const result = await projectsService.validateOrigin('proj_key', 'https://example.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(true);
    }
  });

  it('matches exact origin', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { security: { allowedOrigins: ['https://example.com'] } },
    };
    const result = await projectsService.validateOrigin('proj_key', 'https://example.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(true);
    }
  });

  it('matches wildcard origin', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { security: { allowedOrigins: ['https://*.example.com'] } },
    };
    const result = await projectsService.validateOrigin('proj_key', 'https://app.example.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(true);
    }
  });

  it('rejects non-matching origin', async () => {
    projectByApiKey = {
      ...baseProject,
      settings: { security: { allowedOrigins: ['https://allowed.com'] } },
    };
    const result = await projectsService.validateOrigin('proj_key', 'https://blocked.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(false);
    }
  });
});
