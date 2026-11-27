import { afterEach, expect, it, vi } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor, within } from '../../utils';
import { Webhooks } from '../../../pages/console/Webhooks';
import { api } from '../../../api/client';
import { licenseApi } from '../../../api/license';
import type { WebhookResponse as Webhook } from '@shared/types';

afterEach(() => vi.restoreAllMocks());

const endpoint: Webhook = {
  id: 'wh_primary',
  projectId: 'prj_one',
  name: 'Issue tracker',
  url: 'https://example.com/receiver',
  secretSet: true,
  events: ['report.created', 'report.status_changed'],
  isActive: true,
  failureCount: 0,
  lastStatusCode: 204,
  lastTriggeredAt: '2026-10-03T12:00:00Z',
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
};

function setupWebhooks(initial: Webhook[] = []) {
  const state = {
    webhooks: initial,
    projects: [
      { id: 'prj_one', name: 'Website' },
      { id: 'prj_two', name: 'Dashboard' },
    ],
  };
  vi.spyOn(licenseApi, 'getFeatures').mockResolvedValue({
    eeAvailable: true,
    features: { webhooks: true },
  });
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: url === '/projects' ? { projects: state.projects } : { webhooks: state.webhooks },
  }));
  return state;
}

async function openNew(user: ReturnType<typeof userEvent.setup>) {
  const add = await screen.findByRole('button', { name: 'Add webhook' });
  await waitFor(() => expect(add).toBeEnabled());
  await user.click(add);
  return screen.findByLabelText('Webhook name');
}

it('creates a project-specific endpoint with selected events and a signing secret', async () => {
  const state = setupWebhooks();
  const post = vi.spyOn(api, 'post').mockImplementation(async () => {
    const saved: Webhook = {
      ...endpoint,
      id: 'wh_new',
      name: 'Dashboard receiver',
      projectId: 'prj_two',
      events: ['report.updated'],
      secretSet: true,
    };
    state.webhooks = [saved];
    return { data: { webhook: saved } };
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  await user.type(await openNew(user), 'Dashboard receiver');
  await user.click(screen.getByRole('combobox', { name: 'Project' }));
  await user.click(screen.getByRole('option', { name: 'Dashboard' }));
  await user.type(screen.getByLabelText('Receiver URL'), endpoint.url);
  await user.type(screen.getByLabelText(/Signing secret/), 'shared-secret');
  await user.click(screen.getByRole('switch', { name: /^New report/ }));
  await user.click(screen.getByRole('switch', { name: /^Report updated/ }));
  await user.click(screen.getByRole('button', { name: 'Create webhook' }));

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/webhooks?projectId=prj_two', {
      name: 'Dashboard receiver',
      url: endpoint.url,
      secret: 'shared-secret',
      events: ['report.updated'],
    })
  );
  const card = await screen.findByRole('article', { name: 'Dashboard receiver' });
  expect(within(card).getByText('Dashboard')).toBeInTheDocument();
  expect(within(card).getByText('Report updated')).toBeInTheDocument();
  expect(screen.queryByLabelText('Webhook name')).not.toBeInTheDocument();
  expect(screen.queryByText('shared-secret')).not.toBeInTheDocument();
  await openNew(user);
  expect(screen.getByLabelText('Webhook name')).toHaveValue('');
  expect(screen.getByLabelText('Receiver URL')).toHaveValue('');
  expect(screen.getByLabelText(/Signing secret/)).toHaveValue('');
  expect(screen.getByRole('switch', { name: /^New report/ })).toBeChecked();
  expect(screen.getByRole('switch', { name: /^Report updated/ })).not.toBeChecked();
});

it('cancels creation without retaining entries in the next form', async () => {
  setupWebhooks();
  const post = vi.spyOn(api, 'post');
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  await user.type(await openNew(user), 'Discarded');
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await openNew(user);
  expect(screen.getByLabelText('Webhook name')).toHaveValue('');
  expect(post).not.toHaveBeenCalled();
});

