import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { Dialog } from '../../../pages/widget/Dialog';
import { Button } from '../../../pages/widget/Button';
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
        onChange({
          buttonText: { en: 'Report issue', 'pt-BR': 'Relatar problema' },
          tooltipEnabled: true,
          tooltipText: { en: 'Need help?', 'pt-BR': 'Precisa de ajuda?' },
        })
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
  vi.restoreAllMocks();
});

describe('Widget settings pages', () => {
  it('saves widget dialog colors and resets to defaults', async () => {
    const user = userEvent.setup();

    renderWithQuery(<Dialog />);

    expect(await screen.findByText('Widget Dialog Settings')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Show BugPin branding' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change widget colors/i }));
    await user.click(screen.getByRole('button', { name: /save colors/i }));

    await waitFor(() => {
      expect(brandingApiMocks.updateWidgetPrimaryColors).toHaveBeenCalled();
      const [colors] = brandingApiMocks.updateWidgetPrimaryColors.mock.calls[0] ?? [];
      expect(colors).toEqual(expect.objectContaining({ lightButtonColor: '#123456' }));
      expect(toast.success).toHaveBeenCalled();
    });

    // Reset to default should only load defaults into form, not save
    brandingApiMocks.updateWidgetPrimaryColors.mockClear();
    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    // Verify it did NOT trigger a save
    expect(brandingApiMocks.updateWidgetPrimaryColors).not.toHaveBeenCalled();
  });

  it('saves and resets widget launcher button settings', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQuery(<Button />);

    expect(await screen.findByText('Widget Button Settings')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change widget button/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          widgetLauncherButton: expect.objectContaining({
            buttonText: expect.objectContaining({
              en: 'Report issue',
              'pt-BR': 'Relatar problema',
            }),
            tooltipEnabled: true,
            tooltipText: expect.objectContaining({
              en: 'Need help?',
              'pt-BR': 'Precisa de ajuda?',
            }),
          }),
        })
      );
      expect(toast.success).toHaveBeenCalled();
    });

    // Reset to default should only load defaults into form, not save
    putSpy.mockClear();
    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    // Verify it did NOT trigger a save
    expect(putSpy).not.toHaveBeenCalled();
  });
});

it('shows branding by default for a white-label license and persists both toggle choices', async () => {
  const config = await brandingApiMocks.getConfig();
  let hidePoweredBy = false;
  brandingApiMocks.getConfig.mockImplementation(async () => ({
    ...config,
    whiteLabel: { enabled: true, hidePoweredBy },
  }));
  const put = vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
    hidePoweredBy = (body as { hidePoweredBy: boolean }).hidePoweredBy;
    return { data: { success: true } };
  });
  const user = userEvent.setup();
  const first = renderWithQuery(<Dialog />);
  const toggle = await screen.findByRole('switch', { name: 'Show BugPin branding' });
  expect(toggle).toBeChecked();
  await user.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(put).toHaveBeenLastCalledWith('/white-label/config', { hidePoweredBy: true });
  first.unmount();
  renderWithQuery(<Dialog />);
  const restored = await screen.findByRole('switch', { name: 'Show BugPin branding' });
  expect(restored).not.toBeChecked();
  await user.click(restored);
  await waitFor(() => expect(restored).toBeChecked());
  expect(put).toHaveBeenLastCalledWith('/white-label/config', { hidePoweredBy: false });
});

it('keeps the saved branding choice when updating it fails', async () => {
  const config = await brandingApiMocks.getConfig();
  brandingApiMocks.getConfig.mockResolvedValue({
    ...config,
    whiteLabel: { enabled: true, hidePoweredBy: false },
  });
  vi.spyOn(api, 'put').mockRejectedValue(new Error('License unavailable'));
  const user = userEvent.setup();
  renderWithQuery(<Dialog />);
  const toggle = await screen.findByRole('switch', { name: 'Show BugPin branding' });
  await user.click(toggle);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update widget branding'));
  expect(toggle).toBeChecked();
});
