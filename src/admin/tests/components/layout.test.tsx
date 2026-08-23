import { describe, it, expect } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, screen, userEvent } from '../utils';
import { Layout } from '../../components/Layout';
import { BrandingProvider } from '../../contexts/BrandingContext';

describe('Layout', () => {
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

  it('renders the Security breadcrumb on /security-privacy', async () => {
    window.location.hash = '';

    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/security-privacy" element={<Layout />}>
            <Route index element={<div>Security Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/security-privacy'] }
    );

    expect(await screen.findByRole('button', { name: 'Security & Privacy' })).toBeInTheDocument();
    expect(screen.getByText('Security', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Security Content')).toBeInTheDocument();
  });

  it('renders the Privacy breadcrumb for /security-privacy#privacy', async () => {
    window.location.hash = '#privacy';

    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/security-privacy" element={<Layout />}>
            <Route index element={<div>Privacy Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/security-privacy#privacy'] }
    );

    expect(await screen.findByRole('button', { name: 'Security & Privacy' })).toBeInTheDocument();
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
