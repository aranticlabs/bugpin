import { afterEach, expect, it, vi } from 'vitest';
import { act, renderWithQueryAndRouter, screen, userEvent, waitFor } from '../../utils';
import { License } from '../../../pages/console/License';
import { licenseApi, type LicenseStatus } from '../../../api/license';
import { ENTERPRISE_AGREEMENT_VERSION, ENTERPRISE_AGREEMENT_URL } from '@shared/enterprise-license';

afterEach(() => vi.restoreAllMocks());

it('shows a retryable error instead of an activation form when license status cannot be loaded', async () => {
  vi.spyOn(licenseApi, 'getStatus')
    .mockRejectedValueOnce(new Error('Server unavailable'))
    .mockResolvedValueOnce({ eeAvailable: true, installed: true, licensed: true });
  const activate = vi.spyOn(licenseApi, 'activate');
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load license status');
  expect(screen.queryByRole('textbox', { name: 'License Key' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Licensed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove License' })).toBeInTheDocument();
  expect(activate).not.toHaveBeenCalled();
});

it('recovers the activated card after a failed status refresh without requiring reactivation', async () => {
  const { api } = await import('../../../api/client');
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { projects: [{ id: 'proj_one', name: 'Project One' }] },
  });
  const active: LicenseStatus = {
    eeAvailable: true,
    installed: true,
    licensed: true,
    projectLimit: 1,
    licensedProjectIds: ['proj_one'],
    usedProjects: 1,
    features: ['webhooks'],
  };
  let available = false;
  const status = vi
    .spyOn(licenseApi, 'getStatus')
    .mockResolvedValueOnce({ eeAvailable: true, licensed: false })
    .mockImplementation(async () => {
      if (!available) throw new Error('Connection failed');
      return active;
    });
  const activate = vi.spyOn(licenseApi, 'activate').mockResolvedValue(undefined);
  const user = userEvent.setup();
  const view = renderWithQueryAndRouter(<License />);
  await user.type(await screen.findByRole('textbox', { name: 'License Key' }), 'test-license');
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh license status');
  expect(screen.getByRole('button', { name: 'Activate License' })).toBeDisabled();
  view.rerender(<div>Another page</div>);
  view.rerender(<License />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  available = true;
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('checkbox', { name: 'Project One' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Remove License' })).toBeInTheDocument();
  expect(screen.getByText('webhooks')).toBeInTheDocument();
  expect(status.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(activate).toHaveBeenCalledTimes(1);
});

it('waits for the updated status after activation instead of displaying an empty activation form', async () => {
  let finishStatus!: (status: LicenseStatus) => void;
  vi.spyOn(licenseApi, 'getStatus')
    .mockResolvedValueOnce({ eeAvailable: true, licensed: false })
    .mockImplementation(
      () =>
        new Promise<LicenseStatus>((resolve) => {
          finishStatus = resolve;
        })
    );
  vi.spyOn(licenseApi, 'activate').mockResolvedValue(undefined);
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  await user.type(await screen.findByRole('textbox', { name: 'License Key' }), 'test-license');
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('textbox', { name: 'License Key' })).not.toBeInTheDocument();
  await act(async () => finishStatus({ eeAvailable: true, installed: true, licensed: true }));
  expect(await screen.findByText('Licensed')).toBeInTheDocument();
});

it('shows a synced inactive license with its details and allows sync to restore it', async () => {
  const { api } = await import('../../../api/client');
  vi.spyOn(api, 'get').mockResolvedValue({ data: { projects: [] } });
  const active: LicenseStatus = {
    eeAvailable: true,
    installed: true,
    licensed: true,
    customerName: 'Customer',
    customerEmail: 'customer@example.com',
    projectLimit: 1,
    features: ['webhooks'],
  };
  let status = active;
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => status);
  const remove = vi.spyOn(licenseApi, 'remove');
  const sync = vi.spyOn(licenseApi, 'sync').mockImplementation(async () => {
    status = status.licensed
      ? { ...active, licensed: false, message: 'License inactive', features: [] }
      : active;
    return status;
  });
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  await user.click(await screen.findByRole('button', { name: 'Sync license' }));
  expect(await screen.findByText('Inactive')).toBeInTheDocument();
  expect(screen.getByText('Customer', { selector: 'p.font-medium' })).toBeInTheDocument();
  expect(screen.getByText('customer@example.com')).toBeInTheDocument();
  expect(
    screen.getByText('License inactive. Enterprise features are disabled.')
  ).toBeInTheDocument();
  expect(screen.queryByText('webhooks')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Activate License' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remove License' })).toBeInTheDocument();
  expect(remove).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Sync license' }));
  expect(await screen.findByText('Licensed')).toBeInTheDocument();
  expect(screen.getByText('webhooks')).toBeInTheDocument();
  expect(sync).toHaveBeenCalledTimes(2);
});

it.each([
  ['License has expired', '2020-01-01T00:00:00.000Z', 'Expired'],
  ['License inactive', '2099-01-01T00:00:00.000Z', 'Inactive'],
  ['License verification required', '2099-01-01T00:00:00.000Z', 'Inactive'],
  ['Any other explanation', undefined, 'Inactive'],
])(
  'shows the badge from the status fields and allows syncing when the status is %s',
  async (message, expiresAt, badge) => {
    const status = { eeAvailable: true, licensed: false, installed: true, message, expiresAt };
    vi.spyOn(licenseApi, 'getStatus').mockResolvedValue(status);
    const sync = vi.spyOn(licenseApi, 'sync').mockResolvedValue(status);
    const user = userEvent.setup();
    renderWithQueryAndRouter(<License />);
    expect(await screen.findByText(badge, { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync license' }));
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
  }
);

it('treats a project selection that was changed back as unchanged', async () => {
  const { api } = await import('../../../api/client');
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      projects: [
        { id: 'proj_one', name: 'Project One' },
        { id: 'proj_two', name: 'Project Two' },
      ],
    },
  });
  vi.spyOn(licenseApi, 'getStatus').mockResolvedValue({
    eeAvailable: true,
    installed: true,
    licensed: true,
    projectLimit: 2,
    usedProjects: 1,
    licensedProjectIds: ['proj_one'],
  });
  const select = vi.spyOn(licenseApi, 'selectProjects');
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);

  const projectTwo = await screen.findByRole('checkbox', { name: 'Project Two' });
  await user.click(projectTwo);
  expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();

  await user.click(projectTwo);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  );
  expect(select).not.toHaveBeenCalled();
});

