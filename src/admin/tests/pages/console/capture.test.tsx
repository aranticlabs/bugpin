import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithQueryAndRouter, screen, userEvent, waitFor } from '../../utils';
import { Capture } from '../../../pages/widget/Capture';
import { mockSettingsServer } from './settingsServer';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('Capture settings', () => {
  it('saves screenshot and recording edits separately, each with only its own fields', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer({ screenshot: { enableScreenRecording: true } });
    renderWithQueryAndRouter(<Capture />);

    fireEvent.change(await screen.findByLabelText(/maximum screenshot size/i), {
      target: { value: '20' },
    });
    await user.click(screen.getByRole('tab', { name: 'Recording' }));
    fireEvent.change(screen.getByLabelText(/maximum recording duration/i), {
      target: { value: '300' },
    });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(settingsServer.puts).toHaveLength(2));
    expect(settingsServer.puts).toEqual(
      expect.arrayContaining([
        { screenshot: { maxScreenshotSize: 20 } },
        { screenshot: { maxRecordingDurationSeconds: 300 } },
      ])
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    );
  });

  it('keeps unsaved screenshot edits when the recording switch saves on its own', async () => {
    const user = userEvent.setup();
    const settingsServer = mockSettingsServer();
    renderWithQueryAndRouter(<Capture />);

    const screenshotSize = await screen.findByLabelText(/maximum screenshot size/i);
    fireEvent.change(screenshotSize, { target: { value: '20' } });
    await user.click(screen.getByRole('tab', { name: 'Recording' }));
    await user.click(screen.getByRole('switch', { name: /enable screen recording/i }));

    await waitFor(() =>
      expect(settingsServer.puts).toEqual([{ screenshot: { enableScreenRecording: true } }])
    );
    expect(screen.getByRole('switch', { name: /enable screen recording/i })).toBeChecked();
    expect(screenshotSize).toHaveValue(20);

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(settingsServer.puts).toHaveLength(2));
    expect(settingsServer.puts[1]).toEqual({ screenshot: { maxScreenshotSize: 20 } });
  });
});
