import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../../api/client';
import type { ProxyTokenStatus } from '../../../api/proxy-token';
import { ProxyTokenCard } from '../../../pages/console/Security';
import { renderWithQuery, screen, userEvent, waitFor, within } from '../../utils';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const initialToken: ProxyTokenStatus = { success: true, enabled: true, token: 'initial-secret' };
const nextToken: ProxyTokenStatus = { success: true, enabled: true, token: 'replacement-secret' };

function mockToken(status: ProxyTokenStatus = initialToken) {
  return vi.spyOn(api, 'get').mockResolvedValue({ data: status });
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Regenerate' }));
  return screen.getByRole('alertdialog', { name: 'Regenerate proxy token?' });
}

it('renders nothing while loading and when proxy token mode is disabled', async () => {
  let resolve!: (value: { data: ProxyTokenStatus }) => void;
  vi.spyOn(api, 'get').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const { container, queryClient } = renderWithQuery(<ProxyTokenCard />);
  expect(container).toBeEmptyDOMElement();
  resolve({ data: { success: true, enabled: false } });
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  expect(container).toBeEmptyDOMElement();
});

it('masks the read-only token, toggles visibility, and copies with success feedback', async () => {
  const get = mockToken();
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  renderWithQuery(<ProxyTokenCard />);
  const input = await screen.findByLabelText('Token');
  expect(get).toHaveBeenCalledWith('/settings/proxy-token', { signal: expect.any(AbortSignal) });
  expect(input).toHaveValue('initial-secret');
  expect(input).toHaveAttribute('readonly');
  expect(input).toHaveAttribute('type', 'password');
  expect(
    screen.getByText(
      'Connects frontend containers, such as a Reporter Portal on a separate host, to the server.'
    )
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reveal token' }));
  expect(input).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: 'Hide token' }));
  expect(input).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Copy token' }));
  expect(copy).toHaveBeenCalledWith('initial-secret');
  expect(toast.success).toHaveBeenCalledWith('Proxy token copied');
});

it('reports clipboard failure without claiming success', async () => {
  mockToken();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Unavailable'));
  renderWithQuery(<ProxyTokenCard />);
  await user.click(await screen.findByRole('button', { name: 'Copy token' }));
  expect(toast.error).toHaveBeenCalledWith(
    'Could not copy the token. Reveal it and copy it manually.'
  );
  expect(toast.success).not.toHaveBeenCalled();
});

it('explains the consequences and cancels without regenerating', async () => {
  mockToken();
  const post = vi.spyOn(api, 'post');
  const user = userEvent.setup();
  renderWithQuery(<ProxyTokenCard />);
  const dialog = await openConfirmation(user);
  expect(dialog).toHaveTextContent(
    'The old token stops working immediately. Frontend containers on the same host need a restart. A portal container on a separate host needs the new token.'
  );
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(post).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('disables repeated actions while regenerating and replaces and masks the token on success', async () => {
  mockToken();
  let resolve!: (value: { data: ProxyTokenStatus }) => void;
  const post = vi.spyOn(api, 'post').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const { queryClient } = renderWithQuery(<ProxyTokenCard />);
  await user.click(await screen.findByRole('button', { name: 'Reveal token' }));
  const dialog = await openConfirmation(user);
  await user.click(within(dialog).getByRole('button', { name: 'Regenerate token' }));
  expect(post).toHaveBeenCalledExactlyOnceWith('/settings/proxy-token/regenerate');
  expect(screen.getByRole('button', { name: 'Regenerating...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  resolve({ data: nextToken });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Token')).toHaveValue('replacement-secret');
  expect(screen.getByLabelText('Token')).toHaveAttribute('type', 'password');
  expect(toast.success).toHaveBeenCalledWith('Proxy token regenerated');
  await user.click(screen.getByRole('button', { name: 'Copy token' }));
  expect(copy).toHaveBeenCalledWith('replacement-secret');
  expect(
    queryClient
      .getMutationCache()
      .getAll()
      .every((entry) => entry.state.data === undefined)
  ).toBe(true);
});

it('keeps the current token and confirmation available when regeneration fails', async () => {
  mockToken();
  vi.spyOn(api, 'post').mockRejectedValue({
    response: { data: { error: 'PROXY_TOKEN_ERROR', message: 'Could not store proxy token' } },
  });
  const user = userEvent.setup();
  renderWithQuery(<ProxyTokenCard />);
  const dialog = await openConfirmation(user);
  await user.click(within(dialog).getByRole('button', { name: 'Regenerate token' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not store proxy token'));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Regenerate token' })).toBeEnabled();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.getByLabelText('Token')).toHaveValue('initial-secret');
});

it('shows a recoverable error when loading fails', async () => {
  mockToken().mockRejectedValueOnce(new Error('Unavailable'));
  const user = userEvent.setup();
  renderWithQuery(<ProxyTokenCard />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the proxy token.');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByLabelText('Token')).toHaveValue('initial-secret');
});

it('removes the cached token on unmount even with the app default cache lifetime', async () => {
  mockToken();
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 300_000 } } });
  const { unmount } = renderWithQuery(<ProxyTokenCard />, { queryClient });
  await screen.findByLabelText('Token');
  unmount();
  await waitFor(() => expect(queryClient.getQueryData(['proxy-token'])).toBeUndefined());
});

it('does not recreate the cached token if regeneration completes after unmount', async () => {
  mockToken();
  let resolve!: (value: { data: ProxyTokenStatus }) => void;
  vi.spyOn(api, 'post').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    })
  );
  const user = userEvent.setup();
  const { unmount, queryClient } = renderWithQuery(<ProxyTokenCard />);
  const dialog = await openConfirmation(user);
  await user.click(within(dialog).getByRole('button', { name: 'Regenerate token' }));
  unmount();
  await waitFor(() => expect(queryClient.getQueryData(['proxy-token'])).toBeUndefined());
  resolve({ data: nextToken });
  await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  expect(queryClient.getQueryData(['proxy-token'])).toBeUndefined();
});

it('shows a publication warning while keeping the regenerated token available', async () => {
  mockToken();
  const warning = 'The token changed, but its shared file could not be updated.';
  vi.spyOn(api, 'post').mockResolvedValue({ data: { ...nextToken, warning } });
  const user = userEvent.setup();
  renderWithQuery(<ProxyTokenCard />);
  const dialog = await openConfirmation(user);
  await user.click(within(dialog).getByRole('button', { name: 'Regenerate token' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(warning);
  expect(screen.getByLabelText('Token')).toHaveValue('replacement-secret');
  expect(toast.warning).toHaveBeenCalledWith(warning);
  expect(toast.success).not.toHaveBeenCalled();
});

it('shows the export warning returned by GET after reopening the card', async () => {
  const warning = 'The token changed, but its shared file could not be updated.';
  mockToken({ ...initialToken, warning });
  const { unmount } = renderWithQuery(<ProxyTokenCard />);
  expect(await screen.findByRole('alert')).toHaveTextContent(warning);
  unmount();
  renderWithQuery(<ProxyTokenCard />);
  expect(await screen.findByRole('alert')).toHaveTextContent(warning);
  expect(screen.getByLabelText('Token')).toHaveValue('initial-secret');
});
