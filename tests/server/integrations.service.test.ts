import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { integrationsService } from '../../src/server/services/integrations.service';
import { integrationsRepo } from '../../src/server/database/repositories/integrations.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { githubService } from '../../src/server/services/integrations/github.service';
import type { Integration, Project, Report } from '../../src/shared/types';

const baseProject: Project = {
  id: 'prj_1',
  name: 'Project',
  apiKey: 'proj_key',
  settings: {},
  reportsCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseIntegration: Integration = {
  id: 'int_1',
  projectId: 'prj_1',
  type: 'github',
  name: 'GitHub',
  config: {
    owner: 'org',
    repo: 'repo',
    accessToken: 'token1234',
  },
  isActive: true,
  usageCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseReport: Report = {
  id: 'rpt_1',
  projectId: 'prj_1',
  title: 'Bug report',
  status: 'open',
  priority: 'medium',
  metadata: {
    url: 'https://example.com',
    browser: { name: 'Chrome', version: '1', userAgent: 'UA' },
    device: { type: 'desktop', os: 'macOS' },
    viewport: { width: 100, height: 100, devicePixelRatio: 1 },
    timestamp: new Date().toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const originalIntegrationsRepo = { ...integrationsRepo };
const originalProjectsRepo = { ...projectsRepo };
const originalReportsRepo = { ...reportsRepo };
const originalFilesRepo = { ...filesRepo };
const originalGithubService = { ...githubService };

let integrationById: Integration | null = baseIntegration;
let integrationsByProject: Integration[] = [baseIntegration];
let createdIntegration: Integration | null = baseIntegration;
let updatedIntegration: Integration | null = baseIntegration;
let projectById: Project | null = baseProject;
let reportById: Report | null = baseReport;
let updateReportPayload: unknown;
let updateLastUsedId: string | null = null;

beforeEach(() => {
  integrationById = baseIntegration;
  integrationsByProject = [baseIntegration];
  createdIntegration = baseIntegration;
  updatedIntegration = baseIntegration;
  projectById = baseProject;
  reportById = baseReport;
  updateReportPayload = undefined;
  updateLastUsedId = null;

  projectsRepo.findById = async () => projectById;
  integrationsRepo.findById = async () => integrationById;
  integrationsRepo.findByProjectId = async () => integrationsByProject;
  integrationsRepo.create = async () => createdIntegration as Integration;
  integrationsRepo.update = async () => updatedIntegration;
  integrationsRepo.delete = async () => true;
  integrationsRepo.updateLastUsed = async (id) => {
    updateLastUsedId = id;
    return true;
  };

  reportsRepo.findById = async () => reportById;
  reportsRepo.update = async (_id, updates) => {
    updateReportPayload = updates;
    return reportById;
  };
  filesRepo.findByReportId = async () => [];

  githubService.testConnection = async () => ({ success: true, repoName: 'org/repo' });
  githubService.createIssue = async () => ({
    success: true,
    issueNumber: 123,
    issueUrl: 'https://github.com/org/repo/issues/123',
  });
});

afterEach(() => {
  Object.assign(integrationsRepo, originalIntegrationsRepo);
  Object.assign(projectsRepo, originalProjectsRepo);
  Object.assign(reportsRepo, originalReportsRepo);
  Object.assign(filesRepo, originalFilesRepo);
  Object.assign(githubService, originalGithubService);
});

describe('integrationsService.create', () => {
  it('rejects missing project', async () => {
    projectById = null;
    const result = await integrationsService.create({
      projectId: 'missing',
      type: 'github',
      name: 'GitHub',
      config: { owner: 'org', repo: 'repo', accessToken: 'token' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid name', async () => {
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: ' ',
      config: { owner: 'org', repo: 'repo', accessToken: 'token' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid config', async () => {
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: 'GitHub',
      config: { owner: '', repo: 'repo', accessToken: 'token' } as never,
    });
    expect(result.success).toBe(false);
  });

  it('masks access token on success', async () => {
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: 'GitHub',
      config: { owner: 'org', repo: 'repo', accessToken: 'token1234' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const config = result.value.config as { accessToken: string };
      expect(config.accessToken).toContain('****');
    }
  });
});

describe('integrationsService.getById/listByProject', () => {
  it('returns NOT_FOUND when missing', async () => {
    integrationById = null;
    const result = await integrationsService.getById('missing');
    expect(result.success).toBe(false);
  });

  it('lists masked integrations', async () => {
    const result = await integrationsService.listByProject('prj_1');
    expect(result.success).toBe(true);
  });
});

describe('integrationsService.update/delete', () => {
  it('rejects missing integration', async () => {
    integrationById = null;
    const result = await integrationsService.update('missing', { name: 'New' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid config', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: '', repo: 'repo', accessToken: 'token' } as never,
    });
    expect(result.success).toBe(false);
  });

  it('updates integration', async () => {
    const result = await integrationsService.update('int_1', { name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('deletes integration', async () => {
    const result = await integrationsService.delete('int_1');
    expect(result.success).toBe(true);
  });
});

describe('integrationsService.testConnection', () => {
  it('returns NOT_FOUND when missing', async () => {
    integrationById = null;
    const result = await integrationsService.testConnection('missing');
    expect(result.success).toBe(false);
  });

  it('returns NOT_IMPLEMENTED for unsupported types', async () => {
    integrationById = { ...baseIntegration, type: 'jira' };
    const result = await integrationsService.testConnection('int_1');
    expect(result.success).toBe(false);
  });

  it('returns github test result', async () => {
    const result = await integrationsService.testConnection('int_1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.success).toBe(true);
    }
  });
});

describe('integrationsService.forwardReport', () => {
  it('rejects missing integration', async () => {
    integrationById = null;
    const result = await integrationsService.forwardReport('rpt_1', 'missing');
    expect(result.success).toBe(false);
  });

  it('rejects disabled integration', async () => {
    integrationById = { ...baseIntegration, isActive: false };
    const result = await integrationsService.forwardReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
  });

  it('rejects missing report', async () => {
    reportById = null;
    const result = await integrationsService.forwardReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
  });

  it('rejects project mismatch', async () => {
    reportById = { ...baseReport, projectId: 'prj_other' };
    const result = await integrationsService.forwardReport('rpt_1', 'int_1');
    expect(result.success).toBe(false);
  });

  it('forwards report to github and updates usage', async () => {
    const result = await integrationsService.forwardReport('rpt_1', 'int_1', {
      labels: ['bug'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.type).toBe('github');
      expect(updateLastUsedId).toBe('int_1');
      expect(updateReportPayload).toBeTruthy();
    }
  });
});
