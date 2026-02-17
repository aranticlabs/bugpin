import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, userEvent, waitFor } from '../utils';
import { AppSidebar } from '../../components/sidebar/AppSidebar';
import { SidebarProvider } from '../../components/ui/sidebar';
import { BrandingProvider } from '../../contexts/BrandingContext';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';

describe('AppSidebar', () => {
  it('renders admin navigation and opens profile/notifications', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithProviders(
      <BrandingProvider>
        <SidebarProvider defaultOpen={true}>
          <AppSidebar />
        </SidebarProvider>
      </BrandingProvider>,
    );

    expect(await screen.findByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    const userButton = screen.getByText('Admin User').closest('button');
    expect(userButton).not.toBeNull();
    await user.click(userButton as HTMLButtonElement);

    await user.click(screen.getByText('Profile'));
    expect(await screen.findByText('Profile Settings')).toBeInTheDocument();

    await user.click(userButton as HTMLButtonElement);
    await user.click(screen.getByText('Notifications'));
    expect(await screen.findByText('Notification Preferences')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  it('hides admin-only navigation for non-admin users', async () => {
    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({
          success: true,
          authenticated: true,
          user: mockUsers.viewer,
        });
      }),
    );

    renderWithProviders(
      <BrandingProvider>
        <SidebarProvider defaultOpen={true}>
          <AppSidebar />
        </SidebarProvider>
      </BrandingProvider>,
    );

    expect(await screen.findByText('Viewer User')).toBeInTheDocument();
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });
});
