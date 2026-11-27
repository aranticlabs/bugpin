import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { server } from '../../mocks/server';
import { ReporterPortalDefaults } from '../../../pages/console/ReporterPortalDefaults';
import { mockSettingsServer } from './settingsServer';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function mockOverview(initial: { prerequisites?: string[]; claimableReports?: number } = {}) {
  let claimableReports = initial.claimableReports ?? 0;
  const claims: number[] = [];
  server.use(
    http.get('/api/settings/reporter-portal', () =>
      HttpResponse.json({
        success: true,
        prerequisites: initial.prerequisites ?? [],
        claimableReports,
      })
    ),
    http.post('/api/settings/reporter-portal/claim-existing', () => {
      claims.push(claimableReports);
      const count = claimableReports;
      claimableReports = 0;
      return HttpResponse.json({ success: true, count });
    })
  );
  return { claims };
}

const enableLabel = 'Let reporters see their reports';
const reportsLabel = 'Allow new reports from the portal';

describe('ReporterPortalDefaults', () => {
  it('renders both switches reflecting the saved defaults', async () => {
    mockSettingsServer({ reporterPortal: { enabled: true, allowNewReports: false } });
    mockOverview();
    renderWithProviders(<ReporterPortalDefaults />);

    expect(await screen.findByLabelText(enableLabel)).toBeChecked();
    expect(screen.getByLabelText(reportsLabel)).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('saves the switches through the unsaved changes bar', async () => {
    const settingsServer = mockSettingsServer();
    mockOverview();
    const user = userEvent.setup();
    renderWithProviders(<ReporterPortalDefaults />);

    await user.click(await screen.findByLabelText(enableLabel));
    await user.click(screen.getByLabelText(reportsLabel));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(settingsServer.puts).toEqual([
        { reporterPortal: { enabled: true, allowNewReports: true } },
      ])
    );
  });

  it('turns new reports off together with the portal', async () => {
    const settingsServer = mockSettingsServer({
      reporterPortal: { enabled: true, allowNewReports: true },
    });
    mockOverview();
    const user = userEvent.setup();
    renderWithProviders(<ReporterPortalDefaults />);

    await user.click(await screen.findByLabelText(enableLabel));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(settingsServer.puts).toEqual([
        { reporterPortal: { enabled: false, allowNewReports: false } },
      ])
    );
  });

  it('shows the prerequisites alert and keeps the portal switch disabled while it is off', async () => {
    mockSettingsServer();
    mockOverview({ prerequisites: ['smtp', 'https'] });
    renderWithProviders(<ReporterPortalDefaults />);

    const smtp = await screen.findByRole('link', { name: 'outgoing email (SMTP)' });
    expect(smtp).toHaveAttribute('href', '/settings/email');
    expect(screen.getByRole('link', { name: 'secure portal URLs' })).toHaveAttribute(
      'href',
      '/settings/general'
    );
    expect(screen.getByLabelText(enableLabel)).toBeDisabled();
  });

  it('keeps the portal switch usable for turning it off when prerequisites are missing', async () => {
    mockSettingsServer({ reporterPortal: { enabled: true, allowNewReports: false } });
    mockOverview({ prerequisites: ['smtp'] });
    renderWithProviders(<ReporterPortalDefaults />);

    expect(await screen.findByLabelText(enableLabel)).toBeEnabled();
  });

  it('shows no prerequisites alert when everything is configured', async () => {
    mockSettingsServer();
    mockOverview();
    renderWithProviders(<ReporterPortalDefaults />);

    await screen.findByLabelText(enableLabel);
    expect(screen.queryByText(/before the portal can be turned on/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(enableLabel)).toBeEnabled();
  });

  it('shows the claimable count, confirms, then posts claim-existing', async () => {
    mockSettingsServer();
    const overview = mockOverview({ claimableReports: 3 });
    const user = userEvent.setup();
    renderWithProviders(<ReporterPortalDefaults />);

    expect(
      await screen.findByText(/3 reports in projects with the portal on/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make existing reports claimable' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/3 reports become claimable/i)).toBeInTheDocument();
    expect(overview.claims).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Make claimable' }));

    await waitFor(() => expect(overview.claims).toEqual([3]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('3 reports are now claimable'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Make existing reports claimable' })).toBeDisabled()
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not post when the confirmation is cancelled', async () => {
    mockSettingsServer();
    const overview = mockOverview({ claimableReports: 1 });
    const user = userEvent.setup();
    renderWithProviders(<ReporterPortalDefaults />);

    expect(
      await screen.findByText(/^1 report in a project with the portal on/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make existing reports claimable' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(overview.claims).toEqual([]);
  });

  it('disables the claim button when no report is claimable', async () => {
    mockSettingsServer();
    mockOverview({ claimableReports: 0 });
    renderWithProviders(<ReporterPortalDefaults />);

    expect(
      await screen.findByRole('button', { name: 'Make existing reports claimable' })
    ).toBeDisabled();
  });

  it('reports a failed claim and keeps the dialog open', async () => {
    mockSettingsServer();
    mockOverview({ claimableReports: 2 });
    server.use(
      http.post('/api/settings/reporter-portal/claim-existing', () =>
        HttpResponse.json(
          { success: false, error: 'INTERNAL_ERROR', message: 'Claim failed' },
          { status: 500 }
        )
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<ReporterPortalDefaults />);

    await user.click(
      await screen.findByRole('button', { name: 'Make existing reports claimable' })
    );
    await user.click(await screen.findByRole('button', { name: 'Make claimable' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
