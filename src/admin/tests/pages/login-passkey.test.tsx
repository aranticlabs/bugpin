import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../contexts/AuthContext';
import { Login } from '../../pages/Login';
import type { User } from '@shared/types';

const signedInUser: User = {
  id: 'usr_1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const passkeys = vi.hoisted(() => ({
  signInWithPasskey: vi.fn(),
  verifyPasskeySecondFactor: vi.fn(),
}));

vi.mock('../../lib/passkeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/passkeys')>();
  return {
    ...actual,
    passkeysSupported: () => true,
    signInWithPasskey: passkeys.signInWithPasskey,
    verifyPasskeySecondFactor: passkeys.verifyPasskeySecondFactor,
  };
});

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  passkeys.signInWithPasskey.mockReset();
  passkeys.verifyPasskeySecondFactor.mockReset();
});

describe('Login with passkeys', () => {
  it('signs in with a passkey without email and password', async () => {
    const user = userEvent.setup();
    passkeys.signInWithPasskey.mockResolvedValue(signedInUser);
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

    await waitFor(() => expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();
  });

  it('shows a readable message when the passkey prompt is cancelled', async () => {
    const user = userEvent.setup();
    const cancelled = new Error('The operation either timed out or was not allowed.');
    cancelled.name = 'NotAllowedError';
    passkeys.signInWithPasskey.mockRejectedValue(cancelled);
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in with a passkey/i }));

    expect(await screen.findByText(/cancelled or timed out/i)).toBeInTheDocument();
  });

  it('offers a passkey as the second step and switches between methods', async () => {
    const user = userEvent.setup();
    passkeys.verifyPasskeySecondFactor.mockResolvedValue(signedInUser);
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          success: true,
          twoFactorRequired: true,
          challengeToken: 'challenge-1',
          methods: { totp: true, passkey: true, recoveryCode: true },
        })
      )
    );
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'a-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use a recovery code/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^use a passkey$/i }));
    expect(screen.queryByLabelText(/^code$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use your authenticator app/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^use passkey$/i }));
    await waitFor(() =>
      expect(passkeys.verifyPasskeySecondFactor).toHaveBeenCalledWith('challenge-1')
    );
  });

  it('starts with the passkey when no authenticator app is set up', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          success: true,
          twoFactorRequired: true,
          challengeToken: 'challenge-2',
          methods: { totp: false, passkey: true, recoveryCode: true },
        })
      )
    );
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'a-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/confirm it is you/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /use your authenticator app/i })
    ).not.toBeInTheDocument();
  });
});
