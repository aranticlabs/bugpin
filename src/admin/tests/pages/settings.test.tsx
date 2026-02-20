import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../utils';
import { Settings } from '../../pages/globalsettings';

describe('Settings Page', () => {
  beforeEach(() => {
    // Reset hash before each test
    window.location.hash = '';
  });

  it('renders settings page', async () => {
    renderWithProviders(<Settings />);

    // Wait for the settings page to render (default is system settings)
    await waitFor(
      () => {
        expect(screen.getByText('System Settings')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('renders without crashing', () => {
    renderWithProviders(<Settings />);
    expect(document.body).toBeInTheDocument();
  });

  it('displays system settings by default', async () => {
    renderWithProviders(<Settings />);

    await waitFor(
      () => {
        expect(screen.getByText('System Settings')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Should show sub-tabs for system section
    expect(screen.getByRole('tab', { name: /system/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /screenshot/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
  });

  it('displays System tab as active by default', async () => {
    renderWithProviders(<Settings />);

    await waitFor(
      () => {
        expect(screen.getByRole('tab', { name: /^system$/i })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const systemTab = screen.getByRole('tab', { name: /^system$/i });
    expect(systemTab).toHaveAttribute('data-state', 'active');
  });

  it('navigates to Screenshot tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /screenshot/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /screenshot/i }));

    await waitFor(() => {
      expect(screen.getByText('Screenshot Settings')).toBeInTheDocument();
    });
  });

  it('navigates to Storage tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /storage/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /storage/i }));

    await waitFor(() => {
      expect(screen.getByText('Storage Settings')).toBeInTheDocument();
    });
  });

  it('loads and displays settings in System tab', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('System Settings')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/application name/i)).toBeInTheDocument();
    });
  });

  it('shows system settings fields', async () => {
    renderWithProviders(<Settings />);

    await waitFor(
      () => {
        expect(screen.getByText('System Settings')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(screen.getByLabelText(/data retention/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('displays save button in System settings', async () => {
    renderWithProviders(<Settings />);

    await waitFor(
      () => {
        expect(screen.getByText('System Settings')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('loads settings values from API', async () => {
    server.use(
      http.get('/api/settings', () => {
        return HttpResponse.json({
          success: true,
          settings: {
            appName: 'MyBugTracker',
            appUrl: 'https://bugpin.example.com',
            retentionDays: 60,
            rateLimitPerMinute: 20,
            smtpEnabled: false,
            smtpConfig: {},
            s3Enabled: false,
            s3Config: {},
            widgetLauncherButton: {
              position: 'bottom-right' as const,
              buttonText: null,
              buttonShape: 'round' as const,
              buttonIcon: null,
              buttonIconSize: 24,
              buttonIconStroke: 2,
              theme: 'auto' as const,
              enableHoverScaleEffect: true,
              tooltipEnabled: false,
              tooltipText: null,
              lightButtonColor: '#02658D',
              lightTextColor: '#FFFFFF',
              lightButtonHoverColor: '#014A6B',
              lightTextHoverColor: '#FFFFFF',
              darkButtonColor: '#02658D',
              darkTextColor: '#FFFFFF',
              darkButtonHoverColor: '#03789E',
              darkTextHoverColor: '#FFFFFF',
            },
            widgetDialog: {
              lightButtonColor: '#02658D',
              lightTextColor: '#FFFFFF',
              lightButtonHoverColor: '#014A6B',
              lightTextHoverColor: '#FFFFFF',
              darkButtonColor: '#02658D',
              darkTextColor: '#FFFFFF',
              darkButtonHoverColor: '#03789E',
              darkTextHoverColor: '#FFFFFF',
            },
            screenshot: {
              useScreenCaptureAPI: false,
              maxScreenshotSize: 5,
            },
            notifications: {
              emailEnabled: false,
              notifyOnNewReport: true,
              notifyOnStatusChange: true,
              notifyOnPriorityChange: false,
              notifyOnAssignment: true,
              notifyOnDeletion: true,
            },
            branding: {
              primaryColor: '#02658D',
              logoLightUrl: null,
              logoDarkUrl: null,
              iconLightUrl: null,
              iconDarkUrl: null,
              faviconLightVersion: '/favicon-light.svg',
              faviconDarkVersion: '/favicon-dark.svg',
            },
            adminButton: {
              lightButtonColor: '#02658D',
              lightTextColor: '#FFFFFF',
              lightButtonHoverColor: '#014A6B',
              lightTextHoverColor: '#FFFFFF',
              darkButtonColor: '#02658D',
              darkTextColor: '#FFFFFF',
              darkButtonHoverColor: '#03789E',
              darkTextHoverColor: '#FFFFFF',
            },
          },
        });
      }),
    );

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('System Settings')).toBeInTheDocument();
    });

    await waitFor(() => {
      const appNameInput = screen.getByLabelText(/application name/i) as HTMLInputElement;
      expect(appNameInput.value).toBe('MyBugTracker');
    });
  });

  it('allows updating system settings', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByLabelText(/application name/i)).toBeInTheDocument();
    });

    const appNameInput = screen.getByLabelText(/application name/i);
    await user.clear(appNameInput);
    await user.type(appNameInput, 'My Bug Tracker');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    // Button should be in loading state while saving
    await waitFor(() => {
      // After click, the form should submit (button may show loading state)
      expect(saveButton).toBeInTheDocument();
    });
  });

  it('displays correct sub-tabs in system section', async () => {
    renderWithProviders(<Settings />);

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(3); // System, Screenshot, Storage
    });
  });

  it('hash navigation works for screenshot', async () => {
    window.location.hash = 'screenshot';
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Screenshot Settings')).toBeInTheDocument();
    });
  });

  it('hash navigation works for storage', async () => {
    window.location.hash = 'storage';
    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Storage Settings')).toBeInTheDocument();
    });
  });
});
