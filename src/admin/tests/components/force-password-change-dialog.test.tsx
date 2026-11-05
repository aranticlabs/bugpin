import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, userEvent } from '../utils';
import { AuthProvider } from '../../contexts/AuthContext';
import { ForcePasswordChangeDialog } from '../../components/ForcePasswordChangeDialog';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const apiMock = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const flaggedUser = {
  id: 'usr_admin',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  mustChangePassword: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderDialog() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <ForcePasswordChangeDialog />
      </AuthProvider>
    </QueryClientProvider>
  );
}

async function fillForm(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^Current password/), current);
  await user.type(screen.getByLabelText(/^New password/), next);
  await user.type(screen.getByLabelText(/^Confirm password/), confirm);
  await user.click(screen.getByRole('button', { name: 'Update password' }));
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.get.mockResolvedValue({
    data: { success: true, authenticated: true, user: flaggedUser },
  });
});

describe('ForcePasswordChangeDialog', () => {
  it('cannot be closed and offers no close button', async () => {
    renderDialog();

    expect(await screen.findByRole('dialog', { name: 'Change your password' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('rejects reusing the current password without calling the API', async () => {
    renderDialog();
    await screen.findByRole('dialog');

    await fillForm('changeme123', 'changeme123', 'changeme123');

    expect(
      await screen.findByText('New password must be different from the current password')
    ).toBeTruthy();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('changes the password and refreshes the signed-in user', async () => {
    apiMock.post.mockResolvedValueOnce({ data: { success: true } });
    renderDialog();
    await screen.findByRole('dialog');
    apiMock.get.mockClear();

    await fillForm('changeme123', 'a-new-password', 'a-new-password');

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'changeme123',
        newPassword: 'a-new-password',
      });
    });
    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/auth/me');
    });
  });

  it('shows the server error when the change is refused', async () => {
    apiMock.post.mockRejectedValueOnce({
      response: { data: { message: 'Current password is incorrect' } },
    });
    renderDialog();
    await screen.findByRole('dialog');

    await fillForm('wrong-password', 'a-new-password', 'a-new-password');

    expect(await screen.findByText('Current password is incorrect')).toBeTruthy();
  });
});