it('warns on an active license that is also running on another server', async () => {
  const warning =
    'This license is also running on another server. Stop the other copy within 24 hours, or enterprise features turn off on both servers.';
  vi.spyOn(licenseApi, 'getStatus').mockResolvedValue({
    eeAvailable: true,
    installed: true,
    licensed: true,
    warning,
  });
  renderWithQueryAndRouter(<License />);
  expect(await screen.findByText('Licensed')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(warning);
});

it('preserves the activation form and open agreement dialog during a background status refetch', async () => {
  const unlicensed = { eeAvailable: true, licensed: false, installed: false };
  let finishRefetch!: (status: LicenseStatus) => void;
  const status = vi
    .spyOn(licenseApi, 'getStatus')
    .mockResolvedValueOnce(unlicensed)
    .mockImplementation(
      () =>
        new Promise<LicenseStatus>((resolve) => {
          finishRefetch = resolve;
        })
    );
  const user = userEvent.setup();
  const { queryClient } = renderWithQueryAndRouter(<License />);
  const input = await screen.findByRole('textbox', { name: 'License Key' });
  await user.type(input, 'test-license');
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  const dialog = screen.getByRole('alertdialog');
  const checkbox = screen.getByRole('checkbox', {
    name: 'I accept the BugPin Enterprise License Agreement.',
  });
  await user.click(checkbox);
  await act(async () => {
    void queryClient.refetchQueries({ queryKey: ['license-status'] });
  });
  await waitFor(() => expect(status).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('alertdialog')).toBe(dialog);
  expect(checkbox).toBeChecked();
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue('test-license');
  await act(async () => finishRefetch(unlicensed));
  expect(screen.getByRole('alertdialog')).toBe(dialog);
  expect(checkbox).toBeChecked();
});

it('does not offer installed-license sync when no license is installed', async () => {
  vi.spyOn(licenseApi, 'getStatus').mockResolvedValue({
    eeAvailable: true,
    licensed: false,
    installed: false,
    message: 'License expired',
  });
  renderWithQueryAndRouter(<License />);
  await screen.findByRole('button', { name: 'Activate License' });
  expect(screen.queryByRole('button', { name: 'Sync license' })).not.toBeInTheDocument();
});

it('requires exact confirmation for removal, resets on dismissal, and prevents repeat requests', async () => {
  let licensed = true;
  let finishRemoval!: () => void;
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed,
  }));
  const remove = vi.spyOn(licenseApi, 'remove').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishRemoval = () => {
          licensed = false;
          resolve();
        };
      })
  );
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  const openDialog = await screen.findByRole('button', { name: 'Remove License' });
  await user.click(openDialog);
  const input = screen.getByRole('textbox', { name: 'Type license to confirm' });
  const confirm = screen.getByRole('button', { name: 'Remove' });
  expect(confirm).toBeDisabled();
  await user.click(confirm);
  await user.type(input, 'licens');
  expect(confirm).toBeDisabled();
  await user.clear(input);
  await user.type(input, 'LICENSE');
  expect(confirm).toBeDisabled();
  await user.clear(input);
  await user.type(input, 'license');
  expect(confirm).toBeEnabled();
  expect(remove).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(openDialog);
  expect(screen.getByRole('textbox', { name: 'Type license to confirm' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  await user.type(screen.getByRole('textbox'), 'license');
  await user.keyboard('{Escape}');
  await user.click(openDialog);
  expect(screen.getByRole('textbox', { name: 'Type license to confirm' })).toHaveValue('');
  expect(remove).not.toHaveBeenCalled();

  await user.type(screen.getByRole('textbox'), 'license');
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(openDialog).toBeDisabled();
  await user.click(openDialog);
  expect(remove).toHaveBeenCalledTimes(1);
  finishRemoval();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Activate License' })).toBeInTheDocument()
  );
});

