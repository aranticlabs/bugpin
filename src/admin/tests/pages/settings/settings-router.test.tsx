import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { mockUsers } from '../../mocks/handlers';
import { renderWithProviders, screen, userEvent } from '../../utils';
import { useAuth } from '../../../contexts/AuthContext';
import { SettingsRouter } from '../../../pages/settings/SettingsRouter';
import { api } from '../../../api/client';
import type { User } from '@shared/types';

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function SignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return isLoading || !user ? null : <>{children}</>;
}

function renderSettings(entry: string) {
  return renderWithProviders(
    <SignedIn>
      <Routes>
        <Route path="/" element={<p>Dashboard</p>} />
        <Route path="/projects" element={<p>Projects list</p>} />
        <Route path="/settings/*" element={<SettingsRouter />} />
      </Routes>
      <CurrentPath />
    </SignedIn>,
    { initialEntries: [entry] }
  );
}

function signInAs(user: Partial<User> & Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsRouter', () => {
  it('opens General for admins at /settings', async () => {
    renderSettings('/settings');

    expect(
      await screen.findByRole('heading', { name: 'General' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/settings/general');
  });

  it('splits /settings/data-privacy into Privacy and Data tabs', async () => {
    renderSettings('/settings/data-privacy');

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Privacy', 'Data']);
    await userEvent.click(screen.getByRole('tab', { name: 'Data' }));

    expect(await screen.findByText('Data Retention', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(
      screen.getByText('Delete All Data', { selector: '[class*="font-semibold"]' })
    ).toBeInTheDocument();
  });

  it('shows Account and Security tabs on the profile and redirects the old security path', async () => {
    renderSettings('/settings/account/security');

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Account', 'Security']);
    expect(screen.getByRole('tab', { name: 'Security' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/settings/account/profile');
  });

  it('maps a former Settings tab hash to its new page', async () => {
    renderSettings('/settings#smtp');

    expect(await screen.findByText('SMTP Server', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/settings/email');
  });

  it.each([
    ['/settings/authentication', ['Sessions', 'Two-Factor Authentication', 'Password Policy']],
    ['/settings/network', ['Network']],
    ['/settings/project-defaults/capture', ['Screenshot', 'Recording', 'Diagnostics']],
  ])('stacks the sections of %s on one page', async (path, titles) => {
    renderSettings(path);

    for (const title of titles) {
      expect(await screen.findByText(title, {}, { timeout: 5000 })).toBeInTheDocument();
    }
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it.each([
    ['Community Edition', { eeAvailable: false, features: {} }],
    [
      'unlicensed Enterprise Edition',
      {
        eeAvailable: true,
        features: { 's3-storage': false, 'api-access': false, webhooks: false },
      },
    ],
  ])('shows upgrade cards for Enterprise pages in %s', async (_edition, features) => {
    server.use(http.get('/api/license/features', () => HttpResponse.json(features)));
    const get = vi.spyOn(api, 'get');

    for (const path of ['/settings/storage', '/settings/account/api-tokens']) {
      const view = renderSettings(path);
      expect(
        await screen.findByText(
          'This feature requires an Enterprise license.',
          {},
          { timeout: 5000 }
        )
      ).toBeInTheDocument();
      view.unmount();
    }

    expect(get).not.toHaveBeenCalledWith('/tokens');
    expect(get).not.toHaveBeenCalledWith('/webhooks');
    expect(get).not.toHaveBeenCalledWith('/storage/stats');
  });

  it.each([mockUsers.editor, mockUsers.viewer])(
    'opens the personal profile for $role users at /settings',
    async (user) => {
      signInAs(user);
      renderSettings('/settings');

      expect(
        await screen.findByText(
          'Your profile picture, name and email address',
          {},
          { timeout: 5000 }
        )
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Current path')).toHaveTextContent('/settings/account/profile');
    }
  );

  it.each(['/settings/general', '/settings/users', '/settings/users/user-3'])(
    'sends viewers away from the admin-only page %s',
    async (path) => {
      signInAs(mockUsers.viewer);
      renderSettings(path);

      expect(await screen.findByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/$/);
    }
  );

  it('keeps API tokens from users without API access', async () => {
    signInAs({ ...mockUsers.viewer, apiAccessEnabled: false });
    renderSettings('/settings/account/api-tokens');

    expect(
      await screen.findByText('Your profile picture, name and email address', {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/settings/account/profile');
  });

  it('opens API tokens for users an admin allowed API access', async () => {
    signInAs({ ...mockUsers.viewer, apiAccessEnabled: true });
    server.use(http.get('/api/tokens', () => HttpResponse.json({ success: true, tokens: [] })));
    renderSettings('/settings/account/api-tokens');

    expect(
      await screen.findByRole('button', { name: 'Create token' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/settings/account/api-tokens');
  });

  it('opens the detail page of a user', async () => {
    renderSettings('/settings/users/user-3');

    expect(
      await screen.findByRole('heading', { name: 'Viewer User' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Sign-in and Security')).toBeInTheDocument();
  });

  it('sends the former webhooks page to Projects', async () => {
    renderSettings('/settings/webhooks');

    expect(await screen.findByText('Projects list', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/projects');
  });

  it('falls back to the settings start page for unknown paths', async () => {
    renderSettings('/settings/does-not-exist');

    expect(
      await screen.findByRole('heading', { name: 'General' }, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
