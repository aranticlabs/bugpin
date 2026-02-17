import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { projectsService } from '../../src/server/services/projects.service';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { webhooksRepo } from '../../src/server/database/repositories/webhooks.repo';
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

let projectById: Project | null = baseProject;
let projectByApiKey: Project | null = baseProject;
let lastProjectUpdates: unknown;
let updateReturnsProject: Project | null = baseProject;
let regenerateApiKeyValue: string | null = 'proj_new';
let deletedProjectId: string | null = null;

beforeEach(() => {
  projectById = baseProject;
  projectByApiKey = baseProject;
  lastProjectUpdates = undefined;
  updateReturnsProject = baseProject;
  regenerateApiKeyValue = 'proj_new';
  deletedProjectId = null;

  projectsRepo.create = async (input) => {
    const project = { ...baseProject, ...input, id: 'prj_new' };
    return { project, apiKey: 'proj_new_key' };
  };
  projectsRepo.findById = async () => projectById;
  projectsRepo.findByApiKey = async () => projectByApiKey;
  projectsRepo.findAll = async () => [baseProject];
  projectsRepo.update = async (id, updates) => {
    lastProjectUpdates = updates;
    return updateReturnsProject ? { ...updateReturnsProject, ...updates, id } : null;
  };
  projectsRepo.delete = async (id) => {
    deletedProjectId = id;
    return true;
  };
  projectsRepo.regenerateApiKey = async () => regenerateApiKeyValue;

  reportsRepo.countByProject = async () => 7;
  webhooksRepo.findByProjectId = async () => [{ id: 'whk_1' }] as never;
});

afterEach(() => {
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(webhooksRepo, originalWebhooksRepo);
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
      expect(result.value.project.name).toBe('Project');
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
    regenerateApiKeyValue = null;
    const result = await projectsService.regenerateApiKey('prj_1');
    expect(result.success).toBe(false);
  });

  it('returns new api key when successful', async () => {
    const result = await projectsService.regenerateApiKey('prj_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('proj_new');
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
