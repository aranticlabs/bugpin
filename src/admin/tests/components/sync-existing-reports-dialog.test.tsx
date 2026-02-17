import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../utils';
import { SyncExistingReportsDialog } from '../../components/SyncExistingReportsDialog';

describe('SyncExistingReportsDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    integrationId: 'integration-1',
    unsyncedCount: 5,
  };

  it('renders dialog with title and description', () => {
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Enable Automatic Sync' })).toBeInTheDocument();
    expect(screen.getByText(/Automatic sync will create GitHub issues/)).toBeInTheDocument();
  });

  it('shows unsynced count in description', () => {
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} />);

    // Check the description mentions unsynced reports
    expect(screen.getByText(/not yet synced to GitHub/)).toBeInTheDocument();
  });

  it('shows sync all option when there are unsynced reports', () => {
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} />);

    expect(screen.getByText('Sync all existing reports')).toBeInTheDocument();
    expect(screen.getByText(/Queue 5 existing reports for sync/)).toBeInTheDocument();
  });

  it('shows only future option when there are no unsynced reports', () => {
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} unsyncedCount={0} />);

    expect(screen.queryByText('Sync all existing reports')).not.toBeInTheDocument();
    expect(screen.getByText('Only sync future reports')).toBeInTheDocument();
  });

  it('defaults to future reports option', () => {
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} />);

    const futureOption = screen.getByText('Only sync future reports').closest('button');
    expect(futureOption).toHaveClass('border-primary');
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with false when future only is selected', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /enable automatic sync/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(false);
    });
  });

  it('syncs all reports and calls onConfirm with true when all is selected', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    server.use(
      http.post('/api/integrations/:id/sync-existing', () => {
        return HttpResponse.json({
          success: true,
          message: 'Queued 5 reports for sync',
          queued: 5,
        });
      }),
    );

    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} onConfirm={onConfirm} />);

    // Select "sync all" option
    await user.click(screen.getByText('Sync all existing reports'));

    // Confirm
    await user.click(screen.getByRole('button', { name: /enable automatic sync/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(true);
    });
  });

  it('shows loading state while syncing', async () => {
    const user = userEvent.setup();

    server.use(
      http.post('/api/integrations/:id/sync-existing', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return HttpResponse.json({
          success: true,
          message: 'Queued 5 reports for sync',
          queued: 5,
        });
      }),
    );

    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} />);

    // Select "sync all" option
    await user.click(screen.getByText('Sync all existing reports'));

    // Confirm
    await user.click(screen.getByRole('button', { name: /enable automatic sync/i }));

    // Should show loading state
    expect(screen.getByText(/syncing/i)).toBeInTheDocument();
  });

  it('handles singular report count correctly', () => {
    renderWithProviders(<SyncExistingReportsDialog {...defaultProps} unsyncedCount={1} />);

    expect(screen.getByText(/1 existing report not yet synced/)).toBeInTheDocument();
    expect(screen.getByText(/Queue 1 existing report for sync/)).toBeInTheDocument();
  });
});
