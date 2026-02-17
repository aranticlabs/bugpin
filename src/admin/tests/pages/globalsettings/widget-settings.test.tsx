import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { WidgetDialogSettings } from '../../../pages/globalsettings/WidgetDialogSettings';
import { WidgetLauncherButtonSettings } from '../../../pages/globalsettings/WidgetLauncherButtonSettings';
import { api } from '../../../api/client';
import { toast } from 'sonner';

const brandingApiMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateWidgetPrimaryColors: vi.fn(),
}));

vi.mock('../../../api/branding', () => ({
  brandingApi: brandingApiMocks,
}));

vi.mock('../../../components/WidgetDialogSettingsForm', () => ({
  WidgetDialogSettingsForm: ({
    onChange,
  }: {
    onChange: (value: Record<string, string>) => void;
  }) => (
    <button type="button" onClick={() => onChange({ lightButtonColor: '#123456' })}>
      Change Widget Colors
    </button>
  ),
}));

vi.mock('../../../components/WidgetLauncherButtonSettingsForm', () => ({
  WidgetLauncherButtonSettingsForm: ({
    onChange,
  }: {
    onChange: (value: Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ buttonText: 'Report issue', tooltipEnabled: true, tooltipText: 'Need help?' })
      }
    >
      Change Widget Button
    </button>
  ),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  brandingApiMocks.getConfig.mockResolvedValue({
    widgetPrimaryColors: {
      lightButtonColor: '#0f172a',
      lightTextColor: '#ffffff',
      lightButtonHoverColor: '#1e293b',
      lightTextHoverColor: '#ffffff',
      darkButtonColor: '#e2e8f0',
      darkTextColor: '#0f172a',
      darkButtonHoverColor: '#cbd5f5',
      darkTextHoverColor: '#0f172a',
    },
  });
  brandingApiMocks.updateWidgetPrimaryColors.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Widget settings pages', () => {
  it('saves widget dialog colors and resets to defaults', async () => {
    const user = userEvent.setup();

    renderWithQuery(<WidgetDialogSettings />);

    expect(await screen.findByText('Widget Dialog Settings')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change widget colors/i }));
    await user.click(screen.getByRole('button', { name: /save colors/i }));

    await waitFor(() => {
      expect(brandingApiMocks.updateWidgetPrimaryColors).toHaveBeenCalled();
      const [colors] = brandingApiMocks.updateWidgetPrimaryColors.mock.calls[0] ?? [];
      expect(colors).toEqual(expect.objectContaining({ lightButtonColor: '#123456' }));
      expect(toast.success).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    await waitFor(() => {
      const calls = brandingApiMocks.updateWidgetPrimaryColors.mock.calls;
      const lastCall = calls[calls.length - 1] ?? [];
      expect(lastCall[0]).toEqual(
        expect.objectContaining({
          lightButtonColor: '#02658D',
          darkButtonColor: '#02658D',
        }),
      );
    });
  });

  it('saves and resets widget launcher button settings', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQuery(<WidgetLauncherButtonSettings />);

    expect(await screen.findByText('Widget Button Settings')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change widget button/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          widgetLauncherButton: expect.objectContaining({
            buttonText: 'Report issue',
            tooltipEnabled: true,
            tooltipText: 'Need help?',
          }),
        }),
      );
      expect(toast.success).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          widgetLauncherButton: expect.objectContaining({
            buttonIcon: 'bug',
            tooltipText: 'Found a bug?',
          }),
        }),
      );
    });
  });
});
