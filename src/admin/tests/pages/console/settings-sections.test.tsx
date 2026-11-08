import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  renderWithProviders,
  renderWithQueryAndRouter,
  screen,
  userEvent,
  waitFor,
  fireEvent,
} from '../../utils';
import { DataRetention, Settings } from '../../../pages/console/Settings';
import { Recording } from '../../../pages/widget/Recording';
import { Screenshot } from '../../../pages/widget/Screenshot';
import {
  InvitationSettingsCard,
  NetworkSettingsCard,
  PasswordPolicyCard,
  SessionSettingsCard,
  TwoFactorPolicyCard,
} from '../../../pages/console/Security';
import { Privacy } from '../../../pages/console/Privacy';
import { SMTP } from '../../../pages/console/SMTP';
import { api } from '../../../api/client';
import { toast } from 'sonner';
import { mockSettingsServer } from './settingsServer';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Settings sections', () => {
  it('submits general settings updates', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<Settings />);

    await screen.findByDisplayValue('BugPin');
    const appNameInput = screen.getByLabelText(/application name/i);

    await user.clear(appNameInput);
    await user.type(appNameInput, 'New App Name');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ appName: 'New App Name' })
      );
    });
    expect(putSpy.mock.calls[0][1]).not.toHaveProperty('retentionDays');
  });

  it('saves data retention on its own', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<DataRetention />);

    const retentionInput = await screen.findByLabelText(/retention period/i);
    fireEvent.change(retentionInput, { target: { value: '120' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', { retentionDays: 120 });
    });
  });

  it('submits the update-check toggle when switched off and back on', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<Settings />);

    const updateSwitch = await screen.findByRole('switch', { name: /check for updates/i });
    expect(updateSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(updateSwitch);
    expect(updateSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ updateCheckEnabled: false })
      );
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    );
    putSpy.mockClear();

    await user.click(updateSwitch);
    expect(updateSwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(await screen.findByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({ updateCheckEnabled: true })
      );
    });
  });

  it('submits screenshot settings updates', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<Screenshot />);

    await screen.findByLabelText(/maximum screenshot size/i);
    expect(screen.queryByLabelText(/maximum video upload size/i)).not.toBeInTheDocument();

    const screenCaptureSwitch = screen.getByRole('switch', { name: /use screen capture api/i });
    await user.click(screenCaptureSwitch);

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        screenshot: { useScreenCaptureAPI: true },
      });
    });
  });

  it('submits recording settings without touching screenshot settings', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();

    renderWithQueryAndRouter(<Recording />);

    const uploadSizeInput = await screen.findByLabelText(/maximum video upload size/i);
    expect(uploadSizeInput).toHaveAttribute('max', '100');
    expect(screen.queryByLabelText(/maximum screenshot size/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /enable screen recording/i }));
    await waitFor(() => expect(settingsServer.puts).toHaveLength(1));
    await user.click(screen.getByRole('switch', { name: /allow microphone recording/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toHaveLength(2));
    expect(settingsServer.puts).toEqual([
      { screenshot: { enableScreenRecording: true } },
      { screenshot: { allowRecordingMicrophone: true } },
    ]);
    expect(toast.success).toHaveBeenCalledWith('Recording settings saved successfully');
  });

  it('saves network settings on their own', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<NetworkSettingsCard />);

    const rateLimitInput = await screen.findByLabelText(/requests per minute/i);
    fireEvent.change(rateLimitInput, { target: { value: '120' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', { rateLimitPerMinute: 120 });
    });
  });

  it('saves the session duration on its own', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<SessionSettingsCard />);

    const sessionInput = await screen.findByLabelText(/session duration/i);
    fireEvent.change(sessionInput, { target: { value: '14' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', { sessionMaxAgeDays: 14 });
    });
  });

  it('saves the invitation expiration on its own', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<InvitationSettingsCard />);

    const invitationInput = await screen.findByLabelText(/invitation expiration/i);
    fireEvent.change(invitationInput, { target: { value: '14' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', { invitationExpirationDays: 14 });
    });
  });

  it('saves the password policy on its own', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<PasswordPolicyCard />);

    const minLength = await screen.findByLabelText(/minimum length/i);
    await waitFor(() => expect(minLength).toHaveValue(12));
    fireEvent.change(minLength, { target: { value: '16' } });
    await user.click(screen.getByLabelText(/special character/i));
    expect(
      screen.getByText(
        'New passwords need at least 16 characters, including an uppercase letter, a number and a special character.'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        passwordPolicy: {
          minLength: 16,
          requireUppercase: true,
          requireLowercase: false,
          requireNumber: true,
          requireSymbol: true,
        },
      });
    });
  });

  it('saves the two-factor policy on its own', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<TwoFactorPolicyCard />);

    await screen.findAllByText('Admins Only');
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'All Users' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', { twoFactorPolicy: 'everyone' });
    });
  });

  it('enables EU Privacy Mode', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<Privacy />);

    expect(await screen.findByText(/activity trails are available/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn how EU Privacy Mode works/i })).toHaveAttribute(
      'href',
      'https://docs.bugpin.io/privacy/eu-privacy-mode'
    );

    await user.click(screen.getByRole('switch', { name: 'Enable EU Privacy Mode' }));
    expect(screen.getByText(/disabled for all projects/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        privacy: {
          euPrivacyMode: true,
        },
      });
    });
  });

  it('blocks privacy changes until settings can be loaded', async () => {
    const user = userEvent.setup();
    const getSpy = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: { settings: { privacy: { euPrivacyMode: true } } },
      } as unknown);
    const putSpy = vi.spyOn(api, 'put');

    renderWithQueryAndRouter(<Privacy />);

    expect(await screen.findByText(/privacy settings could not be loaded/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Enable EU Privacy Mode' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(putSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    const privacySwitch = await screen.findByRole('switch', { name: 'Enable EU Privacy Mode' });
    expect(privacySwitch).toHaveAttribute('data-state', 'checked');
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it('submits SMTP settings and sends test email', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithProviders(<SMTP />);

    const hostInput = await screen.findByLabelText(/smtp host/i);
    await user.click(screen.getByRole('switch', { name: /enable email/i }));
    await user.type(hostInput, 'smtp.example.com');
    await user.type(screen.getByLabelText(/from email address/i), 'bugs@example.com');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toHaveLength(1));
    expect(settingsServer.puts[0]).toEqual({
      smtpEnabled: true,
      smtpConfig: { host: 'smtp.example.com', from: 'bugs@example.com' },
    });

    await user.click(screen.getByRole('button', { name: /send test email/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/settings/test-email', {
        smtpConfig: { host: 'smtp.example.com', port: 587, user: '', from: 'bugs@example.com' },
        testEmail: expect.stringMatching(/@/),
        appName: 'BugPin',
      });
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('rejects an application name made of whitespace', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();

    renderWithProviders(<Settings />);

    const appNameInput = await screen.findByDisplayValue('BugPin');
    await user.clear(appNameInput);
    await user.type(appNameInput, '   ');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Application name is required')).toBeInTheDocument();
    expect(settingsServer.puts).toHaveLength(0);
  });

  it('sends the trimmed application name and only the changed fields', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();

    renderWithProviders(<Settings />);

    const appNameInput = await screen.findByDisplayValue('BugPin');
    await user.clear(appNameInput);
    await user.type(appNameInput, '  Bug Tracker  ');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toEqual([{ appName: 'Bug Tracker' }]));
  });

  it('rejects a retention period that is not a whole number', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();

    renderWithQueryAndRouter(<DataRetention />);

    const retentionInput = await screen.findByLabelText(/retention period/i);
    fireEvent.change(retentionInput, { target: { value: '12.5' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Enter a whole number of days')).toBeInTheDocument();
    expect(settingsServer.puts).toHaveLength(0);
  });
});
