import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, userEvent, waitFor } from '../utils';
import { server } from '../mocks/server';
import { usePreference } from '../../hooks/useUserPreferences';
import { ThemePreferenceSync } from '../../components/ThemePreferenceSync';
import { useTheme } from '../../contexts/ThemeContext';

let stored: Record<string, unknown>;
let patches: Array<Record<string, unknown>>;

function serveStoredPreferences() {
  server.use(
    http.get('/api/user-preferences/me', () =>
      HttpResponse.json({ success: true, preferences: stored })
    ),
    http.patch('/api/user-preferences/me', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patches.push(body);
      stored = { ...stored, ...body };
      return HttpResponse.json({ success: true, preferences: stored });
    })
  );
}

function OpenToggle({ cache = false }: { cache?: boolean }) {
  const [open, setOpen] = usePreference('reportDetailsOpen', true, {
    cache,
    legacyKey: 'legacy-open',
    parseLegacy: (raw) => raw === 'true',
  });
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {open ? 'Open' : 'Closed'}
    </button>
  );
}

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <ThemePreferenceSync />
      <span>Theme: {theme}</span>
      <button type="button" onClick={() => setTheme('light')}>
        Use light
      </button>
    </>
  );
}

beforeEach(() => {
  stored = {};
  patches = [];
  localStorage.clear();
  serveStoredPreferences();
});

describe('usePreference', () => {
  it('uses the stored value and saves changes', async () => {
    stored = { reportDetailsOpen: false };
    const user = userEvent.setup();
    renderWithProviders(<OpenToggle />);

    const button = await screen.findByRole('button', { name: 'Closed' });
    await user.click(button);

    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    await waitFor(() => expect(patches).toEqual([{ reportDetailsOpen: true }]));
  });

  it('moves a value from a former localStorage key into the preferences once', async () => {
    localStorage.setItem('legacy-open', 'false');
    renderWithProviders(<OpenToggle />);

    expect(screen.getByRole('button', { name: 'Closed' })).toBeInTheDocument();
    await waitFor(() => expect(patches).toEqual([{ reportDetailsOpen: false }]));
    expect(localStorage.getItem('legacy-open')).toBeNull();
  });

  it('keeps the stored value over a former localStorage key', async () => {
    stored = { reportDetailsOpen: true };
    localStorage.setItem('legacy-open', 'false');
    renderWithProviders(<OpenToggle />);

    expect(await screen.findByRole('button', { name: 'Open' })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('legacy-open')).toBeNull());
    expect(patches).toEqual([]);
  });

  it('keeps a browser copy for the first render when caching is on', async () => {
    stored = { reportDetailsOpen: false };
    const first = renderWithProviders(<OpenToggle cache />);
    await screen.findByRole('button', { name: 'Closed' });
    await waitFor(() =>
      expect(localStorage.getItem('bugpin.preference.reportDetailsOpen')).toBe('false')
    );
    first.unmount();

    renderWithProviders(<OpenToggle cache />);
    expect(screen.getByRole('button', { name: 'Closed' })).toBeInTheDocument();
  });
});

describe('ThemePreferenceSync', () => {
  it('applies the stored theme after sign-in', async () => {
    stored = { theme: 'dark' };
    renderWithProviders(<ThemeProbe />);

    expect(await screen.findByText('Theme: dark')).toBeInTheDocument();
    expect(patches).toEqual([]);
  });

  it('saves the browser theme once when none is stored, then saves changes', async () => {
    localStorage.setItem('bugpin-theme', 'dark');
    const user = userEvent.setup();
    renderWithProviders(<ThemeProbe />);

    await waitFor(() => expect(patches).toEqual([{ theme: 'dark' }]));
    await user.click(screen.getByRole('button', { name: 'Use light' }));
    await waitFor(() => expect(patches).toEqual([{ theme: 'dark' }, { theme: 'light' }]));
  });
});
