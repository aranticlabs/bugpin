import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { TestWidgetPage } from '../../pages/TestWidgetPage';

describe('TestWidgetPage', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/admin/test-widget');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it.each([
    {
      mode: 'an editable reporter',
      loggedOut: false,
      expectedName: 'Custom Test User',
      expectedEmail: 'custom-test@example.com',
    },
    {
      mode: 'no reporter while logged out',
      loggedOut: true,
      expectedName: null,
      expectedEmail: null,
    },
  ])('loads the widget with $mode', async ({ loggedOut, expectedName, expectedEmail }) => {
    localStorage.setItem('bugpin_test_api_key', 'proj_test');
    localStorage.setItem('bugpin_test_reporter_name', 'Custom Test User');
    localStorage.setItem('bugpin_test_reporter_email', 'custom-test@example.com');
    if (loggedOut) {
      localStorage.setItem('bugpin_test_reporter_logged_out', 'true');
    }

    render(
      <ThemeProvider>
        <TestWidgetPage />
      </ThemeProvider>
    );

    await waitFor(() => {
      const script = document.querySelector('script[data-api-key="proj_test"]');
      expect(script?.getAttribute('data-reporter-name')).toBe(expectedName);
      expect(script?.getAttribute('data-reporter-email')).toBe(expectedEmail);
    });
  });

  it.each(['none', 'stored', 'url'])(
    'reloads with the saved token when the previous token source is %s',
    async (source) => {
      const location = window.location;
      const reload = vi.fn();
      window.history.replaceState(
        null,
        '',
        `/admin/test-widget?keep=1${source === 'url' ? '&apiKey=proj_old' : ''}#demo`
      );
      if (source === 'stored') {
        localStorage.setItem('bugpin_test_api_key', 'proj_old');
      }
      const mockLocation = { ...location, reload };
      vi.stubGlobal(
        'window',
        new Proxy(window, {
          get: (target, property) =>
            property === 'location' ? mockLocation : Reflect.get(target, property),
        })
      );

      render(
        <ThemeProvider>
          <TestWidgetPage />
        </ThemeProvider>
      );

      if (source !== 'none') {
        fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
      }
      fireEvent.change(
        await screen.findByPlaceholderText('proj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
        { target: { value: '  proj_new  ' } }
      );
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(localStorage.getItem('bugpin_test_api_key')).toBe('proj_new');
      expect(location.search).toBe('?keep=1');
      expect(location.hash).toBe('#demo');
      expect(reload).toHaveBeenCalledOnce();
    }
  );
});
