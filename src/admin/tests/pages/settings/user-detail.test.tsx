import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { useAuth } from '../../../contexts/AuthContext';
import { UserDetail } from '../../../pages/settings/UserDetail';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
}

let requests: RecordedRequest[] = [];
let tokens: { id: string; name: string; scopes: string[]; createdAt: string }[] = [];

function SignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return isLoading || !user ? null : <>{children}</>;
}

function renderUser(id: string) {
  return renderWithProviders(
    <SignedIn>
      <Routes>
        <Route path="/settings/users/:id" element={<UserDetail />} />
        <Route path="/settings/users" element={<p>Users list</p>} />
      </Routes>
    </SignedIn>,
    { initialEntries: [`/settings/users/${id}`] }
  );
}

async function record(request: Request) {
  const text = await request.text();
  requests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    body: text ? JSON.parse(text) : undefined,
  });
  return HttpResponse.json({ success: true });
}

beforeEach(() => {
  requests = [];
  tokens = [
    { id: 'tok_1', name: 'CI pipeline', scopes: ['read'], createdAt: '2026-10-01T00:00:00Z' },
  ];
  server.use(
    http.patch('/api/users/:id', ({ request }) => record(request)),
    http.patch('/api/users/:id/api-access', ({ request }) => record(request)),
    http.post('/api/users/:id/temporary-password', ({ request }) => record(request)),
    http.post('/api/users/:id/password-reset-email', ({ request }) => record(request)),
    http.post('/api/users/:id/resend-invitation', ({ request }) => record(request)),
    http.delete('/api/users/:id/sessions', ({ request }) => record(request)),
    http.delete('/api/users/:id/api-tokens', ({ request }) => record(request)),
    http.delete('/api/users/:id', ({ request }) => record(request)),
    http.get('/api/users/:id/api-tokens', () => HttpResponse.json({ success: true, tokens }))
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, action: string) {
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: action }));
}

describe('UserDetail', () => {
  it('shows the user with every section', async () => {
    renderUser('user-3');

    expect(await screen.findByRole('heading', { name: 'Viewer User' })).toBeInTheDocument();
    expect(await screen.findByText('CI pipeline')).toBeInTheDocument();
    for (const title of [
      'Account',
      'Role and Access',
      'Sign-in and Security',
      'API Access',
      'Delete User',
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it('renames the user', async () => {
    const user = userEvent.setup();
    renderUser('user-3');

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Renamed User');
    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/users/user-3',
        body: { name: 'Renamed User' },
      })
    );
  });

  it('sends a password reset email', async () => {
    const user = userEvent.setup();
    renderUser('user-3');

    await user.click(await screen.findByRole('button', { name: 'Send Email' }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/users/user-3/password-reset-email',
        body: undefined,
      })
    );
  });

  it('sets a temporary password', async () => {
    const user = userEvent.setup();
    renderUser('user-3');

    await user.click(await screen.findByRole('button', { name: 'Set Password' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Temporary password'), 'temporary-pass-3');
    await user.click(within(dialog).getByRole('button', { name: 'Set Password' }));

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/users/user-3/temporary-password',
        body: { password: 'temporary-pass-3' },
      })
    );
  });

  it('signs the user out everywhere after confirmation', async () => {
    const user = userEvent.setup();
    renderUser('user-3');

    await user.click(await screen.findByRole('button', { name: 'Sign Out' }));
    expect(requests).toEqual([]);
    await confirmDialog(user, 'Sign Out');

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'DELETE',
        path: '/api/users/user-3/sessions',
        body: undefined,
      })
    );
  });

  it('asks before turning off API access when tokens exist', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/users', () =>
        HttpResponse.json({
          success: true,
          users: [
            {
              id: 'user-3',
              email: 'viewer@example.com',
              name: 'Viewer User',
              role: 'viewer',
              isActive: true,
              apiAccessEnabled: true,
              invitationAcceptedAt: '2024-01-01T00:00:00Z',
            },
          ],
        })
      )
    );
    renderUser('user-3');

    await screen.findByText('CI pipeline');
    await user.click(screen.getByRole('switch', { name: 'Allow API tokens' }));
    expect(requests).toEqual([]);
    await confirmDialog(user, 'Turn Off');

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/users/user-3/api-access',
        body: { enabled: false },
      })
    );
  });

  it('turns API access on without confirmation', async () => {
    const user = userEvent.setup();
    tokens = [];
    renderUser('user-3');

    await user.click(await screen.findByRole('switch', { name: 'Allow API tokens' }));
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PATCH',
        path: '/api/users/user-3/api-access',
        body: { enabled: true },
      })
    );
  });

  it('revokes all tokens after confirmation', async () => {
    const user = userEvent.setup();
    renderUser('user-3');

    await screen.findByText('CI pipeline');
    await user.click(screen.getByRole('button', { name: 'Revoke All' }));
    await confirmDialog(user, 'Revoke All');

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'DELETE',
        path: '/api/users/user-3/api-tokens',
        body: undefined,
      })
    );
  });

  it('shows an upgrade card for API access without a license', async () => {
    server.use(
      http.get('/api/license/features', () =>
        HttpResponse.json({ success: true, features: { 'api-access': false } })
      )
    );
    renderUser('user-3');

    expect(
      await screen.findByText('This feature requires an Enterprise license.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Allow API tokens' })).not.toBeInTheDocument();
  });

  it('deletes the user and returns to the list', async () => {
    const user = userEvent.setup();
    renderUser('user-3');

    await user.click(await screen.findByRole('button', { name: 'Delete User' }));
    await confirmDialog(user, 'Delete');

    expect(await screen.findByText('Users list')).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: 'DELETE',
      path: '/api/users/user-3',
      body: undefined,
    });
  });

  it('protects the signed-in admin from locking themselves out', async () => {
    renderUser('user-1');

    expect(await screen.findByText('You')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete User' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Active' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Allow API tokens' })).toBeDisabled();
  });

  it('offers to resend the invitation for pending users', async () => {
    const user = userEvent.setup();
    renderUser('user-4');

    await user.click(await screen.findByRole('button', { name: 'Resend Invitation' }));
    expect(screen.queryByRole('button', { name: 'Send Email' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'POST',
        path: '/api/users/user-4/resend-invitation',
        body: undefined,
      })
    );
  });

  it('explains when the user does not exist', async () => {
    renderUser('user-missing');

    expect(await screen.findByText('This user does not exist or was deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All Users' })).toHaveAttribute(
      'href',
      '/settings/users'
    );
  });

  it('turns gamification on or off for this person', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('/api/gamification', ({ request }) => record(request)),
      http.get('/api/users', () =>
        HttpResponse.json({
          success: true,
          users: [
            {
              id: 'user-2',
              email: 'editor@example.com',
              name: 'Editor User',
              role: 'editor',
              isActive: true,
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        })
      )
    );
    renderUser('user-2');
    const toggle = await screen.findByRole('switch', { name: 'Enable gamification' });
    expect(toggle).toBeChecked();
    expect(
      screen.getByText('Gamification is turned off for the whole workspace.')
    ).toBeInTheDocument();

    await user.click(toggle);

    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'PUT',
        path: '/api/gamification',
        body: { users: { 'user-2': false } },
      })
    );
  });

  it('never offers gamification to viewers', async () => {
    renderUser('user-3');
    const toggle = await screen.findByRole('switch', { name: 'Enable gamification' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
  });
});
