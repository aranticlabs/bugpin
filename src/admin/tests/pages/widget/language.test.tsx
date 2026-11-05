import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { Language } from '../../../pages/widget/Language';
import { api } from '../../../api/client';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function mockSettings(language: { mode: 'auto' | 'manual'; defaultLanguage: string }) {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/settings') {
      return { data: { success: true, settings: { language } } };
    }
    return { data: {} };
  });
}

describe('Widget Language page', () => {
  it('shows the stored default language instead of the placeholder', async () => {
    mockSettings({ mode: 'auto', defaultLanguage: 'de' });

    renderWithProviders(<Language />);

    const trigger = await screen.findByRole('combobox', { name: /default language/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Deutsch'));
    expect(trigger).not.toHaveAttribute('data-placeholder');
  });

  it('keeps the stored default language when only the mode changes', async () => {
    const user = userEvent.setup();
    mockSettings({ mode: 'manual', defaultLanguage: 'de' });
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });

    renderWithProviders(<Language />);

    const trigger = await screen.findByRole('combobox', { name: /default language/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Deutsch'));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Auto-detect' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        language: { mode: 'auto', defaultLanguage: 'de' },
      });
    });
  });

  it('shows an error instead of the form when loading fails, and recovers on retry', async () => {
    const user = userEvent.setup();
    let failNext = true;
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/settings') {
        if (failNext) {
          failNext = false;
          throw new Error('Network Error');
        }
        return {
          data: {
            success: true,
            settings: { language: { mode: 'manual', defaultLanguage: 'de' } },
          },
        };
      }
      return { data: {} };
    });
    const putSpy = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });

    renderWithProviders(<Language />);

    expect(await screen.findByText(/language settings could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /default language/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));

    const trigger = await screen.findByRole('combobox', { name: /default language/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Deutsch'));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Auto-detect' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/settings', {
        language: { mode: 'auto', defaultLanguage: 'de' },
      });
    });
  });
});
