import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { integrationsService } from '../../src/server/services/integrations.service';
import { integrationsRepo } from '../../src/server/database/repositories/integrations.repo';
import { projectsRepo } from '../../src/server/database/repositories/projects.repo';
import { reportsRepo } from '../../src/server/database/repositories/reports.repo';
import { filesRepo } from '../../src/server/database/repositories/files.repo';
import { githubService } from '../../src/server/services/integrations/github.service';
import type { Integration, IntegrationConfig, Project, Report } from '../../src/shared/types';

const baseProject: Project = {
  isActive: true,
  position: 0,
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
  reporterLocale: 'en',
  source: 'widget',
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

  it('rejects a non-boolean public video setting', async () => {
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: 'GitHub',
      config: {
        owner: 'org',
        repo: 'repo',
        accessToken: 'token',
        publicVideoLinks: 'false',
      } as never,
    });
    expect(result).toEqual({
      success: false,
      error: 'Public video links must be true or false',
      code: 'INVALID_CONFIG',
    });
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

describe('integrationsService.update config merge', () => {
  const storedToken = 'ghp_realtoken1234abcd';
  const storedGithub: Integration = {
    ...baseIntegration,
    config: {
      owner: 'org',
      repo: 'repo',
      accessToken: storedToken,
      labels: ['bug'],
      syncMode: 'automatic',
      webhookId: '42',
      webhookSecret: 'whsec_stored',
    },
  };

  let persistedConfig: IntegrationConfig | undefined;

  beforeEach(() => {
    integrationById = storedGithub;
    persistedConfig = undefined;
    integrationsRepo.update = async (_id, updates) => {
      persistedConfig = updates.config;
      return { ...storedGithub, ...updates };
    };
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['the masked form', 'ghp_****abcd'],
    ['the masked form with surrounding spaces', ' ghp_****abcd '],
    ['the short masked form', '****'],
  ])('keeps the stored token when the incoming token is %s', async (_label, accessToken) => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo', accessToken },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({ accessToken: storedToken });
  });

  it('replaces the stored token when a new token is provided', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo', accessToken: 'ghp_newtoken9999' },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({ accessToken: 'ghp_newtoken9999' });
  });

  it('returns the updated integration with a masked token', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const config = result.value.config as { accessToken: string };
      expect(config.accessToken).toBe('ghp_****abcd');
      expect(result.value.config).not.toHaveProperty('webhookSecret');
    }
  });

  it('preserves sync mode and webhook fields that the update omits', async () => {
    const result = await integrationsService.update('int_1', {
      name: 'Renamed',
      config: { owner: 'org', repo: 'repo', labels: ['ui'] },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({
      syncMode: 'automatic',
      webhookId: '42',
      webhookSecret: 'whsec_stored',
      labels: ['ui'],
    });
  });

  it('ignores sync mode and webhook fields sent by the client', async () => {
    const result = await integrationsService.update('int_1', {
      config: {
        owner: 'org',
        repo: 'repo',
        syncMode: 'manual',
        webhookId: '999',
        webhookSecret: 'attacker',
      },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({
      syncMode: 'automatic',
      webhookId: '42',
      webhookSecret: 'whsec_stored',
    });
  });

  it('does not add sync fields that the stored config does not have', async () => {
    integrationById = baseIntegration;
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo', syncMode: 'automatic', webhookId: '1' },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).not.toHaveProperty('syncMode');
    expect(persistedConfig).not.toHaveProperty('webhookId');
  });

  it('rejects moving an automatically synced integration to another repository', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'other-repo' },
    });
    expect(result).toEqual({
      success: false,
      error: 'Switch to manual sync before changing the repository',
      code: 'SYNC_ACTIVE',
    });
    expect(persistedConfig).toBeUndefined();
  });

  it('treats repository names case-insensitively for synced integrations', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'Org', repo: 'Repo' },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({ owner: 'Org', repo: 'Repo' });
  });

  it('allows changing the repository of a manually synced integration', async () => {
    integrationById = baseIntegration;
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'other-repo' },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({ repo: 'other-repo', accessToken: 'token1234' });
  });

  it('lets the client clear optional non-secret fields by omitting them', async () => {
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo' },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).not.toHaveProperty('labels');
  });

  it('rejects a masked token when no token is stored', async () => {
    integrationById = {
      ...baseIntegration,
      config: { owner: 'org', repo: 'repo', accessToken: '' },
    };
    const result = await integrationsService.update('int_1', {
      config: { owner: 'org', repo: 'repo', accessToken: 'ghp_****abcd' },
    });
    expect(result).toEqual({
      success: false,
      error: 'GitHub access token is required',
      code: 'INVALID_CONFIG',
    });
    expect(persistedConfig).toBeUndefined();
  });

  it('keeps the stored Jira API token when the incoming token is masked', async () => {
    integrationById = {
      ...baseIntegration,
      type: 'jira',
      config: {
        domain: 'acme.atlassian.net',
        email: 'dev@example.com',
        apiToken: 'jira-secret-token',
        projectKey: 'BUG',
        issueType: 'Bug',
      },
    };
    const result = await integrationsService.update('int_1', {
      config: {
        domain: 'acme.atlassian.net',
        email: 'dev@example.com',
        apiToken: 'jira****oken',
        projectKey: 'OPS',
        issueType: 'Bug',
      },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({ apiToken: 'jira-secret-token', projectKey: 'OPS' });
  });

  it('keeps the stored Slack webhook URL when the incoming URL is masked', async () => {
    integrationById = {
      ...baseIntegration,
      type: 'slack',
      config: { webhookUrl: 'https://hooks.slack.com/services/T/B/secret', notifyOn: [] },
    };
    const result = await integrationsService.update('int_1', {
      config: { webhookUrl: 'http****cret', notifyOn: ['report.created'] },
    });
    expect(result.success).toBe(true);
    expect(persistedConfig).toMatchObject({
      webhookUrl: 'https://hooks.slack.com/services/T/B/secret',
      notifyOn: ['report.created'],
    });
  });
});

describe('integrationsService.create masked secrets', () => {
  it('rejects a masked access token', async () => {
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: 'GitHub',
      config: { owner: 'org', repo: 'repo', accessToken: 'ghp_****abcd' },
    });
    expect(result).toEqual({
      success: false,
      error: 'Secrets must not be masked values',
      code: 'INVALID_CONFIG',
    });
  });

  it('rejects a masked access token surrounded by whitespace', async () => {
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: 'GitHub',
      config: { owner: 'org', repo: 'repo', accessToken: ' ghp_****abcd ' },
    });
    expect(result.success).toBe(false);
  });
});

describe('integrationsService.create sync fields', () => {
  it('does not store sync mode or webhook fields sent by the client', async () => {
    let createdConfig: IntegrationConfig | undefined;
    integrationsRepo.create = async (data) => {
      createdConfig = data.config;
      return createdIntegration as Integration;
    };
    const result = await integrationsService.create({
      projectId: 'prj_1',
      type: 'github',
      name: 'GitHub',
      config: {
        owner: 'org',
        repo: 'repo',
        accessToken: 'ghp_realtoken1234abcd',
        syncMode: 'automatic',
        webhookId: '1',
        webhookSecret: 'whsec_client',
      },
    });
    expect(result.success).toBe(true);
    expect(createdConfig).toMatchObject({ owner: 'org', repo: 'repo' });
    expect(createdConfig).not.toHaveProperty('syncMode');
    expect(createdConfig).not.toHaveProperty('webhookId');
    expect(createdConfig).not.toHaveProperty('webhookSecret');
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
