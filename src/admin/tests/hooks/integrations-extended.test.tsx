import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { toast } from 'sonner';
import {
  useIntegration,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
  useTestIntegration,
  useForwardReport,
  useFetchGitHubRepos,
  useFetchGitHubLabels,
  useFetchGitHubAssignees,
  useSetSyncMode,
} from '../../hooks/useIntegrations';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('integration hooks extra coverage', () => {
  it('fetches a single integration', async () => {
    server.use(
      http.get('/api/integrations/:id', ({ params }) => {
        return HttpResponse.json({
          success: true,
          integration: {
            id: params.id,
            projectId: 'project-1',
            type: 'github',
            name: 'Repo',
            isActive: true,
            config: { owner: 'org', repo: 'repo', accessToken: 'token' },
            createdAt: '2024-01-10T10:00:00Z',
            updatedAt: '2024-01-10T10:00:00Z',
          },
        });
      }),
    );

    const { result } = renderHook(() => useIntegration('integration-9'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.id).toBe('integration-9');
    expect(result.current.data?.name).toBe('Repo');
  });

  it('creates, updates, and deletes integrations with toasts', async () => {
    server.use(
      http.post('/api/integrations', async ({ request }) => {
        const body = (await request.json()) as {
          projectId: string;
          type: string;
          name: string;
          config: Record<string, unknown>;
        };
        return HttpResponse.json({
          success: true,
          integration: {
            id: 'integration-new',
            projectId: body.projectId,
            type: body.type,
            name: body.name,
            isActive: true,
            config: body.config,
            createdAt: '2024-01-10T10:00:00Z',
            updatedAt: '2024-01-10T10:00:00Z',
          },
        });
      }),
      http.patch('/api/integrations/:id', async ({ params, request }) => {
        const body = (await request.json()) as { name?: string; config?: Record<string, unknown> };
        return HttpResponse.json({
          success: true,
          integration: {
            id: params.id,
            projectId: 'project-1',
            type: 'github',
            name: body.name ?? 'Updated',
            isActive: true,
            config: body.config ?? { owner: 'org', repo: 'repo', accessToken: 'token' },
            createdAt: '2024-01-10T10:00:00Z',
            updatedAt: '2024-01-11T10:00:00Z',
          },
        });
      }),
      http.delete('/api/integrations/:id', () => HttpResponse.json({ success: true })),
    );

    const createHook = renderHook(() => useCreateIntegration(), { wrapper: createWrapper() });
    createHook.result.current.mutate({
      projectId: 'project-1',
      type: 'github',
      name: 'New Repo',
      config: { owner: 'org', repo: 'repo', accessToken: 'token' },
    });

    await waitFor(() => expect(createHook.result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Integration created successfully');

    const updateHook = renderHook(() => useUpdateIntegration(), { wrapper: createWrapper() });
    updateHook.result.current.mutate({
      id: 'integration-new',
      data: { name: 'Updated Repo' },
    });

    await waitFor(() => expect(updateHook.result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Integration updated successfully');

    const deleteHook = renderHook(() => useDeleteIntegration(), { wrapper: createWrapper() });
    deleteHook.result.current.mutate('integration-new');

    await waitFor(() => expect(deleteHook.result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Integration deleted successfully');
  });

  it('tests integration connection with success and error toasts', async () => {
    server.use(
      http.post('/api/integrations/:id/test', () => {
        return HttpResponse.json({
          success: true,
          result: { success: true },
        });
      }),
    );

    const { result } = renderHook(() => useTestIntegration(), { wrapper: createWrapper() });
    result.current.mutate('integration-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Connection test successful');

    server.use(
      http.post('/api/integrations/:id/test', () => {
        return HttpResponse.json({
          success: true,
          result: { success: false, error: 'Bad token' },
        });
      }),
    );

    result.current.mutate('integration-2');

    await waitFor(() => expect(result.current.data?.success).toBe(false));
    expect(toast.error).toHaveBeenCalledWith('Bad token');
  });

  it('forwards a report and shows a toast', async () => {
    server.use(
      http.post('/api/reports/:reportId/forward/:integrationId', async ({ request }) => {
        const body = (await request.json()) as { labels?: string[] };
        return HttpResponse.json({
          success: true,
          result: {
            type: 'github',
            id: 'issue-1',
            url: 'https://github.com/org/repo/issues/1',
            labels: body.labels ?? [],
          },
        });
      }),
    );

    const { result } = renderHook(() => useForwardReport(), { wrapper: createWrapper() });
    result.current.mutate({
      reportId: 'report-1',
      integrationId: 'integration-1',
      options: { labels: ['bug'] },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('Report forwarded to github successfully');
  });

  it('fetches GitHub repositories, labels, and assignees', async () => {
    server.use(
      http.post('/api/integrations/github/repositories', async ({ request }) => {
        const body = (await request.json()) as { accessToken: string };
        if (body.accessToken !== 'token') {
          return HttpResponse.json({ message: 'Invalid token' }, { status: 400 });
        }
        return HttpResponse.json({
          success: true,
          repositories: [{ owner: 'org', name: 'repo', fullName: 'org/repo', private: false }],
        });
      }),
      http.post('/api/integrations/github/labels', () => {
        return HttpResponse.json({
          success: true,
          labels: [{ name: 'bug', color: 'ff0000', description: null }],
        });
      }),
      http.post('/api/integrations/github/assignees', () => {
        return HttpResponse.json({
          success: true,
          assignees: [{ login: 'octo', avatarUrl: 'https://example.com/1.png' }],
        });
      }),
    );

    const reposHook = renderHook(() => useFetchGitHubRepos(), { wrapper: createWrapper() });
    const repos = await reposHook.result.current.mutateAsync('token');
    expect(repos[0]?.fullName).toBe('org/repo');

    const labelsHook = renderHook(() => useFetchGitHubLabels(), { wrapper: createWrapper() });
    const labels = await labelsHook.result.current.mutateAsync({
      accessToken: 'token',
      owner: 'org',
      repo: 'repo',
    });
    expect(labels[0]?.name).toBe('bug');

    const assigneesHook = renderHook(() => useFetchGitHubAssignees(), { wrapper: createWrapper() });
    const assignees = await assigneesHook.result.current.mutateAsync({
      accessToken: 'token',
      owner: 'org',
      repo: 'repo',
    });
    expect(assignees[0]?.login).toBe('octo');

    reposHook.result.current.mutate('bad-token');
    await waitFor(() => expect(reposHook.result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalledWith('Invalid token');
  });

  it('suppresses toast for CONFIG_ERROR when setting sync mode', async () => {
    server.use(
      http.post('/api/integrations/:id/sync-mode', () => {
        return HttpResponse.json(
          { success: false, error: 'CONFIG_ERROR', message: 'Missing config' },
          { status: 400 },
        );
      }),
    );

    const { result } = renderHook(() => useSetSyncMode(), { wrapper: createWrapper() });
    result.current.mutate({ id: 'integration-1', syncMode: 'automatic' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
