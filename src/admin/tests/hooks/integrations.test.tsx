import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import {
  useIntegrations,
  useSetSyncMode,
  useSyncStatus,
  useSyncExistingReports,
} from '../../hooks/useIntegrations';

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

describe('useIntegrations hook', () => {
  it('fetches integrations for a project', async () => {
    const { result } = renderHook(() => useIntegrations('project-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.length).toBeGreaterThan(0);
  });

  it('returns empty array when no project ID', async () => {
    const { result } = renderHook(() => useIntegrations(undefined), { wrapper: createWrapper() });

    // Query is disabled when no projectId, so data should be undefined initially
    // and fetchStatus should be idle
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});

describe('useSetSyncMode hook', () => {
  it('sets sync mode to automatic', async () => {
    const { result } = renderHook(() => useSetSyncMode(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'integration-1', syncMode: 'automatic' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.syncMode).toBe('automatic');
  });

  it('sets sync mode to manual', async () => {
    const { result } = renderHook(() => useSetSyncMode(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'integration-1', syncMode: 'manual' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.syncMode).toBe('manual');
  });

  it('returns unsynced count when enabling automatic', async () => {
    server.use(
      http.post('/api/integrations/:id/sync-mode', () => {
        return HttpResponse.json({
          success: true,
          syncMode: 'automatic',
          unsyncedCount: 10,
        });
      }),
    );

    const { result } = renderHook(() => useSetSyncMode(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'integration-1', syncMode: 'automatic' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.unsyncedCount).toBe(10);
  });
});

describe('useSyncStatus hook', () => {
  it('fetches sync status for an integration', async () => {
    const { result } = renderHook(() => useSyncStatus('integration-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.syncMode).toBe('manual');
    expect(result.current.data?.unsyncedCount).toBe(5);
  });

  it('returns null when no integration ID', async () => {
    const { result } = renderHook(() => useSyncStatus(undefined), { wrapper: createWrapper() });

    // Query should be disabled
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useSyncExistingReports hook', () => {
  it('syncs all existing reports', async () => {
    const { result } = renderHook(() => useSyncExistingReports(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'integration-1', reportIds: 'all' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.queued).toBe(5);
    expect(result.current.data?.message).toContain('5 reports');
  });

  it('syncs specific reports', async () => {
    server.use(
      http.post('/api/integrations/:id/sync-existing', async ({ request }) => {
        const body = (await request.json()) as { reportIds: string[] };
        return HttpResponse.json({
          success: true,
          message: `Queued ${body.reportIds.length} reports for sync`,
          queued: body.reportIds.length,
        });
      }),
    );

    const { result } = renderHook(() => useSyncExistingReports(), { wrapper: createWrapper() });

    result.current.mutate({
      id: 'integration-1',
      reportIds: ['report-1', 'report-2'],
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.queued).toBe(2);
  });
});