it('keeps project selection and agreement acceptance in the dialog through an activation retry', async () => {
  const projects = [
    { id: 'proj_one', name: 'Project One' },
    { id: 'proj_two', name: 'Project Two' },
  ];
  let licensed = false;
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed,
    projectLimit: licensed ? 1 : undefined,
    usedProjects: licensed ? 1 : undefined,
    licensedProjectIds: licensed ? ['proj_one'] : undefined,
  }));
  const { api } = await import('../../../api/client');
  vi.spyOn(api, 'get').mockResolvedValue({ data: { projects } });
  const activate = vi
    .spyOn(licenseApi, 'activate')
    .mockRejectedValueOnce({
      response: { data: { error: 'PROJECT_SELECTION_REQUIRED', projectLimit: 1, projects } },
    })
    .mockRejectedValueOnce({
      response: { data: { message: 'Could not record agreement acceptance. Please try again.' } },
    })
    .mockImplementationOnce(async () => {
      licensed = true;
    });
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  await user.type(await screen.findByRole('textbox', { name: 'License Key' }), 'test-license');
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  await user.click(
    screen.getByRole('checkbox', { name: 'I accept the BugPin Enterprise License Agreement.' })
  );
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  await user.click(await screen.findByRole('checkbox', { name: 'Project One' }));
  expect(screen.getByRole('checkbox', { name: 'Project Two' })).toBeDisabled();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'I accept the BugPin Enterprise License Agreement.' })
  ).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  await waitFor(() =>
    expect(activate).toHaveBeenLastCalledWith('test-license', ['proj_one'], {
      accepted: true,
      version: ENTERPRISE_AGREEMENT_VERSION,
    })
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Agree & Activate' })).toBeEnabled()
  );
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Project One' })).toBeChecked();
  expect(
    screen.getByRole('checkbox', { name: 'I accept the BugPin Enterprise License Agreement.' })
  ).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  expect(await screen.findByText('1 of 1 projects used')).toBeInTheDocument();
  expect(activate).toHaveBeenCalledTimes(3);
});

