import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithQueryAndRouter, screen, userEvent, waitFor } from '../../utils';
import {
  InvitationSettingsCard,
  NetworkSettingsCard,
  PasswordPolicyCard,
  SessionSettingsCard,
  TwoFactorPolicyCard,
} from '../../../pages/console/Security';
import { toast } from 'sonner';
import { mockSettingsServer } from './settingsServer';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function SecurityPage() {
  return (
    <>
      <SessionSettingsCard />
      <InvitationSettingsCard />
      <TwoFactorPolicyCard />
      <PasswordPolicyCard />
      <NetworkSettingsCard />
    </>
  );
}

describe('Security cards', () => {
  it('saves each card with only its own values when the settings reload between saves', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    const { queryClient } = renderWithQueryAndRouter(<SecurityPage />);

    // After the first save another admin turns on HTTPS, and the settings reload before the
    // next card is saved.
    settingsServer.onPut(() => {
      if (settingsServer.puts.length !== 1) return;
      settingsServer.update({ enforceHttps: true });
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    });

    fireEvent.change(await screen.findByLabelText(/session duration/i), {
      target: { value: '14' },
    });
    fireEvent.change(screen.getByLabelText(/invitation expiration/i), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByLabelText(/requests per minute/i), {
      target: { value: '120' },
    });

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toHaveLength(3));
    expect(settingsServer.puts).toEqual(
      expect.arrayContaining([
        { sessionMaxAgeDays: 14 },
        { invitationExpirationDays: 21 },
        { rateLimitPerMinute: 120 },
      ])
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    );
    expect(await screen.findByRole('switch', { name: /enforce https/i })).toBeChecked();
    expect(screen.getByLabelText(/session duration/i)).toHaveValue(14);
    expect(screen.getByLabelText(/requests per minute/i)).toHaveValue(120);
  });

  it('keeps unsaved edits when the settings reload', async () => {
    const settingsServer = mockSettingsServer();
    const { queryClient } = renderWithQueryAndRouter(<SecurityPage />);

    const rateLimit = await screen.findByLabelText(/requests per minute/i);
    fireEvent.change(rateLimit, { target: { value: '300' } });

    settingsServer.update({ sessionMaxAgeDays: 30 });
    await queryClient.refetchQueries({ queryKey: ['settings'] });

    await waitFor(() => expect(screen.getByLabelText(/session duration/i)).toHaveValue(30));
    expect(screen.getByLabelText(/requests per minute/i)).toHaveValue(300);
  });

  it('saves the complete password policy and shows a toast', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    renderWithQueryAndRouter(<PasswordPolicyCard />);

    await user.click(await screen.findByLabelText(/special character/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(settingsServer.puts).toEqual([
        {
          passwordPolicy: {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: false,
            requireNumber: true,
            requireSymbol: true,
          },
        },
      ])
    );
    expect(toast.success).toHaveBeenCalledWith('Password policy saved');
  });

  it('keeps the edit and shows the server error when saving fails', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    settingsServer.failNext();
    renderWithQueryAndRouter(<SessionSettingsCard />);

    fireEvent.change(await screen.findByLabelText(/session duration/i), {
      target: { value: '30' },
    });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Saving failed on the server'));
    expect(screen.getByLabelText(/session duration/i)).toHaveValue(30);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('does not accept a session duration outside the allowed range', async () => {
    mockSettingsServer();
    renderWithQueryAndRouter(<SessionSettingsCard />);

    const input = await screen.findByLabelText(/session duration/i);
    fireEvent.change(input, { target: { value: '500' } });

    expect(screen.getByText('Enter a whole number from 1 to 365.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });
});
