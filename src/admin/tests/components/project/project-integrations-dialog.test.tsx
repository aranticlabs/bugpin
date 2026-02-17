import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '../../utils';
import { ProjectIntegrationsDialog } from '../../../components/project/ProjectIntegrationsDialog';
import type { Integration } from '@shared/types';
import { toast } from 'sonner';

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

vi.mock('../../../components/IntegrationCard', () => ({
  IntegrationCard: ({
    integration,
    onEdit,
    onDelete,
    onTest,
    onToggleActive,
  }: {
    integration: Integration;
    onEdit: (integration: Integration) => void;
    onDelete: (id: string) => void;
    onTest: (id: string) => void;
    onToggleActive: (id: string, isActive: boolean) => void;
  }) => (
    <div>
      <div>{integration.name}</div>
      <button type="button" onClick={() => onEdit(integration)}>
        Edit
      </button>
      <button type="button" onClick={() => onTest(integration.id)}>
        Test
      </button>
      <button type="button" onClick={() => onToggleActive(integration.id, !integration.isActive)}>
        Toggle
      </button>
      <button type="button" onClick={() => onDelete(integration.id)}>
        Remove
      </button>
    </div>
  ),
}));

vi.mock('../../../components/IntegrationDialog', () => ({
  IntegrationDialog: ({ open, integration }: { open: boolean; integration?: Integration }) =>
    open ? (
      <div>{integration ? 'Edit Integration Dialog' : 'Create Integration Dialog'}</div>
    ) : null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockToast = toast as unknown as { success: ReturnType<typeof vi.fn> };

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

  it('shows empty state when no integrations exist', () => {
    render(
      <ProjectIntegrationsDialog
        project={{ id: 'project-1', name: 'Project' }}
        open={true}
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.getByText(/no integrations configured/i)).toBeInTheDocument();
  });

  it('handles add, edit, test, toggle, and delete actions', async () => {
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

    await user.click(screen.getByRole('button', { name: /add integration/i }));
    expect(screen.getByText(/create integration dialog/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByText(/edit integration dialog/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /test/i }));
    expect(mockTestIntegration).toHaveBeenCalledWith('integration-1');
    expect(mockToast.success).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /toggle/i }));
    expect(mockUpdateIntegration).toHaveBeenCalledWith({
      id: 'integration-1',
      data: { isActive: false },
    });

    await user.click(screen.getByRole('button', { name: /remove/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(mockDeleteIntegration).toHaveBeenCalledWith('integration-1');
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
