import { describe, it, expect, vi } from 'vitest';
import { IntegrationCard } from '../../components/IntegrationCard';
import { render, screen, userEvent } from '../utils';
import type { Integration } from '@shared/types';

const integration: Integration = {
  id: 'integration-1',
  projectId: 'project-1',
  type: 'github',
  name: 'GitHub Main',
  config: {
    owner: 'octo',
    repo: 'repo',
    accessToken: 'token-123',
    labels: ['bug'],
  },
  isActive: true,
  lastUsedAt: new Date().toISOString(),
  usageCount: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('IntegrationCard', () => {
  it('renders integration details and handles actions', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onTest = vi.fn();
    const onToggleActive = vi.fn();

    render(
      <IntegrationCard
        integration={integration}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
        onToggleActive={onToggleActive}
      />,
    );

    expect(screen.getByText('GitHub Main')).toBeInTheDocument();
    expect(screen.getByText(/octo\/repo/i)).toBeInTheDocument();
    expect(screen.getByText(/token-123/i)).toBeInTheDocument();
    expect(screen.getByText(/labels:/i)).toBeInTheDocument();
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
    expect(screen.getByText(/3 times/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /test/i }));
    await user.click(screen.getByRole('button', { name: /disable/i }));
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(onEdit).toHaveBeenCalledWith(integration);
    expect(onTest).toHaveBeenCalledWith('integration-1');
    expect(onToggleActive).toHaveBeenCalledWith('integration-1', false);
    expect(onDelete).toHaveBeenCalledWith('integration-1');
  });
});
