import { describe, it, expect, vi } from 'vitest';
import { GitHubTokenHelpDialog } from '../../components/GitHubTokenHelpDialog';
import { render, screen } from '../utils';

describe('GitHubTokenHelpDialog', () => {
  it('renders help content when open', () => {
    render(<GitHubTokenHelpDialog open={true} onClose={vi.fn()} />);

    expect(screen.getByText(/how to create a github token/i)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /tokens \(classic\)/i });
    expect(link).toHaveAttribute('href', 'https://github.com/settings/tokens/new');
  });
});
