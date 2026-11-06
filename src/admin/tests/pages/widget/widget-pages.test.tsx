import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithQueryAndRouter, screen, userEvent, waitFor, within } from '../../utils';
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

vi.mock('../../../components/WidgetDialogSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../components/WidgetDialogSettingsForm')>()),
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

vi.mock('../../../components/WidgetLauncherButtonSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../components/WidgetLauncherButtonSettingsForm')
  >()),
  WidgetLauncherButtonSettingsForm: ({
    onChange,
  }: {
    onChange: (value: Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          buttonText: { en: 'Report issue' },
          tooltipEnabled: true,
          tooltipText: { en: 'Need help?' },
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

    renderWithQueryAndRouter(<Dialog />);

    expect(
      await screen.findByRole('button', { name: /change widget colors/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Show BugPin branding' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change widget colors/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

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

    renderWithQueryAndRouter(<Button />);

    await user.click(await screen.findByRole('button', { name: /change widget button/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          widgetLauncherButton: expect.objectContaining({
            buttonText: expect.objectContaining({ en: 'Report issue' }),
            tooltipEnabled: true,
            tooltipText: expect.objectContaining({ en: 'Need help?' }),
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

  it('previews unsaved dialog colors next to the dialog settings', async () => {
    const user = userEvent.setup();

    renderWithQueryAndRouter(<Dialog />);

    await screen.findByRole('button', { name: /change widget colors/i });
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    const preview = () => screen.getByLabelText('Dialog preview');
    expect(within(preview()).getByText('Submit Report')).toBeInTheDocument();
    expect(within(preview()).getByText('Details')).toBeInTheDocument();
    expect(preview().style.getPropertyValue('--wp-primary')).toBe('#0f172a');

    await user.click(screen.getByRole('button', { name: /change widget colors/i }));
    expect(preview().style.getPropertyValue('--wp-primary')).toBe('#123456');
    expect(brandingApiMocks.updateWidgetPrimaryColors).not.toHaveBeenCalled();
  });

  it('previews the launcher button next to its settings', async () => {
    renderWithQueryAndRouter(<Button />);

    await screen.findByRole('button', { name: /change widget button/i });
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Hover over the button to see its effects.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dialog preview')).not.toBeInTheDocument();
  });

  it('opens the preview in the console theme and still allows switching', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bugpin-theme', 'dark');

    renderWithQueryAndRouter(<Dialog />);

    await screen.findByRole('button', { name: /change widget colors/i });
    expect(screen.getByRole('tab', { name: 'Dark' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByLabelText('Dialog preview').style.getPropertyValue('--wp-background')).toBe(
      '#0a0a0a'
    );

    await user.click(screen.getByRole('tab', { name: 'Light' }));
    expect(screen.getByRole('tab', { name: 'Light' })).toHaveAttribute('data-state', 'active');
    localStorage.removeItem('bugpin-theme');
  });

  it('shows the dialog colors first and lets the preview below collapse', async () => {
    const user = userEvent.setup();
    const { unmount, queryClient } = renderWithQueryAndRouter(<Dialog />);

    const colors = await screen.findByRole('button', { name: /change widget colors/i });
    const previewToggle = screen.getByRole('button', { name: /live preview/i });
    expect(
      colors.compareDocumentPosition(previewToggle) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByLabelText('Dialog preview')).toBeInTheDocument();

    await user.click(previewToggle);
    expect(screen.queryByLabelText('Dialog preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dark' })).not.toBeInTheDocument();

    unmount();
    renderWithQueryAndRouter(<Dialog />, { queryClient });
    await screen.findByRole('button', { name: /change widget colors/i });
    expect(screen.queryByLabelText('Dialog preview')).not.toBeInTheDocument();
  });
});
