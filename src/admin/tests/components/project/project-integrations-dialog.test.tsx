import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '../../utils';
import { ProjectIntegrationsDialog } from '../../../components/project/ProjectIntegrationsDialog';
import type { Integration } from '@shared/types';

const mockDeleteIntegration = vi.fn();
const mockUpdateIntegration = vi.fn();
const mockTestIntegration = vi.fn();

let integrationsData: Integration[] = [];
let integrationsLoading = false;

vi.mock('../../../hooks/useIntegrations', () => ({
  useIntegrations: () => ({ data: integrationsData, isLoading: integrationsLoading }),
  useDeleteIntegration: () => ({ mutateAsync: mockDeleteIntegration, isPending: false }),
  useUpdateIntegration: () => ({ mutateAsync: mockUpdateIntegration, isPending: false }),
  useTestIntegration: () => ({ mutateAsync: mockTestIntegration, isPending: false }),
}));

vi.mock('../../../lib/integration-types', async () => {
  const { Github } = await import('lucide-react');
  return {
    CE_INTEGRATION_TYPES: [
      {
        type: 'github',
        name: 'GitHub',
        description: 'Create issues from bug reports in your GitHub repository',
        icon: Github,
        maxPerProject: 1,
        getConfigSummary: (integration: Integration) => (
          <span>
            {(integration.config as { owner: string; repo: string }).owner}/
            {(integration.config as { owner: string; repo: string }).repo}
          </span>
        ),
        ConfigDialog: ({
          open,
          integration,
        }: {
          open: boolean;
          integration?: Integration;
        }) =>
          open ? (
            <div>{integration ? 'Edit Integration Dialog' : 'Create Integration Dialog'}</div>
          ) : null,
      },
    ],
  };
});

const baseIntegration: Integration = {
  id: 'integration-1',
  projectId: 'project-1',
  type: 'github',
  name: 'GitHub Main',
  config: {
    owner: 'octo',
    repo: 'repo',
    accessToken: 'token-123',
  },
  isActive: true,
  lastUsedAt: new Date().toISOString(),
  usageCount: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ProjectIntegrationsDialog', () => {
  beforeEach(() => {
    integrationsData = [];
    integrationsLoading = false;
    vi.clearAllMocks();
    mockTestIntegration.mockResolvedValue({ success: true });
  });

  it('shows not-configured card when no integrations exist', () => {
    render(
      <ProjectIntegrationsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /configure/i })).toBeInTheDocument();
  });

  it('handles setup, edit, test, toggle, and delete actions', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    integrationsData = [baseIntegration];

    render(
      <ProjectIntegrationsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByText('GitHub Main')).toBeInTheDocument();

    // Test
    await user.click(screen.getByRole('button', { name: /test/i }));
    expect(mockTestIntegration).toHaveBeenCalledWith('integration-1');

    // Toggle
    await user.click(screen.getByRole('button', { name: /disable/i }));
    expect(mockUpdateIntegration).toHaveBeenCalledWith({
      id: 'integration-1',
      data: { isActive: false },
    });

    // Delete
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(mockDeleteIntegration).toHaveBeenCalledWith('integration-1');
  });

  it('opens config dialog on setup click', async () => {
    const user = userEvent.setup();

    render(
      <ProjectIntegrationsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /configure/i }));
    expect(screen.getByText(/create integration dialog/i)).toBeInTheDocument();
  });

  it('opens config dialog on edit click', async () => {
    const user = userEvent.setup();
    integrationsData = [baseIntegration];

    render(
      <ProjectIntegrationsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByText(/edit integration dialog/i)).toBeInTheDocument();
  });

  it('shows loading state when integrations are loading', () => {
    integrationsLoading = true;

    render(
      <ProjectIntegrationsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={() => undefined}
      />,
    );

    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });
});
