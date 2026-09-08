import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { TestWidgetPage } from '../../pages/TestWidgetPage';

describe('TestWidgetPage', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
