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
      </BrandingProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Home Content')).toBeInTheDocument();

    await user.click(screen.getByText('About'));
    expect(await screen.findByText('About BugPin')).toBeInTheDocument();
  });

  it('renders settings breadcrumb and updates hash', async () => {
    const user = userEvent.setup();
    window.location.hash = '#security';

    renderWithProviders(
      <BrandingProvider>
        <Routes>
          <Route path="/globalsettings" element={<Layout />}>
            <Route index element={<div>Settings Content</div>} />
          </Route>
        </Routes>
      </BrandingProvider>,
      { initialEntries: ['/globalsettings'] },
    );

    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Rate Limits')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(window.location.hash).toBe('#system');
  });
});
