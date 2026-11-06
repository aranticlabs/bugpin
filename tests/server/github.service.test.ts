import { getEEHooks, registerEEHooks } from '../../src/server/utils/ee-hooks';
import { Result } from '../../src/server/utils/result';
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
} from '../../src/server/services/integrations/github.service';
import { settingsRepo } from '../../src/server/database/repositories/settings.repo';
import { logger } from '../../src/server/utils/logger';
import type { FileRecord, Report } from '../../src/shared/types';

const originalHooks = getEEHooks();
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
  registerEEHooks({
    ...originalHooks,
    getStorageProvider: () => ({
      acceptsUploads: () => true,
      read: async () => Result.ok(new Uint8Array([1, 2, 3])),
      upload: async () => Result.fail('unused'),
      delete: async () => Result.ok(undefined),
      exists: async () => Result.ok(true),
      testConnection: async () => Result.ok(undefined),
      getStatus: async () => Result.ok({ enabled: true, configured: true }),
    }),
  });
  settingsRepo.getAll = async () => ({ appUrl: 'https://app.example.com' }) as never;
  logger.info = () => undefined;
  logger.error = () => undefined;
  logger.warn = () => undefined;
  logger.debug = () => undefined;
});

afterEach(() => {
  registerEEHooks(originalHooks);
  globalThis.fetch = originalFetch;
  Object.assign(settingsRepo, originalSettingsRepo);
  Object.assign(logger, originalLogger);
});

