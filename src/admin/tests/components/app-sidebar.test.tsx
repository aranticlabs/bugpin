import { describe, it, expect } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../utils';
import { AppSidebar } from '../../components/sidebar/AppSidebar';
import { SidebarProvider } from '../../components/ui/sidebar';
import { BrandingProvider } from '../../contexts/BrandingContext';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';
import type { User } from '@shared/types';

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname}</output>;
}

function renderSidebar(entry = '/') {
  return renderWithProviders(
    <BrandingProvider>
      <SidebarProvider defaultOpen={true}>
        <Routes>
          <Route path="*" element={<AppSidebar />} />
        </Routes>
        <CurrentPath />
      </SidebarProvider>
    </BrandingProvider>,
    { initialEntries: [entry] }
  );
}

function signInAs(user: Partial<User> & Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

describe('AppSidebar', () => {
  it('shows the workspace navigation for admins', async () => {
    renderSidebar();

    expect(await screen.findByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByText('Widget')).not.toBeInTheDocument();
    expect(screen.queryByText('Console')).not.toBeInTheDocument();
  });

  it('switches to the settings navigation inside /settings', async () => {
    renderSidebar('/settings/general');

    expect(await screen.findByRole('link', { name: 'Back to BugPin' })).toHaveAttribute(
      'href',
      '/'
    );
    for (const group of ['System', 'Account', 'Access', 'Project Defaults', 'Customization']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('data-active', 'true');
    expect(screen.queryByRole('link', { name: /Reports/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: /Storage/ })).getByText('Enterprise feature')
    ).toBeInTheDocument();
  });

  it('opens account pages from the user menu', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderSidebar();

    const userButton = (await screen.findByText('Admin User')).closest('button');
    expect(userButton).not.toBeNull();
    await user.click(userButton as HTMLButtonElement);
    await user.click(await screen.findByRole('menuitem', { name: /notifications/i }));
    expect(screen.getByLabelText('Current path')).toHaveTextContent(
      '/settings/account/notifications'
    );
  });

  it('keeps admin navigation from non-admin users', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    signInAs(mockUsers.viewer);
    renderSidebar();

    expect(await screen.findByText('Viewer User')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Reports' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument();

    const userButton = screen.getByText('Viewer User').closest('button');
    await user.click(userButton as HTMLButtonElement);
    expect(await screen.findByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /api tokens/i })).not.toBeInTheDocument();
  });

  it('shows only account settings to non-admin users', async () => {
    signInAs(mockUsers.editor);
    renderSidebar('/settings/account/profile');

    expect(await screen.findByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /API Tokens/ })).not.toBeInTheDocument();
  });
  it('offers API tokens in the sidebar, not the user menu, to non-admins with API access', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    signInAs({ ...mockUsers.viewer, apiAccessEnabled: true });
    renderSidebar('/settings/account/profile');

    expect(await screen.findByRole('link', { name: /API Tokens/ })).toBeInTheDocument();
    const userButton = screen.getByText('Viewer User').closest('button');
    await user.click(userButton as HTMLButtonElement);
    expect(await screen.findByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /api tokens/i })).not.toBeInTheDocument();
  });
  it('links the report views with their counts', async () => {
    renderSidebar();

    const badgeOf = (name: string) =>
      screen
        .getByRole('link', { name })
        .closest('li')
        ?.querySelector('[data-sidebar="menu-badge"]');
    await waitFor(() => expect(badgeOf('Open')).toHaveTextContent('7'));
    expect(badgeOf('Assigned to me')).toHaveTextContent('2');
    expect(badgeOf('Unassigned')).toHaveTextContent('3');
    expect(badgeOf('Reports')).toHaveTextContent('17');
    expect(await screen.findByRole('link', { name: 'Assigned to me' })).toHaveAttribute(
      'href',
      '/reports?assignedTo=__me__&status=open%2Cin_progress'
    );
    expect(screen.getByRole('link', { name: 'Unassigned' })).toHaveAttribute(
      'href',
      '/reports?assignedTo=__unassigned__&status=open%2Cin_progress'
    );
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/reports?status=open%2Cin_progress'
    );
  });

  it('highlights the view that matches the current filters', async () => {
    renderSidebar('/reports?status=open%2Cin_progress');

    expect(await screen.findByRole('link', { name: 'Open' })).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('data-active', 'false');
  });

  it('nests pinned projects under Projects and lists recent reports', async () => {
    server.use(
      http.get('/api/projects/pinned', () =>
        HttpResponse.json({
          success: true,
          projects: [
            { id: 'project-1', name: 'Test Project', isActive: true, activeReportsCount: 4 },
          ],
        })
      ),
      http.get('/api/reports/recent', () =>
        HttpResponse.json({
          success: true,
          reports: [
            {
              id: 'report-9',
              title: 'Checkout button not clickable',
              projectId: 'project-1',
              status: 'open',
              viewedAt: '2026-11-05T10:00:00Z',
            },
          ],
        })
      )
    );
    renderSidebar('/projects/project-1');

    const pinned = await screen.findByRole('list', { name: 'Pinned projects' });
    const link = within(pinned).getByRole('link', { name: /^Test Project/ });
    expect(link).toHaveAttribute('href', '/projects/project-1');
    expect(link).toHaveAttribute('data-active', 'true');
    expect(
      await screen.findByRole('link', { name: 'Checkout button not clickable' })
    ).toHaveAttribute('href', '/reports/report-9');
  });

  it('shows five recent reports and reveals more on demand', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    server.use(
      http.get('/api/reports/recent', () =>
        HttpResponse.json({
          success: true,
          reports: Array.from({ length: 12 }, (_, index) => ({
            id: `report-${index + 1}`,
            title: `Recent report ${index + 1}`,
            projectId: 'project-1',
            status: 'open',
            viewedAt: '2026-11-05T10:00:00Z',
          })),
        })
      )
    );
    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Recent report 5' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Recent report 6' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('link', { name: 'Recent report 10' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Recent report 11' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('link', { name: 'Recent report 12' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByRole('link', { name: 'Recent report 6' })).not.toBeInTheDocument();
  });

  it('hides the Recent group until a report was opened', async () => {
    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pinned projects' })).not.toBeInTheDocument();
  });
  it('collapses and expands the pinned projects and remembers the choice', async () => {
    const user = userEvent.setup();
    let stored: Record<string, unknown> = {};
    server.use(
      http.get('/api/user-preferences/me', () =>
        HttpResponse.json({ success: true, preferences: stored })
      ),
      http.patch('/api/user-preferences/me', async ({ request }) => {
        stored = { ...stored, ...((await request.json()) as Record<string, unknown>) };
        return HttpResponse.json({ success: true, preferences: stored });
      })
    );
    server.use(
      http.get('/api/projects/pinned', () =>
        HttpResponse.json({
          success: true,
          projects: [
            { id: 'project-1', name: 'Test Project', isActive: true, activeReportsCount: 4 },
          ],
        })
      )
    );
    const view = renderSidebar('/projects/project-1');

    expect(await screen.findByRole('list', { name: 'Pinned projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('data-active', 'false');

    await user.click(screen.getByRole('button', { name: 'Hide pinned projects' }));
    expect(screen.queryByRole('list', { name: 'Pinned projects' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('data-active', 'true');
    await waitFor(() => expect(stored).toEqual({ pinnedProjectsOpen: false }));

    view.unmount();
    renderSidebar('/projects/project-1');
    expect(await screen.findByRole('button', { name: 'Show pinned projects' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pinned projects' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show pinned projects' }));
    expect(await screen.findByRole('list', { name: 'Pinned projects' })).toBeInTheDocument();
  });

  it('shows no collapse toggle without pinned projects', async () => {
    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pinned projects/i })).not.toBeInTheDocument();
  });
});
