import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { mockUsers } from '../../mocks/handlers';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { useAuth } from '../../../contexts/AuthContext';
import { ProjectDetail } from '../../../pages/workspace/ProjectDetail';
import type { User } from '@shared/types';

vi.mock('../../../pages/workspace/Reports', () => ({
  Reports: ({ projectId, headerStart }: { projectId?: string; headerStart?: ReactNode }) => (
    <>
      {headerStart}
      <p>Reports for {projectId}</p>
    </>
  ),
}));

vi.mock('../../../pages/console/Webhooks', () => ({
  Webhooks: ({ projectId }: { projectId?: string }) => <p>Webhooks for {projectId}</p>,
}));

vi.mock('../../../components/project/ProjectIntegrations', () => ({
  ProjectIntegrations: ({ projectId }: { projectId: string }) => (
    <p>Integrations for {projectId}</p>
  ),
}));

vi.mock('../../../components/project/ProjectSettingsPanel', () => ({
  ProjectSettingsPanel: ({ section }: { section: string }) => <p>Settings section {section}</p>,
}));

function SignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return isLoading || !user ? null : <>{children}</>;
}

function CurrentUrl() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.search}</output>;
}

function renderProject(entry: string) {
  return renderWithProviders(
    <SignedIn>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetail />} />
      </Routes>
      <CurrentUrl />
    </SignedIn>,
    { initialEntries: [entry] }
  );
}

function signInAs(user: Partial<User> & Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

describe('ProjectDetail', () => {
  it('opens on the project reports for admins', async () => {
    renderProject('/projects/project-1');

    expect(await screen.findByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    expect(screen.getByText('Reports for project-1')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Reports',
      'General',
      'Launcher Button',
      'Dialog Colors',
      'Language',
      'Capture',
      'Notifications',
      'Integrations',
    ]);
  });

  it('switches settings sections through the URL', async () => {
    const user = userEvent.setup();
    renderProject('/projects/project-1');

    await user.click(await screen.findByRole('tab', { name: 'Capture' }));
    expect(screen.getByText('Settings section capture').closest('div')).not.toHaveClass('hidden');
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(
      '/projects/project-1?tab=capture'
    );

    await user.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByLabelText('Current URL')).toHaveTextContent(/^\/projects\/project-1$/);
    expect(screen.getByText('Settings section general').closest('div')).toHaveClass('hidden');
  });

  it('opens the launcher button settings on their own tab', async () => {
    renderProject('/projects/project-1?tab=launcher');

    expect(await screen.findByText('Settings section launcher')).toBeInTheDocument();
    expect(screen.getByText('Settings section launcher').closest('div')).not.toHaveClass('hidden');
    expect(screen.queryByText('Widget Installation')).not.toBeInTheDocument();
    expect(screen.queryByText('test-api-key-123')).not.toBeInTheDocument();
  });

  it('groups issue trackers and webhooks under Integrations', async () => {
    renderProject('/projects/project-1?tab=integrations');

    expect(await screen.findByText('Integrations for project-1')).toBeInTheDocument();
    expect(screen.getByText('Webhooks for project-1')).toBeInTheDocument();
  });

  it('shows viewers only the reports, even with a settings tab in the URL', async () => {
    signInAs(mockUsers.viewer);
    renderProject('/projects/project-1?tab=general');

    expect(await screen.findByText('Reports for project-1')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/Settings section/)).not.toBeInTheDocument();
  });

  it('lets anyone pin the project', async () => {
    const user = userEvent.setup();
    const pinned: string[] = [];
    signInAs(mockUsers.viewer);
    server.use(
      http.put('/api/projects/:id/pin', ({ params }) => {
        pinned.push(String(params.id));
        return HttpResponse.json({ success: true });
      })
    );
    renderProject('/projects/project-1');

    await user.click(await screen.findByRole('button', { name: 'Pin Test Project' }));
    await waitFor(() => expect(pinned).toEqual(['project-1']));
  });

  it('shows an icon-only pin next to the title, filled once pinned', async () => {
    server.use(
      http.get('/api/projects/pinned', () =>
        HttpResponse.json({
          success: true,
          projects: [
            { id: 'project-1', name: 'Test Project', isActive: true, activeReportsCount: 0 },
          ],
        })
      )
    );
    renderProject('/projects/project-1');

    const pin = await screen.findByRole('button', { name: 'Unpin Test Project' });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(pin).not.toHaveTextContent(/pin/i);
    expect(pin.querySelector('svg')).toHaveClass('fill-current', 'text-primary');
    expect(screen.getByRole('heading', { name: 'Test Project' }).parentElement).toContainElement(
      pin
    );
  });

  it('shows the status pill next to the title for active projects too', async () => {
    renderProject('/projects/project-1');

    const heading = await screen.findByRole('heading', { name: 'Test Project' });
    expect(heading.parentElement).toHaveTextContent('Active');
  });

  it('explains an unknown project', async () => {
    renderProject('/projects/missing');

    expect(
      await screen.findByText('This project does not exist or was deleted.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All Projects' })).toHaveAttribute('href', '/projects');
  });
});
