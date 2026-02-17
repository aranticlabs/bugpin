import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../utils';
import { UsersSettings } from '../../pages/globalsettings/UsersSettings';

describe('Users Page', () => {
  it('renders users page heading', async () => {
    renderWithProviders(<UsersSettings />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });

  it('renders without crashing', () => {
    renderWithProviders(<UsersSettings />);
    expect(document.body).toBeInTheDocument();
  });

  it('displays add user button', async () => {
    renderWithProviders(<UsersSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /invite user/i })).toBeInTheDocument();
    });
  });

  it('displays users table', async () => {
    renderWithProviders(<UsersSettings />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('displays user data after loading', async () => {
    renderWithProviders(<UsersSettings />);

    await waitFor(
      () => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('opens add user modal when button clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /invite user/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /invite user/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      // No password field - users set their own password when accepting invitation
    });
  });

  it('validates required fields in add user form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsersSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /invite user/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /invite user/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    // Try to submit the form without filling any fields
    const createButton = screen.getByRole('button', { name: /send invitation/i });
    await user.click(createButton);

    // Should show validation errors
    await waitFor(() => {
      const errorMessages = screen.queryAllByText(/required|must be at least/i);
      expect(errorMessages.length).toBeGreaterThan(0);
    });
  });

  it('displays user avatar initials', async () => {
    renderWithProviders(<UsersSettings />);

    await waitFor(
      () => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Avatar should show initial letter
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
