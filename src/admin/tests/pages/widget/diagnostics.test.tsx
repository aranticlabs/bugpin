import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { Diagnostics } from '../../../pages/widget/Diagnostics';
import { api } from '../../../api/client';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Diagnostics defaults page', () => {
  it('saves the instance diagnostics defaults', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as never);

    renderWithQuery(<Diagnostics />);

    const networkSwitch = await screen.findByRole('switch', { name: 'Network failures' });
    expect(networkSwitch).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('switch', { name: 'Storage key names' })).toHaveAttribute(
      'data-state',
      'unchecked'
    );
    expect(screen.queryByRole('switch', { name: /custom/i })).not.toBeInTheDocument();

    await user.click(networkSwitch);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        diagnostics: {
          activityCapture: true,
          consoleCapture: true,
          networkCapture: false,
          storageKeysCapture: false,
        },
      })
    );
  });

  it('locks the activity trail while EU Privacy Mode is on', async () => {
    server.use(
      http.get('/api/settings', () =>
        HttpResponse.json({
          success: true,
          settings: {
            privacy: { euPrivacyMode: true },
            diagnostics: {
              activityCapture: true,
              consoleCapture: true,
              networkCapture: true,
              storageKeysCapture: false,
            },
          },
        })
      )
    );

    renderWithQuery(<Diagnostics />);

    const activitySwitch = await screen.findByRole('switch', { name: 'User activity trail' });
    expect(activitySwitch).toBeDisabled();
    expect(activitySwitch).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByText(/disabled for every project by EU Privacy Mode/i)).toBeInTheDocument();
  });
});
