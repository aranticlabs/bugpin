import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { integrationsService } from '../../src/server/services/integrations.service';
import { integrationsRepo } from '../../src/server/database/repositories/integrations.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { githubService } from '../../src/server/services/integrations/github.service';
import { jiraService } from '../../src/server/services/integrations/jira.service';
import type { Integration, Project, Report, JiraIntegrationConfig } from '../../src/shared/types';

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
const originalJiraService = { ...jiraService };

const jiraConfig: JiraIntegrationConfig = {
  deployment: 'cloud',
  domain: 'acme.atlassian.net',
  email: 'dev@acme.com',
  apiToken: 'jira-token-1234',
  projectKey: 'BUG',
  issueType: 'Bug',
};

const jiraIntegration: Integration = {
  id: 'int_jira',
  projectId: 'prj_1',
  type: 'jira',
  name: 'Jira',
  config: jiraConfig,
  isActive: true,
  usageCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let integrationById: Integration | null = baseIntegration;
let integrationsByProject: Integration[] = [baseIntegration];
let createdIntegration: Integration | null = baseIntegration;
let updatedIntegration: Integration | null = baseIntegration;
let projectById: Project | null = baseProject;
let reportById: Report | null = baseReport;
let updateReportPayload: unknown;
let updateIntegrationPayload: Partial<Integration> | null = null;
let updateLastUsedId: string | null = null;

beforeEach(() => {
  integrationById = baseIntegration;
  integrationsByProject = [baseIntegration];
  createdIntegration = baseIntegration;
  updatedIntegration = baseIntegration;
  projectById = baseProject;
  reportById = baseReport;
  updateReportPayload = undefined;
  updateIntegrationPayload = null;
  updateLastUsedId = null;

  projectsRepo.findById = async () => projectById;
  integrationsRepo.findById = async () => integrationById;
  integrationsRepo.findByProjectId = async () => integrationsByProject;
  integrationsRepo.create = async () => createdIntegration as Integration;
  integrationsRepo.update = async (_id, updates) => {
    updateIntegrationPayload = updates as Partial<Integration>;
    return updatedIntegration;
  };
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
  Object.assign(jiraService, originalJiraService);
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

  it('preserves the stored token when the masked value is sent back (github)', async () => {
    // Client only ever sees the masked token and sends it back unchanged.
    const maskedToken = 'toke****1234';
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo', accessToken: maskedToken } as never,
    });
    expect(result.success).toBe(true);
    const savedConfig = updateIntegrationPayload?.config as { accessToken: string };
    expect(savedConfig.accessToken).toBe('token1234'); // original, not the mask
  });

  it('preserves the stored apiToken when an empty value is sent (jira)', async () => {
    integrationById = jiraIntegration;
    const result = await integrationsService.update('int_jira', {
      config: { ...jiraConfig, apiToken: '' } as never,
    });
    expect(result.success).toBe(true);
    const savedConfig = updateIntegrationPayload?.config as { apiToken: string };
    expect(savedConfig.apiToken).toBe('jira-token-1234');
  });

  it('updates the token when a new value is provided', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo', accessToken: 'brand-new-token' } as never,
    });
    expect(result.success).toBe(true);
    const savedConfig = updateIntegrationPayload?.config as { accessToken: string };
    expect(savedConfig.accessToken).toBe('brand-new-token');
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
    integrationById = { ...baseIntegration, type: 'slack' };
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

  it('forwards report to jira', async () => {
    integrationById = jiraIntegration;
    jiraService.createIssue = async () => ({
      success: true,
      issueKey: 'BUG-42',
      issueUrl: 'https://acme.atlassian.net/browse/BUG-42',
    });

    const result = await integrationsService.forwardReport('rpt_1', 'int_jira');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.type).toBe('jira');
      expect(result.value.id).toBe('BUG-42');
      expect(updateLastUsedId).toBe('int_jira');
    }
  });
});

describe('integrationsService.autoForwardNewReport', () => {
  it('forwards to jira integrations with autoForward enabled', async () => {
    const autoIntegration: Integration = {
      ...jiraIntegration,
      config: { ...jiraConfig, autoForward: true },
    };
    integrationsByProject = [autoIntegration];
    integrationById = autoIntegration;

    let created = false;
    jiraService.createIssue = async () => {
      created = true;
      return { success: true, issueKey: 'BUG-1', issueUrl: 'https://acme/browse/BUG-1' };
    };

    await integrationsService.autoForwardNewReport('rpt_1', 'prj_1');
    expect(created).toBe(true);
    expect(updateLastUsedId).toBe('int_jira');
  });

  it('does not forward when autoForward is disabled', async () => {
    integrationsByProject = [jiraIntegration]; // autoForward undefined

    let created = false;
    jiraService.createIssue = async () => {
      created = true;
      return { success: true, issueKey: 'BUG-1' };
    };

    await integrationsService.autoForwardNewReport('rpt_1', 'prj_1');
    expect(created).toBe(false);
  });

  it('skips inactive integrations even when autoForward is enabled', async () => {
    integrationsByProject = [
      { ...jiraIntegration, isActive: false, config: { ...jiraConfig, autoForward: true } },
    ];

    let created = false;
    jiraService.createIssue = async () => {
      created = true;
      return { success: true, issueKey: 'BUG-1' };
    };

    await integrationsService.autoForwardNewReport('rpt_1', 'prj_1');
    expect(created).toBe(false);
  });
});
