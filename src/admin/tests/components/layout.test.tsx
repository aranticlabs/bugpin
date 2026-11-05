import { beforeEach, describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent, waitFor } from '../utils';
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
          <Route path="license" element={<div>License Content</div>} />
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
    expect(badge).toHaveAttribute('href', '/license');
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

  it('renders the Security breadcrumb on /security', async () => {
    window.location.hash = '';

    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/security" element={<Layout />}>
            <Route index element={<div>Security Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/security'] }
    );

    expect(await screen.findByRole('button', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByText('General', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Security Content')).toBeInTheDocument();
  });

  it('renders the Privacy breadcrumb for /settings#privacy', async () => {
    window.location.hash = '#privacy';

    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/settings" element={<Layout />}>
            <Route index element={<div>Privacy Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/settings#privacy'] }
    );

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
  });

  it('renders two-level breadcrumb on /settings#storage and clears hash on root click', async () => {
    const user = userEvent.setup();
    window.location.hash = '#storage';

    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/settings" element={<Layout />}>
            <Route index element={<div>Settings Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/settings'] }
    );

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(window.location.hash).toBe('');
  });
});
