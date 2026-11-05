import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForceTwoFactorSetupDialog } from '../../components/ForceTwoFactorSetupDialog';
import type { TwoFactorStatus } from '@shared/types';

const auth = vi.hoisted(() => ({ logout: vi.fn(), refreshUser: vi.fn() }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('../../lib/passkeys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/passkeys')>()),
  passkeysSupported: () => true,
}));

const status: TwoFactorStatus = {
  totpEnabled: false,
  passkeys: [],
  recoveryCodesRemaining: 0,
  policy: 'everyone',
  setupRequired: true,
};

function renderDialog() {
  server.use(http.get('/api/auth/two-factor', () => HttpResponse.json({ success: true, status })));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ForceTwoFactorSetupDialog />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  auth.logout.mockReset();
  auth.refreshUser.mockReset();
});

describe('ForceTwoFactorSetupDialog', () => {
  it('starts the authenticator app setup after the password is confirmed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: /^set up$/i }));
    const passwordInput = await screen.findByLabelText(/current password/i);
    await user.type(passwordInput, 'password123');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByRole('img', { name: /qr code/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it('starts the passkey registration after the password is confirmed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: /add passkey/i }));
    const passwordInput = await screen.findByLabelText(/current password/i);
    await user.type(passwordInput, 'password123');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByLabelText(/^name$/i)).toBeInTheDocument();
  });

  it('still lets the user sign out', async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /sign out/i }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
