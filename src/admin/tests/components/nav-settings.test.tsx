import type { ReactNode } from 'react';
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen } from '../utils';
import { NavSettings } from '../../components/sidebar/NavSettings';
import { SidebarProvider } from '../../components/ui/sidebar';
import { useAuth } from '../../contexts/AuthContext';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';
import type { User } from '@shared/types';

const ADMIN_GROUPS = ['System', 'Project Defaults', 'Access', 'Customization'];

function signInAs(user: Partial<User> & Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

function SignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return isLoading || !user ? null : <>{children}</>;
}

function renderNav() {
  return renderWithProviders(
    <SignedIn>
      <SidebarProvider defaultOpen={true}>
        <NavSettings />
      </SidebarProvider>
    </SignedIn>,
    { initialEntries: ['/settings/account/profile'] }
  );
}

describe('NavSettings', () => {
  it('shows every group and API Tokens to admins', async () => {
    renderNav();

    expect(await screen.findByRole('link', { name: 'General' })).toBeInTheDocument();
    for (const group of ['Account', ...ADMIN_GROUPS]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /API Tokens/ })).toHaveAttribute(
      'href',
      '/settings/account/api-tokens'
    );
  });

  it('hides the admin-only groups from viewers', async () => {
    signInAs(mockUsers.viewer);
    renderNav();

    expect(await screen.findByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    for (const group of ADMIN_GROUPS) {
      expect(screen.queryByText(group)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it.each([
    [true, 'shows'],
    [false, 'hides'],
  ])('with apiAccessEnabled %s it %s API Tokens for viewers', async (apiAccessEnabled) => {
    signInAs({ ...mockUsers.viewer, apiAccessEnabled });
    renderNav();

    expect(await screen.findByRole('link', { name: 'Profile' })).toBeInTheDocument();
    const apiTokens = screen.queryByRole('link', { name: /API Tokens/ });
    if (apiAccessEnabled) {
      expect(apiTokens).toHaveAttribute('href', '/settings/account/api-tokens');
    } else {
      expect(apiTokens).not.toBeInTheDocument();
    }
  });
});
