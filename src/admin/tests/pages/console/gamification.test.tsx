import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../utils';
import { Gamification } from '../../../pages/console/Gamification';

describe('Gamification settings', () => {
  it('summarizes who takes part and links to Users instead of listing people', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Gamification />);
    expect(await screen.findByText('Off for everyone')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage people in Users' })).toHaveAttribute(
      'href',
      '/settings/users'
    );

    await user.click(screen.getByRole('switch', { name: 'Enable gamification' }));

    expect(screen.getByText('On for 1 of 1 people')).toBeInTheDocument();
    expect(screen.getByText(/1 viewer, who never take part/)).toBeInTheDocument();
  });

  it('offers the new-user default and the opt-out, disabled while gamification is off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Gamification />);
    const newUsers = await screen.findByRole('switch', { name: 'Turn on for new users' });
    const optOut = screen.getByRole('switch', { name: 'Let users turn it off for themselves' });
    expect(newUsers).toBeDisabled();
    expect(optOut).toBeChecked();

    await user.click(screen.getByRole('switch', { name: 'Enable gamification' }));
    expect(newUsers).toBeEnabled();
    await user.click(optOut);
    expect(optOut).not.toBeChecked();
  });

  it('offers the team ranking switch, on by default', async () => {
    renderWithProviders(<Gamification />);
    const ranking = await screen.findByRole('switch', { name: 'Show team ranking' });
    expect(ranking).toBeChecked();
    expect(ranking).toBeDisabled();
  });
});