it('requires an event before creating a webhook', async () => {
  setupWebhooks();
  const post = vi.spyOn(api, 'post');
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  await user.type(await openNew(user), 'Receiver');
  await user.type(screen.getByLabelText('Receiver URL'), endpoint.url);
  await user.click(screen.getByRole('switch', { name: /^New report/ }));
  await user.click(screen.getByRole('button', { name: 'Create webhook' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Select at least one event.');
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Webhook name')).toHaveValue('Receiver');
  await user.click(screen.getByRole('switch', { name: /^Report updated/ }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('rejects a non-HTTP receiver URL and preserves entries on API failure', async () => {
  setupWebhooks();
  const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('Project not covered by license'));
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  await user.type(await openNew(user), 'Receiver');
  await user.type(screen.getByLabelText('Receiver URL'), 'ftp://example.com/receiver');
  await user.click(screen.getByRole('button', { name: 'Create webhook' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('http:// or https://');
  expect(post).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText('Receiver URL'));
  await user.type(screen.getByLabelText('Receiver URL'), endpoint.url);
  await user.click(screen.getByRole('button', { name: 'Create webhook' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Project not covered by license');
  expect(screen.getByLabelText('Webhook name')).toHaveValue('Receiver');
});

it('edits an existing endpoint while keeping its project and saved signing secret', async () => {
  const state = setupWebhooks([endpoint]);
  const patch = vi.spyOn(api, 'patch').mockImplementation(async () => {
    const updated = {
      ...endpoint,
      name: 'Updated receiver',
      url: 'https://example.com/updated',
      events: ['report.closed'] as Webhook['events'],
    };
    state.webhooks = [updated];
    return { data: { webhook: updated } };
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const card = await screen.findByRole('article', { name: endpoint.name });
  expect(within(card).getByText('Payloads are signed.')).toBeInTheDocument();
  await user.click(within(card).getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Project')).toHaveValue('Website');
  expect(screen.getByLabelText('Project')).toHaveAttribute('readonly');
  expect(screen.getByLabelText(/Signing secret/)).toHaveValue('');
  expect(screen.getByLabelText(/Signing secret/)).toHaveAttribute(
    'placeholder',
    'Saved (leave empty to keep)'
  );
  await user.clear(screen.getByLabelText('Webhook name'));
  await user.type(screen.getByLabelText('Webhook name'), 'Updated receiver');
  await user.clear(screen.getByLabelText('Receiver URL'));
  await user.type(screen.getByLabelText('Receiver URL'), 'https://example.com/updated');
  await user.click(screen.getByRole('switch', { name: /^New report/ }));
  await user.click(screen.getByRole('switch', { name: /^Status changed/ }));
  await user.click(screen.getByRole('switch', { name: /^Report closed/ }));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/webhooks/wh_primary', {
      name: 'Updated receiver',
      url: 'https://example.com/updated',
      secret: undefined,
      events: ['report.closed'],
    })
  );
  expect(await screen.findByRole('article', { name: 'Updated receiver' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Webhook name')).not.toBeInTheDocument();
});

it.each([false, true])(
  'replaces the saved secret after selecting removal: %s',
  async (removeFirst) => {
    setupWebhooks([endpoint]);
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { webhook: endpoint } });
    const user = userEvent.setup();
    renderWithQuery(<Webhooks />);
    const card = await screen.findByRole('article', { name: endpoint.name });
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    if (removeFirst) await user.click(screen.getByRole('button', { name: 'Remove secret' }));
    await user.type(screen.getByLabelText(/Signing secret/), 'replacement-secret');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/webhooks/wh_primary',
        expect.objectContaining({ secret: 'replacement-secret' })
      )
    );
  }
);

it('allows explicitly removing the signing secret when editing', async () => {
  const state = setupWebhooks([endpoint]);
  const patch = vi.spyOn(api, 'patch').mockImplementation(async () => {
    state.webhooks = [{ ...endpoint, secretSet: false }];
    return { data: { webhook: state.webhooks[0] } };
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const card = await screen.findByRole('article', { name: endpoint.name });
  await user.click(within(card).getByRole('button', { name: 'Edit' }));
  await user.click(screen.getByRole('button', { name: 'Remove secret' }));
  expect(screen.getByLabelText(/Signing secret/)).toHaveAttribute(
    'placeholder',
    'Removed when you save'
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith(
      '/webhooks/wh_primary',
      expect.objectContaining({ secret: '' })
    )
  );
  expect(await screen.findByText('No signing secret configured.')).toBeInTheDocument();
});

it('filters endpoint cards by project and uses that project for new webhooks', async () => {
  setupWebhooks([
    endpoint,
    { ...endpoint, id: 'wh_dashboard', projectId: 'prj_two', name: 'Dashboard receiver' },
  ]);
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  expect(await screen.findByRole('article', { name: 'Issue tracker' })).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Dashboard receiver' })).toBeInTheDocument();
  await user.click(screen.getByRole('combobox', { name: 'Filter by project' }));
  await user.click(screen.getByRole('option', { name: 'Dashboard' }));
  expect(screen.queryByRole('article', { name: 'Issue tracker' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Dashboard receiver' })).toBeInTheDocument();
  await openNew(user);
  expect(screen.getByRole('combobox', { name: 'Project' })).toHaveTextContent('Dashboard');
});

it('distinguishes failed HTTP responses, connection failures, and undelivered endpoints', async () => {
  setupWebhooks([
    { ...endpoint, name: 'HTTP failure', lastStatusCode: 500, failureCount: 3 },
    {
      ...endpoint,
      id: 'wh_connection',
      name: 'Connection failure',
      lastStatusCode: 0,
      failureCount: 1,
    },
    {
      ...endpoint,
      id: 'wh_new',
      name: 'New receiver',
      lastStatusCode: undefined,
      lastTriggeredAt: undefined,
    },
  ]);
  renderWithQuery(<Webhooks />);
  const failed = await screen.findByRole('article', { name: 'HTTP failure' });
  expect(within(failed).getByText('HTTP 500')).toBeInTheDocument();
  expect(within(failed).getByText('3')).toBeInTheDocument();
  expect(
    within(screen.getByRole('article', { name: 'Connection failure' })).getByText(
      'Connection failed'
    )
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('article', { name: 'New receiver' })).getByText('No deliveries yet')
  ).toBeInTheDocument();
});

it('pauses a webhook and keeps its status if a subsequent update fails', async () => {
  const state = setupWebhooks([endpoint]);
  const patch = vi
    .spyOn(api, 'patch')
    .mockImplementationOnce(async () => {
      state.webhooks = [{ ...endpoint, isActive: false }];
      return { data: { webhook: state.webhooks[0] } };
    })
    .mockRejectedValueOnce(new Error('Could not enable endpoint'));
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const toggle = await screen.findByRole('switch', { name: 'Enable Issue tracker' });
  await user.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(patch).toHaveBeenCalledWith('/webhooks/wh_primary', { isActive: false });
  expect(screen.getByText('Paused')).toBeInTheDocument();
  await user.click(toggle);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not enable endpoint');
  expect(toggle).not.toBeChecked();
});

it('reports test delivery success beside a paused endpoint and refreshes its latest response', async () => {
  const state = setupWebhooks([{ ...endpoint, isActive: false, lastStatusCode: undefined }]);
  const post = vi.spyOn(api, 'post').mockImplementation(async () => {
    state.webhooks = [{ ...endpoint, isActive: false, lastStatusCode: 202 }];
    return { data: { statusCode: 202 } };
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const card = await screen.findByRole('article', { name: endpoint.name });
  await user.click(within(card).getByRole('button', { name: 'Test delivery' }));
  expect(post).toHaveBeenCalledWith('/webhooks/wh_primary/test');
  expect(await within(card).findByRole('status')).toHaveTextContent(
    'Test delivered successfully (HTTP 202)'
  );
  expect(await within(card).findByText('HTTP 202')).toBeInTheDocument();
});

it('refreshes delivery information even when a test request fails', async () => {
  const state = setupWebhooks([endpoint]);
  vi.spyOn(api, 'post').mockImplementation(async () => {
    state.webhooks = [{ ...endpoint, lastStatusCode: 500, failureCount: 1 }];
    throw new Error('HTTP 500');
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const card = await screen.findByRole('article', { name: endpoint.name });
  await user.click(within(card).getByRole('button', { name: 'Test delivery' }));
  expect(await within(card).findByRole('alert')).toHaveTextContent(
    'Test delivery failed: HTTP 500'
  );
  expect(await within(card).findByText('HTTP 500')).toBeInTheDocument();
  expect(within(card).queryByRole('status')).not.toBeInTheDocument();
});

it('keeps other endpoint controls usable while a test is in progress', async () => {
  setupWebhooks([endpoint, { ...endpoint, id: 'wh_other', name: 'Other receiver' }]);
  let finish: ((response: { data: { statusCode: number } }) => void) | undefined;
  vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const first = await screen.findByRole('article', { name: endpoint.name });
  const other = screen.getByRole('article', { name: 'Other receiver' });
  await user.click(within(first).getByRole('button', { name: 'Test delivery' }));
  expect(within(first).getByRole('button', { name: 'Sending...' })).toBeDisabled();
  expect(within(first).getByRole('switch')).toBeDisabled();
  expect(within(other).getByRole('button', { name: 'Test delivery' })).toBeEnabled();
  expect(within(other).getByRole('switch')).toBeEnabled();
  finish?.({ data: { statusCode: 204 } });
  expect(await within(first).findByRole('status')).toHaveTextContent('HTTP 204');
});

it('requires confirmation before deleting a webhook and removes it after success', async () => {
  const state = setupWebhooks([endpoint]);
  const remove = vi.spyOn(api, 'delete').mockImplementation(async () => {
    state.webhooks = [];
    return { data: { success: true } };
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const card = await screen.findByRole('article', { name: endpoint.name });
  await user.click(within(card).getByRole('button', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(remove).not.toHaveBeenCalled();
  await user.click(within(card).getByRole('button', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Delete webhook' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith('/webhooks/wh_primary'));
  expect(await screen.findByText('No webhooks yet')).toBeInTheDocument();
});

it('keeps the endpoint and delete dialog if deletion fails', async () => {
  setupWebhooks([endpoint]);
  vi.spyOn(api, 'delete').mockRejectedValue(new Error('Could not delete endpoint'));
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  const card = await screen.findByRole('article', { name: endpoint.name });
  await user.click(within(card).getByRole('button', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Delete webhook' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete endpoint');
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('article', { name: endpoint.name })).toBeInTheDocument();
});

it('provides a useful empty state when no projects exist', async () => {
  const state = setupWebhooks();
  state.projects = [];
  renderWithQuery(<Webhooks />);
  expect(await screen.findByText('Create a project before adding a webhook.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add webhook' })).toBeDisabled();
});

it('retries failed project loading without hiding existing endpoints', async () => {
  const state = setupWebhooks([endpoint]);
  let projectsFailed = false;
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === '/projects' && !projectsFailed) {
      projectsFailed = true;
      throw new Error('Projects unavailable');
    }
    return {
      data: url === '/projects' ? { projects: state.projects } : { webhooks: state.webhooks },
    };
  });
  const user = userEvent.setup();
  renderWithQuery(<Webhooks />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load projects');
  expect(screen.getByRole('article', { name: endpoint.name })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry projects' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add webhook' })).toBeEnabled());
});
