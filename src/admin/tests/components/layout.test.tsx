import { beforeEach, describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../utils';
import { Layout } from '../../components/Layout';
import { BrandingProvider } from '../../contexts/BrandingContext';

describe('Layout', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/license/status', () =>
        HttpResponse.json({ eeAvailable: true, licensed: false })
      )
    );
  });

  it('updates the enterprise badge when the license changes and links admins to License', async () => {
    let licensed = false;
    server.use(
      http.get('/api/license/status', () => HttpResponse.json({ eeAvailable: true, licensed }))
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<div>Home Content</div>} />
          <Route path="settings/license" element={<div>License Content</div>} />
        </Route>
      </Routes>
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(['license-status'])).toEqual({
        eeAvailable: true,
        licensed: false,
      })
    );
    expect(screen.queryByLabelText('Enterprise license active')).not.toBeInTheDocument();

    licensed = true;
    await queryClient.invalidateQueries({ queryKey: ['license-status'] });
    const badge = await screen.findByRole('link', {
      name: 'Enterprise license active',
    });
    expect(badge).toHaveAttribute('href', '/settings/license');
    await user.hover(badge);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Enterprise license active');
    await user.click(badge);
    expect(await screen.findByText('License Content')).toBeInTheDocument();

    licensed = false;
    await queryClient.invalidateQueries({ queryKey: ['license-status'] });
    await waitFor(() =>
      expect(screen.queryByLabelText('Enterprise license active')).not.toBeInTheDocument()
    );
  });

  it('shows the active badge to viewers without linking to the admin License page', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          success: true,
          authenticated: true,
          user: mockUsers.viewer,
        })
      ),
      http.get('/api/license/status', () =>
        HttpResponse.json({ eeAvailable: true, licensed: true })
      )
    );
    renderWithProviders(<Layout />);
    expect(await screen.findByLabelText('Enterprise license active')).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(
      screen.queryByRole('link', { name: 'Enterprise license active' })
    ).not.toBeInTheDocument();
  });

  it('hides the badge if refreshing the license status fails', async () => {
    server.use(
      http.get('/api/license/status', () =>
        HttpResponse.json({ eeAvailable: true, licensed: true })
      )
    );
    const { queryClient } = renderWithProviders(<Layout />);
    expect(
      await screen.findByRole('link', { name: 'Enterprise license active' })
    ).toBeInTheDocument();
    server.use(http.get('/api/license/status', () => new HttpResponse(null, { status: 503 })));
    await queryClient.invalidateQueries({ queryKey: ['license-status'] });
    await waitFor(() =>
      expect(screen.queryByLabelText('Enterprise license active')).not.toBeInTheDocument()
    );
  });

  it('shows the page title and renders footer dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<div>Home Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Home Content')).toBeInTheDocument();

    await user.click(screen.getByText('About'));
    expect(await screen.findByText('About BugPin')).toBeInTheDocument();
  });

  it.each([
    ['/settings/authentication', 'Access', 'Authentication'],
    ['/settings/data-privacy', 'System', 'Privacy & Data'],
    ['/settings/account/profile', 'Account', 'Profile'],
    ['/settings/project-defaults/dialog-colors', 'Project Defaults', 'Dialog Colors'],
  ])('renders the settings breadcrumb on %s', async (path, group, page) => {
    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="*" element={<div>Settings Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: [path] }
    );

    const breadcrumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb).toHaveTextContent(`Settings${group}${page}`);
    expect(within(breadcrumb).getByRole('heading', { name: page })).toBeInTheDocument();
    expect(screen.getByText('Settings Content')).toBeInTheDocument();
  });
  it('links back to the list from a settings detail page', async () => {
    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="*" element={<div>Detail Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/settings/users/user-3'] }
    );

    const breadcrumb = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb).toHaveTextContent('SettingsAccessUsersDetails');
    expect(within(breadcrumb).getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/settings/users'
    );
  });
});
