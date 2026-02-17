import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { UsersSettings } from '../../../pages/globalsettings/UsersSettings';
import { api } from '../../../api/client';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('UsersSettings', () => {
  it('invites a user from the modal', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<UsersSettings />);

    await screen.findByText('Users');

    await user.click(screen.getByRole('button', { name: /invite user/i }));

    await user.type(screen.getByLabelText(/name/i), 'New User');
    await user.type(screen.getByLabelText(/email/i), 'newuser@example.com');

    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/users/invite',
        expect.objectContaining({
          name: 'New User',
          email: 'newuser@example.com',
          role: 'viewer',
        }),
      );
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('updates and deletes a non-admin user', async () => {
    const user = userEvent.setup();
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue({ data: { success: true } } as unknown);
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<UsersSettings />);

    const viewerEmail = await screen.findByText('viewer@example.com');
    const viewerRow = viewerEmail.closest('tr');
    expect(viewerRow).toBeTruthy();

    const statusButton = within(viewerRow!).getByRole('button', { name: /active/i });
    await user.click(statusButton);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        '/users/user-3',
        expect.objectContaining({
          isActive: false,
        }),
      );
    });

    const deleteButton = viewerRow!.querySelector('button.text-destructive') as HTMLButtonElement;
    await user.click(deleteButton);

    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/users/user-3');
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('displays pending invitation status for users who have not accepted', async () => {
    renderWithProviders(<UsersSettings />);

    await screen.findByText('Users');

    // The pending user should show "Pending" badge and "Invited X days ago"
    const pendingBadges = await screen.findAllByText('Pending');
    expect(pendingBadges.length).toBeGreaterThan(0);
  });

  it('can resend invitation for pending users', async () => {
    const user = userEvent.setup();
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<UsersSettings />);

    // Wait for the pending user to appear
    await screen.findByText('pending@example.com');

    // Find the resend button (RefreshCw icon button) and click it
    const resendButtons = await screen.findAllByTitle('Resend invitation');
    expect(resendButtons.length).toBeGreaterThan(0);

    await user.click(resendButtons[0]);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\/.*\/resend-invitation/),
      );
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
