import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const passkeys = vi.hoisted(() => ({ registerPasskey: vi.fn() }));

vi.mock('../../lib/passkeys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/passkeys')>()),
  passkeysSupported: () => true,
  registerPasskey: passkeys.registerPasskey,
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

beforeEach(() => {
  passkeys.registerPasskey.mockReset();
});

describe('TwoFactorCard authenticator app setup', () => {
  it('asks for the password before starting the setup', async () => {
    const user = userEvent.setup();
    let setupCalled = false;
    server.use(
      http.post('/api/auth/two-factor/totp/setup', () => {
        setupCalled = true;
        return HttpResponse.json({ success: true, secret: 'S', otpauthUri: 'otpauth://totp/x' });
      })
    );
    renderCard();

    await user.click(await screen.findByRole('button', { name: /^set up$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument();
    expect(setupCalled).toBe(false);
  });

  it('sends the password with the setup request and shows the QR code', async () => {
    const user = userEvent.setup();
    let setupBody: unknown = null;
    server.use(
      http.post('/api/auth/two-factor/totp/setup', async ({ request }) => {
        setupBody = await request.json();
        return HttpResponse.json({
          success: true,
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/BugPin:admin?secret=JBSWY3DPEHPK3PXP',
        });
      })
    );
    renderCard();

    await user.click(await screen.findByRole('button', { name: /^set up$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/current password/i), 'password123');
    await user.click(within(dialog).getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByRole('img', { name: /qr code/i })).toBeInTheDocument();
    expect(setupBody).toEqual({ password: 'password123' });
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it('keeps the password dialog open with an error when the password is wrong', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /^set up$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/current password/i), 'wrong-password');
    await user.click(within(dialog).getByRole('button', { name: /^continue$/i }));

    expect(await within(dialog).findByText('Password is incorrect')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument();
  });
});

describe('TwoFactorCard passkey registration', () => {
  it('asks for the password before naming the passkey', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /add passkey/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/current password/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^name$/i)).not.toBeInTheDocument();
  });

  it('sends the password for the options, then names and registers the passkey', async () => {
    const user = userEvent.setup();
    let optionsBody: unknown = null;
    server.use(
      http.post('/api/auth/passkeys/register/options', async ({ request }) => {
        optionsBody = await request.json();
        return HttpResponse.json({ success: true, options: { challenge: 'challenge-1' } });
      })
    );
    passkeys.registerPasskey.mockResolvedValue(null);
    renderCard();

    await user.click(await screen.findByRole('button', { name: /add passkey/i }));
    const passwordDialog = await screen.findByRole('dialog');
    await user.type(within(passwordDialog).getByLabelText(/current password/i), 'password123');
    await user.click(within(passwordDialog).getByRole('button', { name: /^continue$/i }));

    const nameInput = await screen.findByLabelText(/^name$/i);
    expect(optionsBody).toEqual({ password: 'password123' });
    expect(passkeys.registerPasskey).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();

    await user.clear(nameInput);
    await user.type(nameInput, 'Work laptop');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() =>
      expect(passkeys.registerPasskey).toHaveBeenCalledWith(
        { challenge: 'challenge-1' },
        'Work laptop'
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the password dialog open with an error when the password is wrong', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: /add passkey/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/current password/i), 'wrong-password');
    await user.click(within(dialog).getByRole('button', { name: /^continue$/i }));

    expect(await within(dialog).findByText('Password is incorrect')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    expect(passkeys.registerPasskey).not.toHaveBeenCalled();
  });
});

describe('TwoFactorCard passkeys', () => {
  it('lists passkeys with their last use', async () => {
    renderCard();

    expect(await screen.findByText('MacBook Touch ID')).toBeInTheDocument();
    expect(screen.getByText(/last used/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add passkey/i })).toBeEnabled();
    expect(screen.getByText('9 of 10 left.')).toBeInTheDocument();
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
