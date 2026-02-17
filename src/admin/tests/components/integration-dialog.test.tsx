import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { IntegrationDialog } from '../../components/IntegrationDialog';
import { render, screen, userEvent } from '../utils';
import type { Integration } from '@shared/types';

const mockCreateIntegration = vi.fn();
const mockUpdateIntegration = vi.fn();
const mockTestIntegration = vi.fn();
const mockFetchRepos = vi.fn();
const mockFetchLabels = vi.fn();
const mockFetchAssignees = vi.fn();
const mockSetSyncMode = vi.fn();

vi.mock('../../hooks/useIntegrations', () => ({
  useCreateIntegration: () => ({ mutateAsync: mockCreateIntegration, isPending: false }),
  useUpdateIntegration: () => ({ mutateAsync: mockUpdateIntegration, isPending: false }),
  useTestIntegration: () => ({ mutateAsync: mockTestIntegration, isPending: false }),
  useFetchGitHubRepos: () => ({ mutateAsync: mockFetchRepos, isPending: false }),
  useFetchGitHubLabels: () => ({ mutateAsync: mockFetchLabels, isPending: false }),
  useFetchGitHubAssignees: () => ({ mutateAsync: mockFetchAssignees, isPending: false }),
  useSetSyncMode: () => ({ mutateAsync: mockSetSyncMode, isPending: false }),
}));

vi.mock('../../components/SyncExistingReportsDialog', () => ({
  SyncExistingReportsDialog: () => null,
}));

vi.mock('../../components/GitHubTokenHelpDialog', () => ({
  GitHubTokenHelpDialog: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const baseIntegration: Integration = {
  id: 'integration-1',
  projectId: 'project-1',
  type: 'github',
  name: 'GitHub Main',
  config: {
    owner: 'octo',
    repo: 'repo',
    accessToken: 'token-123',
    labels: ['bug'],
    assignees: ['alice'],
    syncMode: 'manual',
  },
  isActive: true,
  lastUsedAt: new Date().toISOString(),
  usageCount: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateIntegration.mockResolvedValue({});
  mockUpdateIntegration.mockResolvedValue({});
  mockTestIntegration.mockResolvedValue({ success: true });
  mockFetchRepos.mockResolvedValue([
    {
      fullName: 'octo/repo',
      owner: 'octo',
      name: 'repo',
      private: true,
    },
  ]);
  mockFetchLabels.mockResolvedValue([{ name: 'bug', color: 'ff0000' }]);
  mockFetchAssignees.mockResolvedValue([
    { login: 'alice', avatarUrl: 'https://example.com/alice.png' },
  ]);
  mockSetSyncMode.mockResolvedValue({});
});

describe('IntegrationDialog', () => {
  it('creates an integration with labels and assignees', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<IntegrationDialog open={true} onClose={onClose} projectId="project-1" />);

    await user.type(screen.getByLabelText(/integration name/i), 'Main Repo');
    await user.type(screen.getByLabelText(/personal access token/i), 'token-123');
    await user.click(screen.getByTitle(/load repositories/i));

    expect(mockFetchRepos).toHaveBeenCalledWith('token-123');

    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /octo\/repo/i }));

    const labelsSwitch = document.querySelector('#enable-labels');
    expect(labelsSwitch).toBeTruthy();
    await user.click(labelsSwitch as HTMLElement);

    await waitFor(() => {
      expect(mockFetchLabels).toHaveBeenCalledWith({
        accessToken: 'token-123',
        owner: 'octo',
        repo: 'repo',
      });
    });

    const labelCheckbox = document.querySelector('#label-bug');
    expect(labelCheckbox).toBeTruthy();
    await user.click(labelCheckbox as HTMLElement);

    const assigneesSwitch = document.querySelector('#enable-assignees');
    expect(assigneesSwitch).toBeTruthy();
    await user.click(assigneesSwitch as HTMLElement);

    await waitFor(() => {
      expect(mockFetchAssignees).toHaveBeenCalledWith({
        accessToken: 'token-123',
        owner: 'octo',
        repo: 'repo',
      });
    });

    const assigneeCheckbox = document.querySelector('#assignee-alice');
    expect(assigneeCheckbox).toBeTruthy();
    await user.click(assigneeCheckbox as HTMLElement);

    await user.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(mockCreateIntegration).toHaveBeenCalledWith({
        projectId: 'project-1',
        type: 'github',
        name: 'Main Repo',
        config: {
          owner: 'octo',
          repo: 'repo',
          accessToken: 'token-123',
          labels: ['bug'],
          assignees: ['alice'],
        },
      });
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('updates an integration and tests connection with new token', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <IntegrationDialog
        open={true}
        onClose={onClose}
        integration={baseIntegration}
        projectId="project-1"
      />,
    );

    expect(screen.getByText(/token saved/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change/i }));
    await user.type(screen.getByLabelText(/personal access token/i), 'new-token');
    await user.click(screen.getByRole('button', { name: /test connection/i }));

    await waitFor(() => {
      expect(mockTestIntegration).toHaveBeenCalledWith('integration-1');
    });

    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => {
      expect(mockUpdateIntegration).toHaveBeenCalledWith({
        id: 'integration-1',
        data: {
          name: 'GitHub Main',
          config: {
            owner: 'octo',
            repo: 'repo',
            accessToken: 'new-token',
            labels: ['bug'],
            assignees: ['alice'],
          },
        },
      });
    });

    expect(onClose).toHaveBeenCalled();
  });
});
