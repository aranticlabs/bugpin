import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithQueryAndRouter, screen, userEvent, waitFor } from '../../utils';
import { DataPrivacy } from '../../../pages/console/DataPrivacy';
import { toast } from 'sonner';
import { mockSettingsServer } from './settingsServer';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('Data & Privacy', () => {
  it('saves privacy and retention edits from both tabs, each with only its own value', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    renderWithQueryAndRouter(<DataPrivacy />);

    await user.click(await screen.findByRole('switch', { name: 'Enable EU Privacy Mode' }));
    await user.click(screen.getByRole('tab', { name: 'Data' }));
    fireEvent.change(await screen.findByLabelText(/retention period/i), {
      target: { value: '120' },
    });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toHaveLength(2));
    expect(settingsServer.puts).toEqual(
      expect.arrayContaining([{ privacy: { euPrivacyMode: true } }, { retentionDays: 120 }])
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    );
  });

  it('shows the server error and keeps the edit when saving fails', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    settingsServer.failNext();
    renderWithQueryAndRouter(<DataPrivacy />);

    const privacySwitch = await screen.findByRole('switch', { name: 'Enable EU Privacy Mode' });
    await user.click(privacySwitch);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Saving failed on the server'));
    expect(privacySwitch).toBeChecked();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});
