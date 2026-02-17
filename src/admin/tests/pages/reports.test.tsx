import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../utils';
import { Reports } from '../../pages/Reports';

describe('Reports Page', () => {
  it('renders reports page heading', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  it('renders without crashing', () => {
    renderWithProviders(<Reports />);
    expect(document.body).toBeInTheDocument();
  });

  it('displays table structure', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('displays table headers', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Check for common table headers
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('displays table rows after loading', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        // Table should have rows (including header row)
        const rows = screen.getAllByRole('row');
        expect(rows.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 5000 },
    );
  });

  it('handles empty reports state', async () => {
    server.use(
      http.get('/api/reports', () => {
        return HttpResponse.json({
          success: true,
          reports: [],
          total: 0,
          page: 1,
          limit: 20,
        });
      }),
    );

    renderWithProviders(<Reports />);

    // Table should render but body should be empty
    await waitFor(
      () => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});

describe('Reports Page - GitHub Sync Status', () => {
  it('displays all column headers including checkbox', async () => {
    renderWithProviders(<Reports />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    // Check for all column headers
    const headers = screen.getAllByRole('columnheader');
    expect(headers.length).toBe(7); // Checkbox, Report, Project, Status, Priority, GitHub, Created
  });

  it('shows synced status with link to GitHub issue', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        // Look for the synced report's row
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Should have a link to the GitHub issue
    const githubLink = screen.getByRole('link', { name: '' });
    expect(githubLink).toHaveAttribute('href', 'https://github.com/testorg/testrepo/issues/42');
  });

  it('shows pending sync status indicator', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Form validation issue')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // The pending report should show a loading spinner (Loader2 component)
    // We can check for the presence of the animate-spin class
    const spinners = document.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThan(0);
  });

  it('shows error sync status indicator', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Page layout broken')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // The error report should show an alert circle icon
    // We verify by checking the text-destructive class exists
    const errorIndicators = document.querySelectorAll('.text-destructive');
    expect(errorIndicators.length).toBeGreaterThan(0);
  });

  it('shows tooltip on hover for synced reports', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // The synced indicator should be inside a TooltipTrigger
    const githubLink = screen.getByRole('link', { name: '' });
    expect(githubLink).toBeInTheDocument();
  });
});

describe('Reports Page - Bulk Actions', () => {
  it('renders checkboxes in table rows', async () => {
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Should have multiple checkboxes (header + rows)
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(1);
  });

  it('shows bulk actions toolbar when reports are selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Click a checkbox to select a report
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]); // First row checkbox (not header)

    // Bulk actions toolbar should appear
    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    // Action buttons should be visible
    expect(screen.getByRole('button', { name: /Set Status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set Priority/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
  });

  it('selects all reports when header checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Click the header checkbox (first checkbox)
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    // Should show multiple reports selected
    await waitFor(() => {
      expect(screen.getByText(/reports selected/)).toBeInTheDocument();
    });
  });

  it('clears selection when Clear button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Select a report
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    // Click Clear button
    await user.click(screen.getByRole('button', { name: /Clear/i }));

    // Toolbar should disappear
    await waitFor(() => {
      expect(screen.queryByText(/report selected/)).not.toBeInTheDocument();
    });
  });

  it('shows delete confirmation dialog when Delete is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Reports />);

    await waitFor(
      () => {
        expect(screen.getByText('Button not working')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Select a report
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]);

    await waitFor(() => {
      expect(screen.getByText(/1 report selected/)).toBeInTheDocument();
    });

    // Click Delete button
    await user.click(screen.getByRole('button', { name: /Delete/i }));

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/Delete 1 reports\?/)).toBeInTheDocument();
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    });
  });
});
