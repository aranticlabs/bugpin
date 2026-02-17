import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, userEvent } from '../utils';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { api } from '../../api/client';
import type { User } from '@shared/types';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const apiMock = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const baseUser: User = {
  id: 'usr_1',
  email: 'user@example.com',
  name: 'User',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function AuthConsumer() {
  const { user, isLoading, login, logout, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div data-testid="status">{isLoading ? 'loading' : (user?.email ?? 'guest')}</div>
      {error && <div data-testid="error">{error}</div>}
      <button
        type="button"
        onClick={async () => {
          try {
            await login('user@example.com', 'password');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
          }
        }}
      >
        Login
      </button>
      <button
        type="button"
        onClick={async () => {
          await logout();
        }}
      >
        Logout
      </button>
      <button
        type="button"
        onClick={async () => {
          await refreshUser();
        }}
      >
        Refresh
      </button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>,
  );
}

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
});

describe('AuthProvider', () => {
  it('loads the current user on mount when authenticated', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, authenticated: true, user: baseUser },
    });

    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(baseUser.email);
    });
  });

  it('sets guest when unauthenticated', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, authenticated: false },
    });

    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });
  });

  it('shows an error when login fails', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, authenticated: false },
    });
    apiMock.post.mockResolvedValueOnce({
      data: { success: false, message: 'Bad credentials' },
    });

    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByTestId('error')).toHaveTextContent('Bad credentials');
  });

  it('clears the user on logout even when the API fails', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: { success: true, authenticated: true, user: baseUser },
    });
    apiMock.post.mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(baseUser.email);
    });

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });
  });

  it('refreshes the user and handles API errors', async () => {
    apiMock.get
      .mockResolvedValueOnce({
        data: { success: true, authenticated: false },
      })
      .mockResolvedValueOnce({
        data: { success: true, authenticated: true, user: baseUser },
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe(baseUser.email);
    });

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });
  });
});
