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
    colorMode,
    onColorModeChange,
  }: {
    onChange: (value: Record<string, string>) => void;
    colorMode?: 'light' | 'dark';
    onColorModeChange?: (mode: 'light' | 'dark') => void;
  }) => (
    <>
      <button type="button" onClick={() => onChange({ lightButtonColor: '#123456' })}>
        Change Widget Colors
      </button>
      <button type="button" onClick={() => onColorModeChange?.('light')}>
        Edit light colors
      </button>
      <p>Editing {colorMode} colors</p>
    </>
  ),
}));

vi.mock('../../../components/WidgetLauncherButtonSettingsForm', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../components/WidgetLauncherButtonSettingsForm')
  >()),
  WidgetLauncherButtonSettingsForm: ({
    onChange,
    part,
  }: {
    onChange: (value: Record<string, unknown>) => void;
    part?: 'general' | 'colors';
  }) =>
    part === 'colors' ? (
      <p>Launcher colors</p>
    ) : (
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
  localStorage.removeItem('bugpin-theme');
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
      expect(colors).toEqual({ lightButtonColor: '#123456' });
      expect(toast.success).toHaveBeenCalled();
    });

    // Reset to default should only load defaults into form, not save
    brandingApiMocks.updateWidgetPrimaryColors.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reset to Light Default' }));

    // Verify it did NOT trigger a save
    expect(brandingApiMocks.updateWidgetPrimaryColors).not.toHaveBeenCalled();
  });

  it('resets only the dialog colors of the mode being edited', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bugpin-theme', 'dark');

    renderWithQueryAndRouter(<Dialog />);

    await user.click(await screen.findByRole('button', { name: /change widget colors/i }));
    await user.click(screen.getByRole('button', { name: 'Reset to Dark Default' }));
    expect(brandingApiMocks.updateWidgetPrimaryColors).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const [colors] = brandingApiMocks.updateWidgetPrimaryColors.mock.calls[0] ?? [];
      expect(colors).toEqual(
        expect.objectContaining({
          lightButtonColor: '#123456',
          darkButtonColor: '#02658D',
          darkTextColor: '#ffffff',
        })
      );
      expect(colors).not.toHaveProperty('lightTextColor');
    });
    localStorage.removeItem('bugpin-theme');
  });

  it('saves custom dialog texts and the priority switch from the General tab', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<Dialog />);

    await user.click(await screen.findByRole('switch', { name: 'Use custom Dialog Title' }));
    const titleInput = screen.getAllByRole('textbox')[0];
    expect(titleInput).toHaveValue('Report a Bug');
    await user.clear(titleInput);
    await user.type(titleInput, 'Send Feedback');
    await user.click(screen.getByRole('switch', { name: 'Show Priority' }));

    const preview = screen.getByLabelText('Dialog preview');
    expect(within(preview).getByText('Send Feedback')).toBeInTheDocument();
    expect(within(preview).queryByRole('combobox', { name: 'Priority' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        widgetDialogContent: {
          title: expect.objectContaining({ en: 'Send Feedback', de: 'Bug melden' }),
          showPriority: false,
        },
      });
    });
  });

  it('saves and resets widget launcher button settings', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<Button />);

    await user.click(await screen.findByRole('button', { name: /change widget button/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        widgetLauncherButton: {
          buttonText: { en: 'Report issue' },
          tooltipEnabled: true,
          tooltipText: { en: 'Need help?' },
        },
      });
      expect(toast.success).toHaveBeenCalled();
    });

    // Reset to default should only load defaults into form, not save
    putSpy.mockClear();
    await user.click(screen.getByRole('button', { name: /reset to default/i }));

    // Verify it did NOT trigger a save
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('sends only the launcher fields that a reset changed', async () => {
    const user = userEvent.setup();
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } } as unknown);

    renderWithQueryAndRouter(<Button />);

    await screen.findByRole('button', { name: /change widget button/i });
    await user.click(screen.getByRole('button', { name: /reset to default/i }));
    expect(putSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        widgetLauncherButton: { buttonIcon: 'bug', tooltipEnabled: true },
      })
    );
  });

  it('splits the launcher button into General and Colors tabs', async () => {
    renderWithQueryAndRouter(<Button />);

    await screen.findByRole('button', { name: /change widget button/i });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['General', 'Colors']);
    expect(screen.getByText('Launcher colors')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reset to (light|dark) default/i })
    ).toBeInTheDocument();
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

  it('opens the colors and preview in the console theme and switches them together', async () => {
    const user = userEvent.setup();
    localStorage.setItem('bugpin-theme', 'dark');

    renderWithQueryAndRouter(<Dialog />);

    await screen.findByRole('button', { name: /change widget colors/i });
    expect(screen.getByText('Editing dark colors')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dark' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Dialog preview').style.getPropertyValue('--wp-background')).toBe(
      '#0a0a0a'
    );

    await user.click(screen.getByRole('button', { name: 'Edit light colors' }));
    expect(screen.getByText('Editing light colors')).toBeInTheDocument();
    expect(screen.getByLabelText('Dialog preview').style.getPropertyValue('--wp-background')).toBe(
      '#ffffff'
    );
    localStorage.removeItem('bugpin-theme');
  });

  it('shows the dialog colors first and the preview without a collapse toggle', async () => {
    renderWithQueryAndRouter(<Dialog />);

    const colors = await screen.findByRole('button', { name: /change widget colors/i });
    const preview = screen.getByLabelText('Dialog preview');
    expect(colors.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /live preview/i })).not.toBeInTheDocument();
  });
});