it('syncs an increased allowance without reactivation and lets the admin allocate the new slot', async () => {
  const { api } = await import('../../../api/client');
  const projects = [
    { id: 'proj_one', name: 'Project One' },
    { id: 'proj_two', name: 'Project Two' },
  ];
  vi.spyOn(api, 'get').mockResolvedValue({ data: { projects } });
  let limit = 1;
  let ids = ['proj_one'];
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed: true,
    projectLimit: limit,
    usedProjects: ids.length,
    licensedProjectIds: ids,
    selectionRequired: false,
  }));
  const activate = vi.spyOn(licenseApi, 'activate');
  const sync = vi.spyOn(licenseApi, 'sync').mockImplementation(async () => {
    limit = 2;
    return { eeAvailable: true, licensed: true, projectLimit: limit };
  });
  const select = vi.spyOn(licenseApi, 'selectProjects').mockImplementation(async (next) => {
    ids = next;
  });
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  expect(await screen.findByRole('checkbox', { name: 'Project Two' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Sync license' }));
  expect(await screen.findByText('1 of 2 projects used')).toBeInTheDocument();
  expect(sync).toHaveBeenCalledTimes(1);
  expect(activate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox', { name: 'Project Two' }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(select.mock.calls[0]?.[0]).toEqual(['proj_one', 'proj_two']));
  expect(await screen.findByText('2 of 2 projects used')).toBeInTheDocument();
});

it('requires agreement acceptance before activation, resets on dismissal, and prevents duplicate activation', async () => {
  let licensed = false;
  let complete!: () => void;
  vi.spyOn(licenseApi, 'getStatus').mockImplementation(async () => ({
    eeAvailable: true,
    licensed,
  }));
  const activate = vi.spyOn(licenseApi, 'activate').mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = () => {
          licensed = true;
          resolve();
        };
      })
  );
  const user = userEvent.setup();
  renderWithQueryAndRouter(<License />);
  await user.type(await screen.findByRole('textbox', { name: 'License Key' }), 'test-license');
  const open = screen.getByRole('button', { name: 'Activate License' });
  await user.click(open);
  expect(screen.getByRole('link', { name: 'BugPin Enterprise License Agreement' })).toHaveAttribute(
    'href',
    ENTERPRISE_AGREEMENT_URL
  );
  const agree = screen.getByRole('button', { name: 'Agree & Activate' });
  expect(agree).toBeDisabled();
  await user.click(agree);
  expect(activate).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(activate).not.toHaveBeenCalled();
  await user.click(open);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  await user.click(screen.getByRole('checkbox'));
  await user.keyboard('{Escape}');
  await user.click(open);
  expect(screen.getByRole('button', { name: 'Agree & Activate' })).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  await user.click(screen.getByRole('button', { name: 'Agree & Activate' }));
  expect(activate).toHaveBeenCalledTimes(1);
  expect(activate).toHaveBeenCalledWith('test-license', undefined, {
    accepted: true,
    version: ENTERPRISE_AGREEMENT_VERSION,
  });
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  complete();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
});

it('keeps the loaded license visible after a background refresh fails', async () => {
  vi.spyOn(licenseApi, 'getStatus')
    .mockResolvedValueOnce({ eeAvailable: true, installed: true, licensed: true })
    .mockRejectedValue(new Error('Offline'));
  const { queryClient } = renderWithQueryAndRouter(<License />);
  const card = await screen.findByText('Licensed');
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ['license-status'] });
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh license status');
  expect(screen.getByText('Licensed')).toBe(card);
  expect(screen.getByRole('button', { name: 'Remove License' })).toBeInTheDocument();
});

it('keeps the agreement dialog and input mounted after a background refresh fails', async () => {
  vi.spyOn(licenseApi, 'getStatus')
    .mockResolvedValueOnce({ eeAvailable: true, installed: false, licensed: false })
    .mockRejectedValue(new Error('Offline'));
  const user = userEvent.setup();
  const { queryClient } = renderWithQueryAndRouter(<License />);
  const input = await screen.findByRole('textbox', { name: 'License Key' });
  await user.type(input, 'test-license');
  await user.click(screen.getByRole('button', { name: 'Activate License' }));
  const dialog = screen.getByRole('alertdialog');
  const checkbox = screen.getByRole('checkbox');
  await user.click(checkbox);
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ['license-status'] });
  });
  await waitFor(() => expect(queryClient.getQueryState(['license-status'])?.status).toBe('error'));
  expect(screen.getByRole('alertdialog')).toBe(dialog);
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue('test-license');
  expect(checkbox).toBeChecked();
});

it.each([
  ['License inactive', 'License inactive.'],
  ['Verification will retry automatically.', 'Verification will retry automatically.'],
  ['Try again! ', 'Try again!'],
])('uses one sentence ending for status %s', async (message, expected) => {
  vi.spyOn(licenseApi, 'getStatus').mockResolvedValue({
    eeAvailable: true,
    installed: true,
    licensed: false,
    message,
  });
  renderWithQueryAndRouter(<License />);
  expect(
    await screen.findByText(`${expected} Enterprise features are disabled.`)
  ).toBeInTheDocument();
});