describe('github service', () => {
  for (const operation of ['create', 'update'] as const) {
    for (const exists of [false, true]) {
      it(`${operation} uses durable links for ${exists ? 'existing' : 'new'} uploaded files`, async () => {
        const files: FileRecord[] = [
          { type: 'screenshot', filename: 'screenshot.png', mimeType: 'image/png' },
          { type: 'attachment', filename: 'image.png', mimeType: 'image/png' },
          { type: 'attachment', filename: 'log.txt', mimeType: 'text/plain' },
        ].map((file, index) => ({
          ...file,
          type: file.type as FileRecord['type'],
          id: `file_${index}`,
          reportId: baseReport.id,
          path: `https://storage.example.com/${file.filename}`,
          sizeBytes: 3,
          createdAt: baseReport.createdAt,
        }));
        let issueBody = '';
        let uploads = 0;
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          if (url.startsWith('https://storage.example.com/')) return new Response('abc');
          if (url.includes('/contents/')) {
            const path = url.split('/contents/')[1];
            const content = {
              html_url: `https://github.com/org/repo/blob/develop/${path}`,
              download_url: `https://raw.githubusercontent.com/org/repo/develop/${path}?token=temporary`,
            };
            if (init?.method === 'PUT') {
              uploads++;
              return Response.json({ content }, { status: 201 });
            }
            return exists ? Response.json(content) : new Response('', { status: 404 });
          }
          if (url.includes('/issues')) {
            expect(init?.method).toBe(operation === 'create' ? 'POST' : 'PATCH');
            issueBody = (JSON.parse(init?.body as string) as { body: string }).body;
            return Response.json({
              number: 123,
              html_url: 'https://github.com/org/repo/issues/123',
            });
          }
          throw new Error(`Unexpected request: ${url}`);
        };
        const config = {
          owner: 'org',
          repo: 'repo',
          accessToken: 'token',
          fileTransferMode: 'upload' as const,
        };
        const report = { ...baseReport, files };
        const result =
          operation === 'create'
            ? await createGitHubIssue(report, config)
            : await updateGitHubIssue(123, report, config);

        expect(result.success).toBe(true);
        expect(uploads).toBe(exists ? 0 : files.length);
        for (const file of files) {
          expect(issueBody).toContain(
            `${file.mimeType.startsWith('image/') ? '!' : ''}[${file.filename}](https://github.com/org/repo/blob/develop/.bugpin/files/${baseReport.id}/${file.filename}${file.mimeType.startsWith('image/') ? '?raw=1' : ''})`
          );
        }
        expect(issueBody).not.toContain('![log.txt]');
        expect(issueBody).not.toContain('raw.githubusercontent.com');
        expect(issueBody).not.toContain('token=');
      });
    }
  }

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
        { status: 201 }
      );
    };

    const result = await createGitHubIssue(
      baseReport,
      { owner: 'org', repo: 'repo', accessToken: 'token', labels: ['bug'] },
      { labels: ['ui'], assignees: ['octo'] }
    );

    expect(result.success).toBe(true);
    expect(requestBody).toMatchObject({
      labels: ['bug', 'ui'],
      assignees: ['octo'],
    });
  });

  it('includes stored activity in GitHub issues', async () => {
    let issueBody = '';
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(init?.body as string) as { body: string };
      issueBody = request.body;
      return new Response(
        JSON.stringify({ number: 123, html_url: 'https://github.com/org/repo/issues/123' }),
        { status: 201 }
      );
    };

    await createGitHubIssue(
      {
        ...baseReport,
        metadata: {
          ...baseReport.metadata,
          userActivity: [
            { type: 'button', text: 'Sensitive action', timestamp: new Date().toISOString() },
          ],
        },
      },
      { owner: 'org', repo: 'repo', accessToken: 'token' }
    );

    expect(issueBody).toContain('User Activity Trail');
    expect(issueBody).toContain('Sensitive action');
  });

  for (const publicVideoLinks of [false, true]) {
    it(`${publicVideoLinks ? 'includes' : 'does not include'} public video links in GitHub issues`, async () => {
      let issueBody = '';
      globalThis.fetch = async (_url, init) => {
        issueBody = (JSON.parse(init?.body as string) as { body: string }).body;
        return Response.json({
          number: 123,
          html_url: 'https://github.com/org/repo/issues/123',
        });
      };
      const files: FileRecord[] = [
        {
          id: 'video_1',
          reportId: baseReport.id,
          type: 'screenshot',
          filename: 'recording.mp4',
          path: '/recording.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 10,
          createdAt: baseReport.createdAt,
        },
        {
          id: 'video_2',
          reportId: baseReport.id,
          type: 'attachment',
          filename: 'upload.webm',
          path: '/upload.webm',
          mimeType: 'video/webm',
          sizeBytes: 10,
          createdAt: baseReport.createdAt,
        },
      ];

      await createGitHubIssue(
        { ...baseReport, files },
        { owner: 'org', repo: 'repo', accessToken: 'token', publicVideoLinks }
      );

      if (publicVideoLinks) {
        expect(issueBody).toContain(
          `https://app.example.com/api/public/files/${baseReport.id}/recording.mp4`
        );
        expect(issueBody).toContain(
          `https://app.example.com/api/public/files/${baseReport.id}/upload.webm`
        );
        expect(issueBody).not.toContain('Video attached:');
      } else {
        expect(issueBody).toContain(
          `[Video attached: recording.mp4](https://app.example.com/admin/reports/${baseReport.id})`
        );
        expect(issueBody).toContain(
          `[Video attached: upload.webm](https://app.example.com/admin/reports/${baseReport.id})`
        );
        expect(issueBody).not.toContain('/api/public/files/');
      }
    });
  }

  it('treats a non-boolean public video setting as disabled', async () => {
    let issueBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      issueBody = (JSON.parse(init?.body as string) as { body: string }).body;
      return Response.json({ number: 123, html_url: 'https://github.com/org/repo/issues/123' });
    }) as typeof fetch;
    const files: FileRecord[] = [
      {
        id: 'video_1',
        reportId: baseReport.id,
        type: 'screenshot',
        filename: 'recording.mp4',
        path: '/recording.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 10,
        createdAt: baseReport.createdAt,
      },
    ];
    const storedConfig = JSON.parse(
      '{"owner":"org","repo":"repo","accessToken":"token","publicVideoLinks":"false"}'
    ) as Parameters<typeof createGitHubIssue>[1];

    await createGitHubIssue({ ...baseReport, files }, storedConfig);

    expect(issueBody).toContain(
      `[Video attached: recording.mp4](https://app.example.com/admin/reports/${baseReport.id})`
    );
    expect(issueBody).not.toContain('/api/public/files/');
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
        }
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
        { status: 200 }
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
        { status: 200 }
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
        { status: 200 }
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
      'secret'
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
      'secret'
    );

    expect(result.success).toBe(false);
  });

  it('deletes webhook gracefully on 404', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 });

    const result = await deleteGitHubWebhook(
      { owner: 'org', repo: 'repo', accessToken: 'token' },
      '42'
    );

    expect(result.success).toBe(true);
  });

  it('returns error when webhook delete fails', async () => {
    globalThis.fetch = async () => new Response('', { status: 500 });

    const result = await deleteGitHubWebhook(
      { owner: 'org', repo: 'repo', accessToken: 'token' },
      '42'
    );

    expect(result.success).toBe(false);
  });
});
