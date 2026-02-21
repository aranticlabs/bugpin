import { describe, it, expect, vi } from 'vitest';
import { IntegrationTypeCard } from '../../components/integrations/IntegrationTypeCard';
import { render, screen, userEvent } from '../utils';
import type { Integration } from '@shared/types';
import type { IntegrationTypeDefinition } from '../../lib/integration-types';
import { Github } from 'lucide-react';

const definition: IntegrationTypeDefinition = {
  type: 'github',
  name: 'GitHub',
  description: 'Create issues from bug reports in your GitHub repository',
  icon: Github,
  maxPerProject: 1,
  getConfigSummary: (integration) => {
    const config = integration.config as { owner: string; repo: string; accessToken: string; labels?: string[] };
    return (
      <div>
        <span>{config.owner}/{config.repo}</span>
        <span>{config.accessToken}</span>
        {config.labels && <span>Labels: {config.labels.join(', ')}</span>}
      </div>
    );
  },
  ConfigDialog: () => null,
};

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

describe('IntegrationTypeCard', () => {
  it('renders not-configured state with setup button', async () => {
    const user = userEvent.setup();
    const onSetup = vi.fn();

    render(
      <IntegrationTypeCard
        definition={definition}
        onSetup={onSetup}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onTest={vi.fn()}
        onToggleActive={vi.fn()}
      />,
    );

    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText(/create issues from bug reports/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /configure/i }));
    expect(onSetup).toHaveBeenCalledWith(definition);
  });

  it('renders configured state with integration details and handles actions', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onTest = vi.fn();
    const onToggleActive = vi.fn();

    render(
      <IntegrationTypeCard
        definition={definition}
        integration={integration}
        onSetup={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
        onTest={onTest}
        onToggleActive={onToggleActive}
      />,
    );

    expect(screen.getByText('GitHub Main')).toBeInTheDocument();
    expect(screen.getByText(/octo\/repo/i)).toBeInTheDocument();
    expect(screen.getByText(/token-123/i)).toBeInTheDocument();
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
    expect(screen.getByText(/3 times/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /test/i }));
    await user.click(screen.getByRole('button', { name: /disable/i }));
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(onEdit).toHaveBeenCalledWith(integration, definition);
    expect(onTest).toHaveBeenCalledWith('integration-1');
    expect(onToggleActive).toHaveBeenCalledWith('integration-1', false);
    expect(onDelete).toHaveBeenCalledWith('integration-1');
  });
});
