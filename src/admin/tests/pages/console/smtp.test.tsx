import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { SMTP } from '../../../pages/console/SMTP';
import { EmailSettings } from '../../../pages/console/EmailSettings';
import { api } from '../../../api/client';
import { toast } from 'sonner';
import { mockSettingsServer } from './settingsServer';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const configured = {
  smtpEnabled: true,
  smtpConfig: {
    host: 'smtp.example.com',
    port: 587,
    user: 'mailer',
    from: 'bugs@example.com',
    passwordSet: true,
  },
};

describe('SMTP settings', () => {
  it('requires host and sender address only when email is enabled', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    renderWithProviders(<SMTP />);

    const enable = await screen.findByRole('switch', { name: /enable email/i });
    expect(screen.getByLabelText(/smtp host/i)).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('Email is turned off');
    await user.click(enable);
    expect(screen.getByLabelText(/smtp host/i)).toBeEnabled();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/smtp username/i), 'mailer');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Enter the SMTP host to send email.')).toBeInTheDocument();
    expect(screen.getByText('Enter the sender address to send email.')).toBeInTheDocument();
    expect(screen.getByLabelText(/smtp host/i)).toHaveAttribute('aria-invalid', 'true');
    expect(settingsServer.puts).toHaveLength(0);

    await user.click(enable);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toEqual([{ smtpConfig: { user: 'mailer' } }]));
    expect(screen.queryByText('Enter the SMTP host to send email.')).not.toBeInTheDocument();
  });

  it('turns email off without touching the stored server settings', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer(configured);
    renderWithProviders(<SMTP />);

    const enable = await screen.findByRole('switch', { name: /enable email/i });
    expect(enable).toBeChecked();
    await user.click(enable);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toEqual([{ smtpEnabled: false }]));
  });

  it('keeps the stored password unless a new one is typed', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer(configured);
    renderWithProviders(<SMTP />);

    const password = await screen.findByLabelText(/smtp password/i);
    expect(password).toHaveValue('');
    expect(password).toHaveAttribute('placeholder', 'Saved (leave empty to keep)');

    await user.clear(screen.getByLabelText(/smtp host/i));
    await user.type(screen.getByLabelText(/smtp host/i), 'mail.example.com');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(settingsServer.puts).toEqual([{ smtpConfig: { host: 'mail.example.com' } }])
    );

    await user.type(password, 'new-secret');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(settingsServer.puts).toHaveLength(2));
    expect(settingsServer.puts[1]).toEqual({ smtpConfig: { password: 'new-secret' } });
    await waitFor(() => expect(password).toHaveValue(''));
  });

  it('sends a test email with the stored password when none is typed', async () => {
    const user = userEvent.setup();
    mockSettingsServer(configured);
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
    renderWithProviders(<SMTP />);

    await user.click(await screen.findByRole('button', { name: /send test email/i }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    const [, body] = postSpy.mock.calls[0];
    expect(body).toMatchObject({
      smtpConfig: { host: 'smtp.example.com', port: 587, user: 'mailer', from: 'bugs@example.com' },
    });
    expect(body).not.toHaveProperty('smtpConfig.password');
  });

  it('accepts only valid port numbers', async () => {
    mockSettingsServer(configured);
    renderWithProviders(<SMTP />);

    fireEvent.change(await screen.findByLabelText(/smtp port/i), { target: { value: '70000' } });

    expect(screen.getByText('Enter a whole number from 1 to 65535.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('shows the server error when saving fails from the email settings page', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer(configured);
    settingsServer.failNext();
    renderWithProviders(<EmailSettings />);

    await user.type(await screen.findByLabelText(/smtp username/i), '2');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Saving failed on the server'));
    expect(settingsServer.puts).toEqual([{ smtpConfig: { user: 'mailer2' } }]);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});
