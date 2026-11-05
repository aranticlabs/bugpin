import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../../contexts/AuthContext';
import { Login } from '../../pages/Login';

function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

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

describe('Login Page', () => {
  it('renders login form with email and password fields', () => {
    renderLogin();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows BugPin branding', () => {
    renderLogin();

    expect(screen.getAllByAltText(/bugpin/i).length).toBeGreaterThan(0);
  });

  it('email field is required', async () => {
    const user = userEvent.setup();
    renderLogin();

    // Try to submit without filling email
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Should show validation error for email
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('password field is required', async () => {
    const user = userEvent.setup();
    renderLogin();

    // Fill email but not password
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Should show validation error for password
    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('allows typing in email field', async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'test@example.com');

    expect(emailInput).toHaveValue('test@example.com');
  });

  it('allows typing in password field', async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'password123');

    expect(passwordInput).toHaveValue('password123');
  });

  it('shows error message on failed login', async () => {
    const user = userEvent.setup();

    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json(
          { success: false, message: 'Invalid credentials' },
          { status: 401 }
        );
      })
    );

    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid|error|failed/i)).toBeInTheDocument();
    });
  });

  it('asks for the second factor and accepts a recovery code', async () => {
    const user = userEvent.setup();
    let secondStepBody: Record<string, string> | null = null;
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          success: true,
          twoFactorRequired: true,
          challengeToken: 'challenge-1',
          methods: { totp: true, passkey: false, recoveryCode: true },
        })
      ),
      http.post('/api/auth/login/two-factor', async ({ request }) => {
        secondStepBody = (await request.json()) as Record<string, string>;
        return HttpResponse.json({
          success: true,
          user: {
            id: 'usr_1',
            email: 'admin@example.com',
            name: 'Admin',
            role: 'admin',
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        });
      })
    );
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'a-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Two-factor authentication')).toBeInTheDocument();
    expect(screen.getByText(/6-digit code from your authenticator app/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /use a recovery code/i }));
    await user.type(screen.getByLabelText(/recovery code/i), 'abcde-fghij');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(secondStepBody).toEqual({
        challengeToken: 'challenge-1',
        recoveryCode: 'abcde-fghij',
      });
    });
  });

  it('goes back to the password step', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          success: true,
          twoFactorRequired: true,
          challengeToken: 'challenge-1',
          methods: { totp: true, passkey: false, recoveryCode: true },
        })
      )
    );
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'a-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.click(await screen.findByRole('button', { name: /back/i }));

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
