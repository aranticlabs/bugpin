import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import type { Integration, IntegrationType, IntegrationConfig } from '@shared/types';

// Types

interface CreateIntegrationInput {
  projectId: string;
  type: IntegrationType;
  name: string;
  config: IntegrationConfig;
}

interface UpdateIntegrationInput {
  name?: string;
  config?: IntegrationConfig;
  isActive?: boolean;
}

interface TestConnectionResult {
  success: boolean;
  error?: string;
  details?: unknown;
}

interface ForwardReportInput {
  labels?: string[];
  assignees?: string[];
}

interface ForwardReportResult {
  type: string;
  id: string;
  url?: string;
}

// Hooks

export function useIntegrations(projectId: string | undefined) {
  return useQuery({
    queryKey: ['integrations', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await api.get(`/integrations?projectId=${projectId}`);
      return response.data.data as Integration[];
    },
    enabled: !!projectId,
  });
}

/**
 * Fetch a single integration by ID
 */
export function useIntegration(id: string | undefined) {
  return useQuery({
    queryKey: ['integrations', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get(`/integrations/${id}`);
      return response.data.integration as Integration;
    },
    enabled: !!id,
  });
}

/**
 * Create a new integration
 */
export function useCreateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateIntegrationInput) => {
      const response = await api.post('/integrations', data);
      return response.data.integration as Integration;
    },
    onSuccess: (integration) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', integration.projectId] });
      toast.success('Integration created successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to create integration');
    },
  });
}

/**
 * Update an integration
 */
export function useUpdateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateIntegrationInput }) => {
      const response = await api.patch(`/integrations/${id}`, data);
      return response.data.integration as Integration;
    },
    onSuccess: (integration) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', integration.id] });
      queryClient.invalidateQueries({ queryKey: ['integrations', integration.projectId] });
      toast.success('Integration updated successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update integration');
    },
  });
}

/**
 * Delete an integration
 */
export function useDeleteIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/integrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      toast.success('Integration deleted successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to delete integration');
    },
  });
}

/**
 * Test integration connection
 */
export function useTestIntegration() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/integrations/${id}/test`);
      return response.data.result as TestConnectionResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Connection test successful');
      } else {
        toast.error(result.error || 'Connection test failed');
      }
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to test connection');
    },
  });
}

/**
 * Forward report to integration
 */
export function useForwardReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      integrationId,
      options,
    }: {
      reportId: string;
      integrationId: string;
      options?: ForwardReportInput;
    }) => {
      const response = await api.post(
        `/reports/${reportId}/forward/${integrationId}`,
        options || {},
      );
      return response.data.result as ForwardReportResult;
    },
    onSuccess: (result, variables) => {
      // Invalidate report queries to refresh forwarded status
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['reports', variables.reportId] });
      // Invalidate integration to update usage stats
      queryClient.invalidateQueries({ queryKey: ['integrations', variables.integrationId] });
      toast.success(`Report forwarded to ${result.type} successfully`);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to forward report');
    },
  });
}

// GitHub Repository Types

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
}

/**
 * Fetch GitHub repositories accessible by a token
 */
export function useFetchGitHubRepos() {
  return useMutation({
    mutationFn: async (accessToken: string) => {
      const response = await api.post('/integrations/github/repositories', { accessToken });
      return response.data.repositories as GitHubRepository[];
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to fetch repositories');
    },
  });
}

// GitHub Label Type

export interface GitHubLabel {
  name: string;
  color: string;
  description: string | null;
}

/**
 * Fetch GitHub labels for a repository
 */
export function useFetchGitHubLabels() {
  return useMutation({
    mutationFn: async ({
      accessToken,
      owner,
      repo,
      integrationId,
    }: {
      accessToken: string;
      owner: string;
      repo: string;
      integrationId?: string;
    }) => {
      const response = await api.post('/integrations/github/labels', {
        accessToken: accessToken || undefined,
        owner,
        repo,
        integrationId,
      });
      return response.data.labels as GitHubLabel[];
    },
    // No toast - errors are handled inline in the dialog
  });
}

// GitHub Assignee Type

export interface GitHubAssignee {
  login: string;
  avatarUrl: string;
}

/**
 * Fetch GitHub assignees for a repository
 */
export function useFetchGitHubAssignees() {
  return useMutation({
    mutationFn: async ({
      accessToken,
      owner,
      repo,
      integrationId,
    }: {
      accessToken: string;
      owner: string;
      repo: string;
      integrationId?: string;
    }) => {
      const response = await api.post('/integrations/github/assignees', {
        accessToken: accessToken || undefined,
        owner,
        repo,
        integrationId,
      });
      return response.data.assignees as GitHubAssignee[];
    },
    // No toast - errors are handled inline in the dialog
  });
}

// Sync Mode Types

export interface SyncModeResult {
  syncMode: 'manual' | 'automatic';
  unsyncedCount?: number;
}

export interface SyncStatusResult {
  syncMode: 'manual' | 'automatic';
  unsyncedCount: number;
  queueLength: number;
  processing: boolean;
}

export interface SyncExistingResult {
  queued: number;
  message: string;
}

/**
 * Set sync mode for an integration
 */
export function useSetSyncMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, syncMode }: { id: string; syncMode: 'manual' | 'automatic' }) => {
      const response = await api.post(`/integrations/${id}/sync-mode`, { syncMode });
      return response.data as SyncModeResult;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', variables.id] });
      toast.success(`Sync mode set to ${result.syncMode}`);
    },
    onError: (err: Error & { response?: { data?: { message?: string; error?: string } } }) => {
      // Don't show toast for CONFIG_ERROR - the component will handle it with a dialog
      if (err.response?.data?.error === 'CONFIG_ERROR') {
        return;
      }
      toast.error(err.response?.data?.message || 'Failed to set sync mode');
    },
  });
}

/**
 * Get sync status for an integration
 */
export function useSyncStatus(id: string | undefined) {
  return useQuery({
    queryKey: ['integrations', id, 'sync-status'],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get(`/integrations/${id}/sync-status`);
      return response.data as SyncStatusResult;
    },
    enabled: !!id,
    refetchInterval: 5000, // Poll every 5 seconds while queue is active
  });
}

/**
 * Sync existing reports to GitHub
 */
export function useSyncExistingReports() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reportIds }: { id: string; reportIds: string[] | 'all' }) => {
      const response = await api.post(`/integrations/${id}/sync-existing`, { reportIds });
      return response.data as SyncExistingResult;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', variables.id, 'sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success(result.message);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to sync reports');
    },
  });
}
