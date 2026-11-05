import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TwoFactorCard } from '../../components/profile/SecurityTab';
import type { TwoFactorStatus } from '@shared/types';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser: vi.fn() }),
}));

vi.mock('../../lib/passkeys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/passkeys')>()),
  passkeysSupported: () => true,
}));

const status: TwoFactorStatus = {
  totpEnabled: false,
  passkeys: [
    {
      id: 'pk_1',
      name: 'MacBook Touch ID',
      backedUp: true,
      createdAt: '2026-10-01T10:00:00.000Z',
      lastUsedAt: '2026-11-01T10:00:00.000Z',
    },
  ],
  recoveryCodesRemaining: 9,
  policy: 'off',
  setupRequired: false,
};

function renderCard() {
  server.use(http.get('/api/auth/two-factor', () => HttpResponse.json({ success: true, status })));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TwoFactorCard />
    </QueryClientProvider>
  );
}

describe('TwoFactorCard passkeys', () => {
  it('lists passkeys with their last use', async () => {
    renderCard();

    expect(await screen.findByText('MacBook Touch ID')).toBeInTheDocument();
    expect(screen.getByText(/last used/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add passkey/i })).toBeEnabled();
    expect(screen.getByText('9 of 10 left')).toBeInTheDocument();
  });

  it('removes a passkey after the password is confirmed', async () => {
    const user = userEvent.setup();
    let removeBody: unknown = null;
    server.use(
      http.delete('/api/auth/passkeys/pk_1', async ({ request }) => {
        removeBody = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    renderCard();

    await user.click(await screen.findByRole('button', { name: /remove macbook touch id/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/password/i), 'my-password');
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(removeBody).toEqual({ password: 'my-password' }));
  });

  it('renames a passkey', async () => {
    const user = userEvent.setup();
    let renameBody: unknown = null;
    server.use(
      http.patch('/api/auth/passkeys/pk_1', async ({ request }) => {
        renameBody = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    renderCard();

    await user.click(await screen.findByRole('button', { name: /rename macbook touch id/i }));
    const input = await screen.findByLabelText(/^name$/i);
    await user.clear(input);
    await user.type(input, 'Work laptop');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(renameBody).toEqual({ name: 'Work laptop' }));
  });
});
