import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  createGitHubIssue,
  testGitHubConnection,
  fetchGitHubRepositories,
  fetchGitHubLabels,
  fetchGitHubAssignees,
  updateGitHubIssue,
  getGitHubIssue,
  createGitHubWebhook,
  deleteGitHubWebhook,
} from '../../../src/server/services/integrations/github.service';
import { settingsRepo } from '../../../src/server/database/repositories/settings.repo';
import { logger } from '../../../src/server/utils/logger';
import type { Report } from '../../../src/shared/types';

const originalFetch = globalThis.fetch;
const originalSettingsRepo = { ...settingsRepo };
const originalLogger = { ...logger };

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

beforeEach(() => {
  settingsRepo.getAll = async () => ({ appUrl: 'https://app.example.com' }) as never;
  logger.info = () => undefined;
  logger.error = () => undefined;
  logger.warn = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
});

describe('github service', () => {
  it('rejects create issue with missing config', async () => {
    const result = await createGitHubIssue(baseReport, {
      owner: '',
      repo: 'repo',
      accessToken: '',
    });
    expect(result.success).toBe(false);
  });

  it('creates GitHub issue with merged labels', async () => {
    let requestBody: Record<string, unknown> | null = null;
    globalThis.fetch = async (_url, init) => {
      requestBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ number: 123, html_url: 'https://github.com/org/repo/issues/123' }),
        { status: 201 },
      );
    };

    const result = await createGitHubIssue(
      baseReport,
      { owner: 'org', repo: 'repo', accessToken: 'token', labels: ['bug'] },
      { labels: ['ui'], assignees: ['octo'] },
    );

    expect(result.success).toBe(true);
    expect(requestBody).toMatchObject({
      labels: ['bug', 'ui'],
      assignees: ['octo'],
    });
  });

  it('returns error when create GitHub issue fails', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Bad request' }), { status: 400 });

    const result = await createGitHubIssue(baseReport, {
      owner: 'org',
      repo: 'repo',
      accessToken: 'token',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bad request');
  });

  it('returns error for missing repo access', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });
    const result = await testGitHubConnection({ owner: 'org', repo: 'repo', accessToken: 'token' });
    expect(result.success).toBe(false);
  });

  it('returns error for invalid access token', async () => {
    globalThis.fetch = async () => new Response('', { status: 401 });
    const result = await testGitHubConnection({ owner: 'org', repo: 'repo', accessToken: 'token' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid access token');
  });

  it('rejects repository fetch without access token', async () => {
    const result = await fetchGitHubRepositories('');
    expect(result.success).toBe(false);
  });

  it('returns error when repository fetch fails', async () => {
    globalThis.fetch = async () => new Response('', { status: 401 });
    const result = await fetchGitHubRepositories('token');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid access token');
  });

  it('fetches repositories with pagination', async () => {
    const responses = [
      new Response(
        JSON.stringify([
          { name: 'one', full_name: 'org/one', owner: { login: 'org' }, private: false },
        ]),
        {
          status: 200,
          headers: new Headers({ Link: '<https://api.github.com/user/repos?page=2>; rel="next"' }),
        },
      ),
      new Response(JSON.stringify([]), { status: 200 }),
    ];

    globalThis.fetch = async () => responses.shift() as Response;

    const result = await fetchGitHubRepositories('token');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.repositories).toHaveLength(1);
      expect(result.repositories?.[0].fullName).toBe('org/one');
    }
  });

  it('fetches labels', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify([{ name: 'bug', color: 'ff0000', description: null }]), {
        status: 200,
      });

    const result = await fetchGitHubLabels('token', 'org', 'repo');
    expect(result.success).toBe(true);
  });

  it('returns error when labels fetch fails', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });
    const result = await fetchGitHubLabels('token', 'org', 'repo');
    expect(result.success).toBe(false);
  });

  it('fetches assignees', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([{ login: 'octo', avatar_url: 'https://example.com/octo.png' }]),
        { status: 200 },
      );

    const result = await fetchGitHubAssignees('token', 'org', 'repo');
    expect(result.success).toBe(true);
  });

  it('returns error when assignee fetch fails', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });
    const result = await fetchGitHubAssignees('token', 'org', 'repo');
    expect(result.success).toBe(false);
  });

  it('updates GitHub issue', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ number: 321, html_url: 'https://github.com/org/repo/issues/321' }),
        { status: 200 },
      );

    const result = await updateGitHubIssue(321, baseReport, {
      owner: 'org',
      repo: 'repo',
      accessToken: 'token',
    });

    expect(result.success).toBe(true);
  });

  it('returns error when update GitHub issue fails', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Nope' }), { status: 500 });

    const result = await updateGitHubIssue(321, baseReport, {
      owner: 'org',
      repo: 'repo',
      accessToken: 'token',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Nope');
  });

  it('gets GitHub issue', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          number: 321,
          state: 'open',
          title: 'Issue',
          body: 'Body',
          html_url: 'https://github.com/org/repo/issues/321',
        }),
        { status: 200 },
      );

    const result = await getGitHubIssue(321, {
      owner: 'org',
      repo: 'repo',
      accessToken: 'token',
    });

    expect(result.success).toBe(true);
  });

  it('returns error when issue is missing', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });

    const result = await getGitHubIssue(321, {
      owner: 'org',
      repo: 'repo',
      accessToken: 'token',
    });

    expect(result.success).toBe(false);
  });

  it('creates webhook', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 42 }), { status: 201 });

    const result = await createGitHubWebhook(
      { owner: 'org', repo: 'repo', accessToken: 'token' },
      'https://app.example.com/api/webhooks/github/int_1',
      'secret',
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.webhookId).toBe('42');
    }
  });

  it('returns error when webhook already exists', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'exists' }), { status: 422 });

    const result = await createGitHubWebhook(
      { owner: 'org', repo: 'repo', accessToken: 'token' },
      'https://app.example.com/api/webhooks/github/int_1',
      'secret',
    );

    expect(result.success).toBe(false);
  });

  it('deletes webhook gracefully on 404', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });

    const result = await deleteGitHubWebhook(
      { owner: 'org', repo: 'repo', accessToken: 'token' },
      '42',
    );

    expect(result.success).toBe(true);
  });

  it('returns error when webhook delete fails', async () => {
    globalThis.fetch = async () => new Response('', { status: 500 });

    const result = await deleteGitHubWebhook(
      { owner: 'org', repo: 'repo', accessToken: 'token' },
      '42',
    );

    expect(result.success).toBe(false);
  });
});
